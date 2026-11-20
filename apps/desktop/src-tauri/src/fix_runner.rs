use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use chrono::Utc;
use fix_client::{
    executable as stunnel_executable, generate_config, loopback_address, parse_port,
    prepare_application_body, run_connected, SessionConfig, StunnelConfigInput,
};
use rust_core::dto::{
    FixConnectRequest, FixEventKind, FixLogLevel, FixSessionEvent, FixSessionStatus, FixTransport,
};
use rust_core::variable::substitute_json;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;
use tokio::process::{Child, Command};
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

const CONNECT_RETRY_WINDOW: Duration = Duration::from_secs(10);
const CONNECT_RETRY_DELAY: Duration = Duration::from_millis(200);

#[derive(Clone)]
struct SessionHandle {
    outbound: mpsc::Sender<String>,
    cancel: watch::Sender<bool>,
}

fn sessions() -> &'static Mutex<HashMap<String, SessionHandle>> {
    static SESSIONS: OnceLock<Mutex<HashMap<String, SessionHandle>>> = OnceLock::new();
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Connects one independent FIX client session and blocks until it ends.
///
/// # Errors
///
/// Returns a setup error such as an invalid resolved configuration, unavailable
/// stunnel executable, or duplicate active session.
pub async fn connect_fix_session(
    request: FixConnectRequest,
    variables: HashMap<String, String>,
    session_id: String,
    events: mpsc::UnboundedSender<FixSessionEvent>,
) -> Result<(), String> {
    if session_id.trim().is_empty() {
        return Err("FIX session id cannot be empty".to_string());
    }
    {
        let registry = sessions()
            .lock()
            .map_err(|_| "FIX session registry is unavailable".to_string())?;
        if registry.contains_key(&session_id) {
            return Err(format!("FIX session '{session_id}' is already active"));
        }
    }

    let resolved = resolve_config(&request, &variables)?;
    execute_session(resolved, session_id, events).await
}

/// Queues one environment-resolved application message for an active FIX session.
///
/// # Errors
///
/// Returns an error when the session is not active, a variable is missing, or
/// the outbound queue closes.
pub async fn send_fix_message(
    session_id: &str,
    raw: String,
    variables: &HashMap<String, String>,
) -> Result<(), String> {
    let sender = {
        let registry = sessions()
            .lock()
            .map_err(|_| "FIX session registry is unavailable".to_string())?;
        registry
            .get(session_id)
            .map(|handle| handle.outbound.clone())
            .ok_or_else(|| format!("FIX session '{session_id}' is not active"))?
    };
    let resolved = rust_core::variable::substitute_variables(&raw, variables)
        .map_err(|error| format!("FIX message variable error: {error}"))?;
    prepare_application_body(&resolved).map_err(|error| error.to_string())?;
    sender
        .send(resolved)
        .await
        .map_err(|_| "FIX session closed before the message could be queued".to_string())
}

/// Requests a graceful FIX logout and transport shutdown.
///
/// The session stays registered until its task exits so a reconnect cannot race
/// the previous session's cleanup.
pub fn disconnect_fix_session(session_id: &str) -> bool {
    let cancel = sessions()
        .lock()
        .ok()
        .and_then(|registry| registry.get(session_id).map(|handle| handle.cancel.clone()));
    match cancel {
        Some(cancel) => cancel.send(true).is_ok(),
        None => false,
    }
}

fn resolve_config(
    request: &FixConnectRequest,
    variables: &HashMap<String, String>,
) -> Result<FixConnectRequest, String> {
    let value = serde_json::to_value(request)
        .map_err(|error| format!("failed to prepare FIX configuration: {error}"))?;
    let substituted = substitute_json(&value, variables)
        .map_err(|error| format!("FIX environment variable error: {error}"))?;
    let mut resolved: FixConnectRequest = serde_json::from_value(substituted)
        .map_err(|error| format!("invalid FIX configuration: {error}"))?;
    resolved.port = resolved.port.trim().to_string();
    resolved.host = resolved.host.trim().trim_matches(['[', ']']).to_string();
    resolved.begin_string = resolved.begin_string.trim().to_string();
    resolved.sender_comp_id = resolved.sender_comp_id.trim().to_string();
    resolved.target_comp_id = resolved.target_comp_id.trim().to_string();
    resolved.stunnel.executable = resolved.stunnel.executable.trim().to_string();
    resolved.stunnel.local_host = resolved.stunnel.local_host.trim().to_string();
    resolved.stunnel.local_port = resolved.stunnel.local_port.trim().to_string();
    resolved.stunnel.ca_file = resolved.stunnel.ca_file.trim().to_string();
    resolved.stunnel.client_cert_file = resolved.stunnel.client_cert_file.trim().to_string();
    resolved.stunnel.client_key_file = resolved.stunnel.client_key_file.trim().to_string();
    Ok(resolved)
}

async fn execute_session(
    request: FixConnectRequest,
    session_id: String,
    events: mpsc::UnboundedSender<FixSessionEvent>,
) -> Result<(), String> {
    let config = SessionConfig {
        begin_string: request.begin_string.clone(),
        sender_comp_id: request.sender_comp_id.clone(),
        target_comp_id: request.target_comp_id.clone(),
        heartbeat_seconds: request.heartbeat_seconds,
        username: request.username.clone(),
        password: request.password.clone(),
        reset_seq_num_on_logon: request.reset_seq_num_on_logon,
    };
    config.validate().map_err(|error| error.to_string())?;

    emit_state(
        &events,
        FixSessionStatus::Connecting,
        Some(transport_label(&request)),
    );

    let remote_port =
        parse_port(&request.port, "FIX remote port").map_err(|error| error.to_string())?;
    if request.host.is_empty() {
        return fail_session(
            &events,
            &session_id,
            "FIX remote host cannot be empty".to_string(),
        );
    }

    let mut managed_stunnel: Option<ManagedStunnel> = None;
    let target_address = match request.transport {
        FixTransport::Direct => {
            let address = format_host_port(&request.host, remote_port);
            emit_transport(
                &events,
                FixLogLevel::Info,
                &format!("connecting directly to {address}"),
            );
            address
        }
        FixTransport::StunnelExternal => {
            let address =
                loopback_address(&request.stunnel.local_host, &request.stunnel.local_port)
                    .map_err(|error| error.to_string())?;
            emit_transport(
                &events,
                FixLogLevel::Info,
                &format!("connecting to external stunnel at {address}"),
            );
            address.to_string()
        }
        FixTransport::StunnelManaged => {
            let (stunnel, address) =
                start_managed_stunnel(&request, &session_id, remote_port, &events).await?;
            emit_transport(
                &events,
                FixLogLevel::Info,
                &format!("managed stunnel ready at {address}"),
            );
            managed_stunnel = Some(stunnel);
            address.to_string()
        }
    };

    emit_state(&events, FixSessionStatus::Connecting, None);
    let stream = match connect_with_retry(&target_address, true, managed_stunnel.as_mut()).await {
        Ok(stream) => stream,
        Err(error) => {
            if let Some(mut stunnel) = managed_stunnel {
                stunnel.shutdown().await;
            }
            return fail_session(&events, &session_id, error);
        }
    };

    let (outbound_tx, mut outbound_rx) = mpsc::channel(64);
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    {
        let mut registry = sessions()
            .lock()
            .map_err(|_| "FIX session registry is unavailable".to_string())?;
        if registry.contains_key(&session_id) {
            return fail_session(
                &events,
                &session_id,
                "a FIX session with this id became active concurrently".to_string(),
            );
        }
        registry.insert(
            session_id.clone(),
            SessionHandle {
                outbound: outbound_tx,
                cancel: cancel_tx,
            },
        );
    }

    let result = run_connected(stream, config, &mut outbound_rx, &mut cancel_rx, &events).await;
    if let Ok(mut registry) = sessions().lock() {
        registry.remove(&session_id);
    }
    if let Some(mut stunnel) = managed_stunnel {
        stunnel.shutdown().await;
    }

    match result {
        Ok(()) => {
            emit_state(&events, FixSessionStatus::Disconnected, None);
            Ok(())
        }
        Err(error) => fail_session(&events, &session_id, error.to_string()),
    }
}

fn fail_session(
    events: &mpsc::UnboundedSender<FixSessionEvent>,
    _session_id: &str,
    detail: String,
) -> Result<(), String> {
    let _ = events.send(FixSessionEvent {
        kind: FixEventKind::Error,
        timestamp: Utc::now(),
        status: Some(FixSessionStatus::Error),
        level: Some(FixLogLevel::Error),
        detail: Some(detail.clone()),
        message: None,
    });
    emit_state(events, FixSessionStatus::Disconnected, None);
    Err(detail)
}

fn transport_label(request: &FixConnectRequest) -> String {
    match request.transport {
        FixTransport::Direct => "direct TCP".to_string(),
        FixTransport::StunnelManaged => "managed stunnel".to_string(),
        FixTransport::StunnelExternal => "external stunnel".to_string(),
    }
}

fn format_host_port(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

async fn connect_with_retry(
    address: &str,
    retry: bool,
    mut stunnel: Option<&mut ManagedStunnel>,
) -> Result<TcpStream, String> {
    let deadline = tokio::time::Instant::now() + CONNECT_RETRY_WINDOW;
    loop {
        if let Some(process) = stunnel.as_deref_mut() {
            let status = process
                .child
                .as_mut()
                .map(|child| child.try_wait())
                .transpose()
                .map_err(|error| format!("failed to inspect stunnel process: {error}"))?
                .flatten();
            if let Some(status) = status {
                let recent = process.recent_output();
                return Err(format!(
                    "stunnel exited with {status} before its listener became available{}",
                    recent.map(|lines| format!(": {lines}")).unwrap_or_default()
                ));
            }
        }

        match TcpStream::connect(address).await {
            Ok(stream) => return Ok(stream),
            Err(error) => {
                if !retry || tokio::time::Instant::now() >= deadline {
                    return Err(format!("failed to connect to {address}: {error}"));
                }
                tokio::time::sleep(CONNECT_RETRY_DELAY).await;
            }
        }
    }
}

async fn start_managed_stunnel(
    request: &FixConnectRequest,
    _session_id: &str,
    remote_port: u16,
    events: &mpsc::UnboundedSender<FixSessionEvent>,
) -> Result<(ManagedStunnel, std::net::SocketAddr), String> {
    let local_host = if request.stunnel.local_host.is_empty() {
        "127.0.0.1"
    } else {
        request.stunnel.local_host.as_str()
    };
    let local_port = if request.stunnel.local_port.is_empty() {
        reserve_loopback_port(local_host).await?
    } else {
        parse_port(&request.stunnel.local_port, "stunnel local port")
            .map_err(|error| error.to_string())?
    };
    let local_address =
        loopback_address(local_host, &local_port.to_string()).map_err(|error| error.to_string())?;

    let config_text = generate_config(&StunnelConfigInput {
        local_host,
        local_port,
        remote_host: &request.host,
        remote_port,
        ca_file: &request.stunnel.ca_file,
        client_cert_file: &request.stunnel.client_cert_file,
        client_key_file: &request.stunnel.client_key_file,
        verify_peer: request.stunnel.verify_peer,
    })
    .map_err(|error| error.to_string())?;

    let config_path =
        std::env::temp_dir().join(format!("api-lab-fix-{}.conf", uuid::Uuid::new_v4()));
    tokio::fs::write(&config_path, config_text)
        .await
        .map_err(|error| format!("failed to write stunnel config: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ =
            tokio::fs::set_permissions(&config_path, std::fs::Permissions::from_mode(0o600)).await;
    }

    let executable = stunnel_executable(&request.stunnel.executable);
    let mut command = Command::new(executable);
    command
        .arg(&config_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = command.spawn().map_err(|error| {
        let _ = std::fs::remove_file(&config_path);
        format!("failed to start stunnel '{executable}': {error}")
    })?;

    let recent_output = Arc::new(Mutex::new(VecDeque::with_capacity(12)));
    let mut log_tasks = Vec::new();
    if let Some(stdout) = child.stdout.take() {
        log_tasks.push(spawn_log_reader(
            stdout,
            "stunnel",
            events.clone(),
            recent_output.clone(),
        ));
    }
    if let Some(stderr) = child.stderr.take() {
        log_tasks.push(spawn_log_reader(
            stderr,
            "stunnel",
            events.clone(),
            recent_output.clone(),
        ));
    }

    Ok((
        ManagedStunnel {
            child: Some(child),
            config_path,
            log_tasks,
            recent_output,
        },
        local_address,
    ))
}

async fn reserve_loopback_port(host: &str) -> Result<u16, String> {
    let listener = tokio::net::TcpListener::bind((host, 0))
        .await
        .map_err(|error| format!("failed to reserve a stunnel loopback port: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("failed to inspect the stunnel loopback port: {error}"))?;
    if !address.ip().is_loopback() {
        return Err("managed stunnel must listen on a loopback interface".to_string());
    }
    Ok(address.port())
}

fn spawn_log_reader<R>(
    reader: R,
    source: &'static str,
    events: mpsc::UnboundedSender<FixSessionEvent>,
    recent_output: Arc<Mutex<VecDeque<String>>>,
) -> JoinHandle<()>
where
    R: tokio::io::AsyncRead + Unpin + Send + 'static,
{
    tokio::spawn(async move {
        let mut lines = BufReader::new(reader).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(mut recent) = recent_output.lock() {
                if recent.len() >= 12 {
                    recent.pop_front();
                }
                recent.push_back(trimmed.to_string());
            }
            let lower = trimmed.to_ascii_lowercase();
            let level = if lower.contains("error") || lower.contains("fail") {
                FixLogLevel::Error
            } else if lower.contains("warn") {
                FixLogLevel::Warn
            } else {
                FixLogLevel::Info
            };
            emit_transport(&events, level, &format!("{source}: {trimmed}"));
        }
    })
}

struct ManagedStunnel {
    child: Option<Child>,
    config_path: PathBuf,
    log_tasks: Vec<JoinHandle<()>>,
    recent_output: Arc<Mutex<VecDeque<String>>>,
}

impl ManagedStunnel {
    fn recent_output(&self) -> Option<String> {
        let recent = self.recent_output.lock().ok()?;
        if recent.is_empty() {
            None
        } else {
            Some(recent.iter().cloned().collect::<Vec<_>>().join(" | "))
        }
    }

    async fn shutdown(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill().await;
            let _ = child.wait().await;
        }
        for task in self.log_tasks.drain(..) {
            task.abort();
            let _ = task.await;
        }
        let _ = tokio::fs::remove_file(&self.config_path).await;
    }
}

impl Drop for ManagedStunnel {
    fn drop(&mut self) {
        if let Some(child) = self.child.as_mut() {
            let _ = child.start_kill();
        }
        let _ = std::fs::remove_file(&self.config_path);
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
    detail: &str,
) {
    let _ = events.send(FixSessionEvent {
        kind: FixEventKind::Transport,
        timestamp: Utc::now(),
        status: None,
        level: Some(level),
        detail: Some(detail.to_string()),
        message: None,
    });
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use fix_client::{encode_message, FixFrameDecoder, FixMessage};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    use super::*;

    #[tokio::test]
    async fn runner_connects_sends_and_disconnects() {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("bind listener");
        let address = listener.local_addr().expect("listener address");
        let server_task = tokio::spawn(async move {
            let (socket, _) = listener.accept().await.expect("accept FIX client");
            let (mut reader, mut writer) = socket.into_split();
            let mut decoder = FixFrameDecoder::new();
            let mut buffer = [0_u8; 4096];

            let logon = read_next(&mut reader, &mut decoder, &mut buffer)
                .await
                .expect("read logon");
            assert_eq!(logon.message_type, "A");
            assert_eq!(logon.value("553"), Some("runner-user"));

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
                .expect("read application message");
            assert_eq!(application.message_type, "D");
            assert_eq!(application.value("11"), Some("RUNNER-ORDER-1"));

            let execution = encode_message(
                "FIX.4.4",
                "SERVER",
                "CLIENT",
                2,
                Utc::now(),
                &[
                    ("35".to_string(), "8".to_string()),
                    ("150".to_string(), "0".to_string()),
                    ("11".to_string(), "RUNNER-ORDER-1".to_string()),
                ],
            )
            .expect("encode execution report");
            writer
                .write_all(execution.as_bytes())
                .await
                .expect("write execution report");

            let logout = read_next(&mut reader, &mut decoder, &mut buffer)
                .await
                .expect("read logout");
            assert_eq!(logout.message_type, "5");
        });

        let session_id = format!("fix-runner-{}", uuid::Uuid::new_v4());
        let request = FixConnectRequest {
            host: "127.0.0.1".to_string(),
            port: address.port().to_string(),
            sender_comp_id: "CLIENT".to_string(),
            target_comp_id: "SERVER".to_string(),
            username: "{{FIX_USERNAME}}".to_string(),
            transport: FixTransport::Direct,
            ..FixConnectRequest::default()
        };
        let variables = HashMap::from([("FIX_USERNAME".to_string(), "runner-user".to_string())]);
        let (events_tx, mut events_rx) = mpsc::unbounded_channel();
        let connect_task = tokio::spawn(connect_fix_session(
            request,
            variables,
            session_id.clone(),
            events_tx,
        ));

        wait_for_status(&mut events_rx, FixSessionStatus::LoggedOn).await;
        send_fix_message(
            &session_id,
            "35=D|11=RUNNER-ORDER-1|55={{SYMBOL}}".to_string(),
            &HashMap::from([("SYMBOL".to_string(), "AAPL".to_string())]),
        )
        .await
        .expect("queue application message");
        wait_for_message(&mut events_rx, "8").await;
        assert!(disconnect_fix_session(&session_id));

        let result = tokio::time::timeout(Duration::from_secs(3), connect_task)
            .await
            .expect("connect task completes")
            .expect("connect task joins");
        assert!(result.is_ok(), "runner returned {result:?}");
        server_task.await.expect("server task joins");
    }

    #[tokio::test]
    async fn managed_stunnel_reports_missing_executable() {
        let request = FixConnectRequest {
            host: "127.0.0.1".to_string(),
            port: "9876".to_string(),
            transport: FixTransport::StunnelManaged,
            stunnel: rust_core::dto::FixStunnelOptions {
                executable: format!("api-lab-stunnel-missing-{}", uuid::Uuid::new_v4()),
                ..rust_core::dto::FixStunnelOptions::default()
            },
            ..FixConnectRequest::default()
        };
        let (events_tx, mut events_rx) = mpsc::unbounded_channel();
        let result = connect_fix_session(
            request,
            HashMap::new(),
            format!("fix-missing-stunnel-{}", uuid::Uuid::new_v4()),
            events_tx,
        )
        .await;
        let error = result.expect_err("missing stunnel must fail");
        assert!(
            error.contains("failed to start stunnel"),
            "unexpected error: {error}"
        );
        assert!(
            events_rx.try_recv().is_ok(),
            "connection setup should report lifecycle events"
        );
    }

    async fn read_next(
        reader: &mut tokio::net::tcp::OwnedReadHalf,
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
        tokio::time::timeout(Duration::from_secs(3), find)
            .await
            .expect("status timeout");
    }

    async fn wait_for_message(
        events_rx: &mut mpsc::UnboundedReceiver<FixSessionEvent>,
        message_type: &str,
    ) {
        let find = async {
            while let Some(event) = events_rx.recv().await {
                if event
                    .message
                    .as_ref()
                    .is_some_and(|message| message.message_type == message_type)
                {
                    return;
                }
            }
            panic!("event channel closed before message {message_type}");
        };
        tokio::time::timeout(Duration::from_secs(3), find)
            .await
            .expect("message timeout");
    }
}
