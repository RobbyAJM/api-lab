//! A FIX 4.2/4.4 initiator session over an established TCP stream.

use std::time::Duration;

use chrono::Utc;
use rust_core::dto::{FixDirection, FixEventKind, FixLogLevel, FixSessionEvent, FixSessionStatus};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::tcp::OwnedWriteHalf;
use tokio::net::TcpStream;
use tokio::sync::{mpsc, watch};
use tokio::time::{Instant, MissedTickBehavior};

use crate::codec::{encode_message, parse_message, prepare_application_body, FixMessage};
use crate::error::FixError;

/// Session-owned settings resolved from the endpoint configuration.
#[derive(Debug, Clone)]
pub struct SessionConfig {
    pub begin_string: String,
    pub sender_comp_id: String,
    pub target_comp_id: String,
    pub heartbeat_seconds: u32,
    pub username: String,
    pub password: String,
    pub reset_seq_num_on_logon: bool,
}

impl SessionConfig {
    /// Validates the session settings before a socket is opened.
    ///
    /// # Errors
    ///
    /// Returns an error when required identifiers are empty or values could
    /// inject FIX delimiters.
    pub fn validate(&self) -> Result<(), FixError> {
        for (name, value) in [
            ("BeginString", self.begin_string.as_str()),
            ("SenderCompID", self.sender_comp_id.as_str()),
            ("TargetCompID", self.target_comp_id.as_str()),
        ] {
            if value.trim().is_empty() {
                return Err(FixError::Config(format!("{name} cannot be empty")));
            }
            if value.contains(['\u{1}', '|', '\r', '\n']) {
                return Err(FixError::Config(format!(
                    "{name} contains an invalid delimiter"
                )));
            }
        }
        if !self.begin_string.starts_with("FIX.") {
            return Err(FixError::Config(
                "BeginString must begin with FIX.".to_string(),
            ));
        }
        if self.heartbeat_seconds == 0 || self.heartbeat_seconds > 3600 {
            return Err(FixError::Config(
                "heartbeat interval must be between 1 and 3600 seconds".to_string(),
            ));
        }
        Ok(())
    }
}

/// Runs a FIX logon, heartbeat, application-message, and logout loop on `stream`.
///
/// The caller owns connection setup (including stunnel) and maps the returned
/// result into a final UI status. The session emits state and message events.
///
/// # Errors
///
/// Returns on connection I/O failure, protocol/sequence violations, or when the
/// counterparty requests unsupported session recovery.
pub async fn run_connected(
    stream: TcpStream,
    config: SessionConfig,
    outbound_rx: &mut mpsc::Receiver<String>,
    cancel_rx: &mut watch::Receiver<bool>,
    events: &mpsc::UnboundedSender<FixSessionEvent>,
) -> Result<(), FixError> {
    config.validate()?;
    stream.set_nodelay(true)?;
    let (mut reader, mut writer) = stream.into_split();
    let mut sequence_number = 1_u64;
    let mut expected_inbound = 1_u64;
    let mut logged_on = false;
    let mut last_inbound = Instant::now();
    let mut test_request: Option<(String, Instant)> = None;

    emit_state(events, FixSessionStatus::TransportReady, None);

    let logon_body = logon_fields(&config);
    send_body(
        &mut writer,
        &config,
        &mut sequence_number,
        &logon_body,
        events,
    )
    .await?;
    let mut last_sent = Instant::now();
    emit_state(events, FixSessionStatus::LogonSent, None);

    let heartbeat_period = Duration::from_secs(u64::from(config.heartbeat_seconds));
    let logon_deadline = Instant::now() + Duration::from_secs(10);
    let mut heartbeat = tokio::time::interval(heartbeat_period.min(Duration::from_secs(5)));
    heartbeat.set_missed_tick_behavior(MissedTickBehavior::Delay);
    heartbeat.tick().await;

    let mut read_buffer = vec![0_u8; 16 * 1024];
    let mut decoder = crate::codec::FixFrameDecoder::new();
    let mut outbound_open = true;

    loop {
        tokio::select! {
            biased;
            _ = wait_for_cancel(cancel_rx) => {
                emit_state(events, FixSessionStatus::Disconnecting, Some("logout requested".to_string()));
                if logged_on {
                    let logout = vec![("35".to_string(), "5".to_string())];
                    let _ = tokio::time::timeout(
                        Duration::from_secs(2),
                        send_body(&mut writer, &config, &mut sequence_number, &logout, events),
                    )
                    .await;
                }
                return Ok(());
            }
            read = reader.read(&mut read_buffer) => {
                let read = read?;
                if read == 0 {
                    return Err(FixError::Protocol("counterparty closed the connection".to_string()));
                }
                let messages = decoder.push(&read_buffer[..read])?;
                for message in messages {
                    let now = Instant::now();
                    last_inbound = now;
                    if message.message_type != "0" {
                        test_request = None;
                    }
                    let sequence = message.sequence_number.ok_or_else(|| {
                        FixError::Protocol("inbound message is missing MsgSeqNum tag 34".to_string())
                    })?;

                    if sequence != expected_inbound {
                        return Err(FixError::Protocol(format!(
                            "inbound sequence mismatch: expected {expected_inbound}, received {sequence}. Reconnect with reset sequence enabled."
                        )));
                    }
                    expected_inbound = expected_inbound.saturating_add(1);
                    emit_message(events, &message, FixDirection::In);

                    if message.value("8") != Some(config.begin_string.as_str()) {
                        return Err(FixError::Protocol(format!(
                            "BeginString mismatch: expected {}, received {}",
                            config.begin_string,
                            message.value("8").unwrap_or("<missing>")
                        )));
                    }

                    match message.message_type.as_str() {
                        "A" => {
                            if logged_on {
                                emit_transport(events, FixLogLevel::Warn, "received a duplicate Logon");
                            } else {
                                logged_on = true;
                                test_request = None;
                                emit_state(events, FixSessionStatus::LoggedOn, None);
                            }
                        }
                        "0" => {
                            if let Some((_, sent_at)) = test_request.take() {
                                emit_transport(
                                    events,
                                    FixLogLevel::Info,
                                    &format!(
                                        "heartbeat received after {} ms",
                                        sent_at.elapsed().as_millis()
                                    ),
                                );
                            }
                        }
                        "1" => {
                            let test_id = message.value("112").unwrap_or("").to_string();
                            let body = vec![
                                ("35".to_string(), "0".to_string()),
                                ("112".to_string(), test_id),
                            ];
                            send_body(&mut writer, &config, &mut sequence_number, &body, events).await?;
                            last_sent = Instant::now();
                        }
                        "2" => {
                            return Err(FixError::Unsupported(
                                "counterparty sent ResendRequest (35=2); persistent FIX sequence recovery is not supported in this build"
                                    .to_string(),
                            ));
                        }
                        "3" => {
                            let reason = message.value("58").unwrap_or("no reason supplied");
                            if !logged_on {
                                return Err(FixError::Protocol(format!(
                                    "Logon rejected by counterparty: {reason}"
                                )));
                            }
                            emit_transport(
                                events,
                                FixLogLevel::Warn,
                                &format!("counterparty rejected a message: {reason}"),
                            );
                        }
                        "4" => {
                            let requested = message
                                .value("36")
                                .ok_or_else(|| {
                                    FixError::Protocol(
                                        "SequenceReset is missing NewSeqNo tag 36".to_string(),
                                    )
                                })?
                                .parse::<u64>()
                                .map_err(|_| {
                                    FixError::Protocol(
                                        "SequenceReset NewSeqNo must be an unsigned integer".to_string(),
                                    )
                                })?;
                            if requested == 0 {
                                return Err(FixError::Protocol(
                                    "SequenceReset NewSeqNo cannot be zero".to_string(),
                                ));
                            }
                            expected_inbound = requested;
                            emit_transport(
                                events,
                                FixLogLevel::Warn,
                                &format!("counterparty reset inbound sequence to {requested}"),
                            );
                        }
                        "5" => {
                            if !logged_on {
                                let reason = message
                                    .value("58")
                                    .unwrap_or("counterparty closed the session");
                                return Err(FixError::Protocol(format!(
                                    "Logon failed: {reason}"
                                )));
                            }
                            emit_state(
                                events,
                                FixSessionStatus::Disconnecting,
                                Some("logout received".to_string()),
                            );
                            let logout = vec![("35".to_string(), "5".to_string())];
                            let _ = tokio::time::timeout(
                                Duration::from_secs(2),
                                send_body(
                                    &mut writer,
                                    &config,
                                    &mut sequence_number,
                                    &logout,
                                    events,
                                ),
                            )
                            .await;
                            return Ok(());
                        }
                        _ => {}
                    }
                }
            }
            outbound = outbound_rx.recv(), if outbound_open => {
                let Some(raw) = outbound else {
                    outbound_open = false;
                    continue;
                };
                if !logged_on {
                    emit_transport(events, FixLogLevel::Warn, "application message ignored until Logon completes");
                    continue;
                }
                let body = match prepare_application_body(&raw) {
                    Ok(body) => body,
                    Err(error) => {
                        emit_transport(events, FixLogLevel::Error, &error.to_string());
                        continue;
                    }
                };
                if let Err(error) = send_body(
                    &mut writer,
                    &config,
                    &mut sequence_number,
                    &body,
                    events,
                )
                .await
                {
                    emit_transport(events, FixLogLevel::Error, &error.to_string());
                    return Err(error);
                }
                last_sent = Instant::now();
            }
            _ = heartbeat.tick() => {
                if !logged_on {
                    if Instant::now() >= logon_deadline {
                        return Err(FixError::Protocol(
                            "Logon response timed out after 10 seconds".to_string(),
                        ));
                    }
                    continue;
                }
                if let Some((test_id, sent_at)) = &test_request {
                    if sent_at.elapsed() >= heartbeat_period {
                        return Err(FixError::Protocol(format!(
                            "no response to TestRequest {test_id} within {} seconds",
                            config.heartbeat_seconds
                        )));
                    }
                } else if last_inbound.elapsed() >= heartbeat_period.mul_f64(1.5) {
                    let test_id = format!("TEST-{}", Utc::now().timestamp_millis());
                    let body = vec![
                        ("35".to_string(), "1".to_string()),
                        ("112".to_string(), test_id.clone()),
                    ];
                    send_body(&mut writer, &config, &mut sequence_number, &body, events).await?;
                    last_sent = Instant::now();
                    test_request = Some((test_id, Instant::now()));
                    emit_transport(events, FixLogLevel::Warn, "sent TestRequest after inbound silence");
                }

                if last_sent.elapsed() >= heartbeat_period {
                    let body = vec![("35".to_string(), "0".to_string())];
                    send_body(&mut writer, &config, &mut sequence_number, &body, events).await?;
                    last_sent = Instant::now();
                }
            }
        }
    }
}

fn logon_fields(config: &SessionConfig) -> Vec<(String, String)> {
    let mut fields = vec![
        ("35".to_string(), "A".to_string()),
        ("98".to_string(), "0".to_string()),
        ("108".to_string(), config.heartbeat_seconds.to_string()),
    ];
    if config.reset_seq_num_on_logon {
        fields.push(("141".to_string(), "Y".to_string()));
    }
    if !config.username.is_empty() {
        fields.push(("553".to_string(), config.username.clone()));
    }
    if !config.password.is_empty() {
        fields.push(("554".to_string(), config.password.clone()));
    }
    fields
}

async fn send_body(
    writer: &mut OwnedWriteHalf,
    config: &SessionConfig,
    sequence_number: &mut u64,
    body: &[(String, String)],
    events: &mpsc::UnboundedSender<FixSessionEvent>,
) -> Result<(), FixError> {
    let raw = encode_message(
        &config.begin_string,
        &config.sender_comp_id,
        &config.target_comp_id,
        *sequence_number,
        Utc::now(),
        body,
    )?;
    writer.write_all(raw.as_bytes()).await?;
    writer.flush().await?;
    *sequence_number = sequence_number.saturating_add(1);
    let message = parse_message(&raw)?;
    emit_message(events, &message, FixDirection::Out);
    Ok(())
}

async fn wait_for_cancel(cancel_rx: &mut watch::Receiver<bool>) {
    loop {
        if *cancel_rx.borrow() {
            return;
        }
        if cancel_rx.changed().await.is_err() {
            return;
        }
    }
}

fn emit_state(
    events: &mpsc::UnboundedSender<FixSessionEvent>,
    status: FixSessionStatus,
    detail: Option<String>,
) {
    let _ = events.send(FixSessionEvent {
        kind: FixEventKind::State,
        timestamp: Utc::now(),
        status: Some(status),
        level: None,
        detail,
        message: None,
    });
}

fn emit_transport(
    events: &mpsc::UnboundedSender<FixSessionEvent>,
    level: FixLogLevel,
    message: &str,
) {
    let _ = events.send(FixSessionEvent {
        kind: FixEventKind::Transport,
        timestamp: Utc::now(),
        status: None,
        level: Some(level),
        detail: Some(message.to_string()),
        message: None,
    });
}

fn emit_message(
    events: &mpsc::UnboundedSender<FixSessionEvent>,
    message: &FixMessage,
    direction: FixDirection,
) {
    let _ = events.send(FixSessionEvent {
        kind: FixEventKind::Message,
        timestamp: Utc::now(),
        status: None,
        level: None,
        detail: None,
        message: Some(message.event(direction, Utc::now())),
    });
}

#[cfg(test)]
mod tests {
    use chrono::Utc;
    use rust_core::dto::{FixEventKind, FixMessageEvent};
    use tokio::net::tcp::OwnedReadHalf;
    use tokio::net::TcpListener;

    use super::*;
    use crate::codec::{encode_message, FixFrameDecoder};

    fn assert_send<T: Send>(_value: T) {}

    #[test]
    fn session_future_is_send() {
        fn future_is_send() {
            let config = SessionConfig {
                begin_string: "FIX.4.4".to_string(),
                sender_comp_id: "C".to_string(),
                target_comp_id: "S".to_string(),
                heartbeat_seconds: 30,
                username: String::new(),
                password: String::new(),
                reset_seq_num_on_logon: true,
            };
            let (events, _) = mpsc::unbounded_channel();
            let (_outbound_tx, mut outbound_rx) = mpsc::channel(1);
            let (_cancel_tx, mut cancel_rx) = watch::channel(false);
            assert_send(async move {
                let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
                let addr = listener.local_addr().expect("addr");
                let client = TcpStream::connect(addr).await.expect("client");
                let (_server, _) = listener.accept().await.expect("accept");
                run_connected(client, config, &mut outbound_rx, &mut cancel_rx, &events).await
            });
        }
        let _ = future_is_send;
    }

    #[tokio::test]
    async fn logs_on_sends_application_and_logs_out() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let address = listener.local_addr().expect("listener address");

        let server_task = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.expect("accept client");
            let (mut reader, mut writer) = socket.into_split();
            let mut decoder = FixFrameDecoder::new();
            let mut buffer = [0_u8; 4096];

            let logon = read_next(&mut reader, &mut decoder, &mut buffer)
                .await
                .expect("read logon");
            assert_eq!(logon.message_type, "A");
            assert_eq!(logon.sequence_number, Some(1));

            let logon_ack = encode_message(
                "FIX.4.4",
                "SERVER",
                "CLIENT",
                1,
                Utc::now(),
                &[
                    ("35".to_string(), "A".to_string()),
                    ("98".to_string(), "0".to_string()),
                ],
            )
            .expect("encode logon ack");
            writer
                .write_all(logon_ack.as_bytes())
                .await
                .expect("write logon ack");

            let application = read_next(&mut reader, &mut decoder, &mut buffer)
                .await
                .expect("read app message");
            assert_eq!(application.message_type, "D");
            assert_eq!(application.value("11"), Some("ORDER-1"));
            assert_eq!(application.sequence_number, Some(2));

            let inbound = encode_message(
                "FIX.4.4",
                "SERVER",
                "CLIENT",
                2,
                Utc::now(),
                &[
                    ("35".to_string(), "8".to_string()),
                    ("150".to_string(), "F".to_string()),
                ],
            )
            .expect("encode execution report");
            writer
                .write_all(inbound.as_bytes())
                .await
                .expect("write execution report");
            tokio::time::sleep(Duration::from_millis(100)).await;
        });

        let client_socket = TcpStream::connect(address).await.expect("connect client");
        let config = SessionConfig {
            begin_string: "FIX.4.4".to_string(),
            sender_comp_id: "CLIENT".to_string(),
            target_comp_id: "SERVER".to_string(),
            heartbeat_seconds: 30,
            username: "demo".to_string(),
            password: "secret".to_string(),
            reset_seq_num_on_logon: true,
        };
        let (events_tx, mut events_rx) = mpsc::unbounded_channel();
        let (outbound_tx, mut outbound_rx) = mpsc::channel(4);
        let (cancel_tx, mut cancel_rx) = watch::channel(false);

        let session_task = tokio::spawn(async move {
            run_connected(
                client_socket,
                config,
                &mut outbound_rx,
                &mut cancel_rx,
                &events_tx,
            )
            .await
        });

        wait_for_status(&mut events_rx, FixSessionStatus::LoggedOn).await;
        outbound_tx
            .send("35=D|11=ORDER-1|55=AAPL|54=1|38=10|40=2".to_string())
            .await
            .expect("queue application");

        let execution_report = wait_for_message(&mut events_rx, "8").await;
        assert_eq!(execution_report.direction, FixDirection::In);

        cancel_tx.send(true).expect("request logout");
        let result = tokio::time::timeout(Duration::from_secs(2), session_task)
            .await
            .expect("session stops promptly")
            .expect("session task joins");
        assert!(result.is_ok(), "session returned {result:?}");

        server_task.await.expect("server task joins");
    }

    #[tokio::test]
    async fn responds_to_test_request_with_heartbeat() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let address = listener.local_addr().expect("listener address");

        let server_task = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.expect("accept client");
            let (mut reader, mut writer) = socket.into_split();
            let mut decoder = FixFrameDecoder::new();
            let mut buffer = [0_u8; 4096];

            let logon = read_next(&mut reader, &mut decoder, &mut buffer)
                .await
                .expect("read logon");
            assert_eq!(logon.message_type, "A");

            let logon_ack = encode_message(
                "FIX.4.4",
                "SERVER",
                "CLIENT",
                1,
                Utc::now(),
                &[
                    ("35".to_string(), "A".to_string()),
                    ("98".to_string(), "0".to_string()),
                ],
            )
            .expect("encode logon ack");
            writer
                .write_all(logon_ack.as_bytes())
                .await
                .expect("write logon ack");

            let test_request = encode_message(
                "FIX.4.4",
                "SERVER",
                "CLIENT",
                2,
                Utc::now(),
                &[
                    ("35".to_string(), "1".to_string()),
                    ("112".to_string(), "PROBE-1".to_string()),
                ],
            )
            .expect("encode test request");
            writer
                .write_all(test_request.as_bytes())
                .await
                .expect("write test request");

            let heartbeat = read_next(&mut reader, &mut decoder, &mut buffer)
                .await
                .expect("read heartbeat response");
            assert_eq!(heartbeat.message_type, "0");
            assert_eq!(heartbeat.value("112"), Some("PROBE-1"));
            assert_eq!(heartbeat.sequence_number, Some(2));
        });

        let client_socket = TcpStream::connect(address).await.expect("connect client");
        let config = SessionConfig {
            begin_string: "FIX.4.4".to_string(),
            sender_comp_id: "CLIENT".to_string(),
            target_comp_id: "SERVER".to_string(),
            heartbeat_seconds: 30,
            username: String::new(),
            password: String::new(),
            reset_seq_num_on_logon: true,
        };
        let (events_tx, mut events_rx) = mpsc::unbounded_channel();
        let (_outbound_tx, mut outbound_rx) = mpsc::channel(1);
        let (cancel_tx, mut cancel_rx) = watch::channel(false);
        let session_task = tokio::spawn(async move {
            run_connected(
                client_socket,
                config,
                &mut outbound_rx,
                &mut cancel_rx,
                &events_tx,
            )
            .await
        });

        wait_for_status(&mut events_rx, FixSessionStatus::LoggedOn).await;
        server_task.await.expect("server task joins");
        cancel_tx.send(true).expect("request logout");
        let result = tokio::time::timeout(Duration::from_secs(2), session_task)
            .await
            .expect("session stops promptly")
            .expect("session task joins");
        assert!(result.is_ok(), "session returned {result:?}");
    }

    #[tokio::test]
    async fn rejects_inbound_sequence_gap_without_fake_recovery() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let address = listener.local_addr().expect("listener address");

        let server_task = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.expect("accept client");
            let (mut reader, mut writer) = socket.into_split();
            let mut decoder = FixFrameDecoder::new();
            let mut buffer = [0_u8; 4096];
            let _ = read_next(&mut reader, &mut decoder, &mut buffer).await;
            let logon_ack = encode_message(
                "FIX.4.4",
                "SERVER",
                "CLIENT",
                5,
                Utc::now(),
                &[
                    ("35".to_string(), "A".to_string()),
                    ("98".to_string(), "0".to_string()),
                ],
            )
            .expect("encode logon ack");
            let _ = writer.write_all(logon_ack.as_bytes()).await;
            tokio::time::sleep(Duration::from_millis(100)).await;
        });

        let client_socket = TcpStream::connect(address).await.expect("connect client");
        let config = SessionConfig {
            begin_string: "FIX.4.4".to_string(),
            sender_comp_id: "CLIENT".to_string(),
            target_comp_id: "SERVER".to_string(),
            heartbeat_seconds: 30,
            username: String::new(),
            password: String::new(),
            reset_seq_num_on_logon: true,
        };
        let (events_tx, _events_rx) = mpsc::unbounded_channel();
        let (_outbound_tx, mut outbound_rx) = mpsc::channel(1);
        let (_cancel_tx, mut cancel_rx) = watch::channel(false);
        let result = tokio::time::timeout(
            Duration::from_secs(2),
            run_connected(
                client_socket,
                config,
                &mut outbound_rx,
                &mut cancel_rx,
                &events_tx,
            ),
        )
        .await
        .expect("session fails promptly")
        .expect_err("sequence gap must be rejected");
        assert!(result.to_string().contains("sequence mismatch"));
        server_task.await.expect("server task joins");
    }

    async fn read_next(
        reader: &mut OwnedReadHalf,
        decoder: &mut FixFrameDecoder,
        buffer: &mut [u8],
    ) -> Option<FixMessage> {
        let read = tokio::time::timeout(Duration::from_secs(2), reader.read(buffer))
            .await
            .expect("read timeout")
            .expect("read success");
        assert!(read > 0, "connection closed early");
        let mut messages = decoder.push(&buffer[..read]).expect("decode frame");
        assert_eq!(messages.len(), 1, "expected one frame per packet");
        messages.pop()
    }

    async fn wait_for_status(
        events_rx: &mut mpsc::UnboundedReceiver<FixSessionEvent>,
        wanted: FixSessionStatus,
    ) {
        let find = async {
            while let Some(event) = events_rx.recv().await {
                if event.kind == FixEventKind::State && event.status == Some(wanted) {
                    return;
                }
            }
            panic!("event channel closed before status {wanted:?}");
        };
        tokio::time::timeout(Duration::from_secs(2), find)
            .await
            .expect("status timeout");
    }

    async fn wait_for_message(
        events_rx: &mut mpsc::UnboundedReceiver<FixSessionEvent>,
        message_type: &str,
    ) -> FixMessageEvent {
        let find = async {
            while let Some(event) = events_rx.recv().await {
                if let Some(message) = event.message {
                    if message.message_type == message_type {
                        return message;
                    }
                }
            }
            panic!("event channel closed before message {message_type}");
        };
        tokio::time::timeout(Duration::from_secs(2), find)
            .await
            .expect("message timeout")
    }
}
