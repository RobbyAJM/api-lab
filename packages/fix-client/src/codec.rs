//! FIX tag/value framing, validation, and message encoding.

use std::fmt::Write as _;

use chrono::{DateTime, Utc};
use rust_core::dto::{FixDirection, FixMessageEvent, FixSensitiveField};

use crate::error::FixError;

pub const SOH: u8 = 0x01;
const MAX_FRAME_BYTES: usize = 2 * 1024 * 1024;

/// A parsed FIX field. Tags are kept as strings because all FIX tags are numeric.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixField {
    pub tag: String,
    pub value: String,
}

/// A validated FIX frame.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixMessage {
    pub raw: String,
    pub fields: Vec<FixField>,
    pub message_type: String,
    pub sequence_number: Option<u64>,
}

impl FixMessage {
    pub fn value(&self, tag: &str) -> Option<&str> {
        self.fields
            .iter()
            .find(|field| field.tag == tag)
            .map(|field| field.value.as_str())
    }

    pub fn is_admin(&self) -> bool {
        is_admin_message_type(&self.message_type)
    }

    pub fn event(&self, direction: FixDirection, timestamp: DateTime<Utc>) -> FixMessageEvent {
        let sensitive_fields = self
            .fields
            .iter()
            .enumerate()
            .filter(|(_, field)| is_sensitive_tag(&field.tag))
            .map(|(field_index, field)| FixSensitiveField {
                field_index,
                tag: field.tag.clone(),
                value: field.value.clone(),
            })
            .collect();
        let fields = self
            .fields
            .iter()
            .map(|field| (field.tag.clone(), redact_field(&field.tag, &field.value)))
            .collect();

        FixMessageEvent {
            direction,
            raw: redact_for_display(&self.raw),
            fields,
            sensitive_fields,
            message_type: self.message_type.clone(),
            sequence_number: self.sequence_number,
            is_admin: self.is_admin(),
            timestamp,
        }
    }
}

/// Incremental decoder for a TCP byte stream carrying one or more FIX frames.
#[derive(Debug, Default)]
pub struct FixFrameDecoder {
    buffer: Vec<u8>,
}

impl FixFrameDecoder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Adds bytes from the socket and returns every complete, validated message.
    ///
    /// # Errors
    ///
    /// Returns an error when the stream does not begin with a FIX BeginString,
    /// when BodyLength or CheckSum is malformed, or when a frame is too large.
    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<FixMessage>, FixError> {
        self.buffer.extend_from_slice(chunk);
        if self.buffer.len() > MAX_FRAME_BYTES {
            return Err(FixError::Protocol(format!(
                "frame exceeds the {MAX_FRAME_BYTES} byte safety limit"
            )));
        }

        let mut messages = Vec::new();
        while let Some(consumed) = parse_frame_length(&self.buffer)? {
            let frame: Vec<u8> = self.buffer.drain(..consumed).collect();
            messages.push(parse_complete_frame(&frame)?);
        }
        Ok(messages)
    }
}

fn parse_frame_length(buffer: &[u8]) -> Result<Option<usize>, FixError> {
    if buffer.is_empty() {
        return Ok(None);
    }
    if !buffer.starts_with(b"8=") {
        return Err(FixError::Protocol(
            "stream does not start with FIX tag 8 (BeginString)".to_string(),
        ));
    }

    let Some(begin_end) = find_soh(buffer, 0) else {
        return Ok(None);
    };
    let body_length_prefix = begin_end + 1;
    if buffer.len() < body_length_prefix + 2 {
        return Ok(None);
    }
    if !buffer[body_length_prefix..].starts_with(b"9=") {
        return Err(FixError::Protocol(
            "BeginString must be followed by BodyLength (tag 9)".to_string(),
        ));
    }
    let Some(body_length_end) = find_soh(buffer, body_length_prefix) else {
        return Ok(None);
    };
    let body_length = parse_u64(
        &buffer[body_length_prefix + 2..body_length_end],
        "BodyLength",
    )?;
    let body_length = usize::try_from(body_length)
        .map_err(|_| FixError::Protocol("BodyLength is too large".to_string()))?;
    let body_start = body_length_end + 1;
    let checksum_start = body_start.saturating_add(body_length);

    if checksum_start + 4 > buffer.len() {
        if checksum_start > buffer.len().saturating_add(MAX_FRAME_BYTES) {
            return Err(FixError::Protocol(
                "BodyLength exceeds frame limit".to_string(),
            ));
        }
        return Ok(None);
    }
    if !buffer[checksum_start..].starts_with(b"10=") {
        return Err(FixError::Protocol(
            "BodyLength does not end immediately before CheckSum tag 10".to_string(),
        ));
    }
    let Some(checksum_end) = find_soh(buffer, checksum_start) else {
        return Ok(None);
    };
    let expected_checksum = parse_u64(&buffer[checksum_start + 3..checksum_end], "CheckSum")?;
    let actual_checksum = buffer[..checksum_start]
        .iter()
        .fold(0_u64, |sum, byte| (sum + u64::from(*byte)) % 256);
    if expected_checksum != actual_checksum {
        return Err(FixError::Protocol(format!(
            "CheckSum mismatch: expected {expected_checksum}, calculated {actual_checksum}"
        )));
    }

    Ok(Some(checksum_end + 1))
}

fn parse_complete_frame(frame: &[u8]) -> Result<FixMessage, FixError> {
    let raw = std::str::from_utf8(frame)
        .map_err(|_| FixError::Protocol("message contains non-UTF-8 data".to_string()))?;
    parse_message(raw)
}

/// Parses a complete FIX message with SOH or `|` separators.
pub fn parse_message(raw: &str) -> Result<FixMessage, FixError> {
    let normalized = normalize_delimiters(raw);
    let fields = split_fields(&normalized)?;
    if fields.first().map(|field| field.tag.as_str()) != Some("8") {
        return Err(FixError::Protocol(
            "message must start with BeginString tag 8".to_string(),
        ));
    }
    let message_type = fields
        .iter()
        .find(|field| field.tag == "35")
        .map(|field| field.value.clone())
        .ok_or_else(|| FixError::Protocol("message is missing MsgType tag 35".to_string()))?;
    let sequence_number = fields
        .iter()
        .find(|field| field.tag == "34")
        .map(|field| parse_u64(field.value.as_bytes(), "MsgSeqNum"))
        .transpose()?;

    Ok(FixMessage {
        raw: normalized,
        fields,
        message_type,
        sequence_number,
    })
}

/// Normalizes the user-facing message separator into actual FIX SOH bytes.
pub fn normalize_delimiters(input: &str) -> String {
    let mut normalized = input
        .replace("\\x01", "\u{1}")
        .replace("^A", "\u{1}")
        .replace('|', "\u{1}")
        .replace("\r\n", "\u{1}")
        .replace(['\n', '\r'], "\u{1}");
    while normalized.ends_with('\u{1}') {
        normalized.pop();
    }
    normalized
}

fn split_fields(normalized: &str) -> Result<Vec<FixField>, FixError> {
    let mut fields = Vec::new();
    for part in normalized.split('\u{1}') {
        if part.is_empty() {
            continue;
        }
        let Some((tag, value)) = part.split_once('=') else {
            return Err(FixError::Protocol(format!("field '{part}' is missing '='")));
        };
        if tag.is_empty() || !tag.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(FixError::Protocol(format!("invalid FIX tag '{tag}'")));
        }
        fields.push(FixField {
            tag: tag.to_string(),
            value: value.to_string(),
        });
    }
    if fields.is_empty() {
        return Err(FixError::Protocol("message is empty".to_string()));
    }
    Ok(fields)
}

/// Parses the body of a user-authored application message and removes fields
/// owned by the session engine.
///
/// # Errors
///
/// Returns an error for missing/duplicate MsgType or malformed tag/value input.
pub fn prepare_application_body(raw: &str) -> Result<Vec<(String, String)>, FixError> {
    let normalized = normalize_delimiters(raw);
    let fields = split_fields(&normalized)?;
    let mut body: Vec<(String, String)> = Vec::with_capacity(fields.len() + 5);
    let mut message_type: Option<String> = None;

    for field in fields {
        if matches!(
            field.tag.as_str(),
            "8" | "9" | "10" | "34" | "49" | "52" | "56"
        ) {
            continue;
        }
        if field.tag == "35" {
            if message_type.is_some() {
                return Err(FixError::Protocol(
                    "message contains more than one MsgType tag 35".to_string(),
                ));
            }
            if field.value.trim().is_empty() {
                return Err(FixError::Protocol("MsgType cannot be empty".to_string()));
            }
            message_type = Some(field.value);
        } else {
            body.push((field.tag, field.value));
        }
    }

    let Some(message_type) = message_type else {
        return Err(FixError::Protocol(
            "message is missing MsgType tag 35".to_string(),
        ));
    };
    if is_admin_message_type(&message_type) {
        return Err(FixError::Unsupported(format!(
            "admin MsgType {message_type} is managed automatically by the FIX session"
        )));
    }
    body.insert(0, ("35".to_string(), message_type));
    Ok(body)
}

/// Encodes a validated FIX frame with session-owned header/trailer fields.
///
/// `body` must begin with MsgType tag 35.
///
/// # Errors
///
/// Returns an error when the body is empty or does not begin with MsgType.
pub fn encode_message(
    begin_string: &str,
    sender_comp_id: &str,
    target_comp_id: &str,
    sequence_number: u64,
    sending_time: DateTime<Utc>,
    body: &[(String, String)],
) -> Result<String, FixError> {
    let Some((first_tag, first_value)) = body.first() else {
        return Err(FixError::Protocol("message body is empty".to_string()));
    };
    if first_tag != "35" || first_value.is_empty() {
        return Err(FixError::Protocol(
            "message body must begin with MsgType tag 35".to_string(),
        ));
    }
    validate_header_value("BeginString", begin_string)?;
    validate_header_value("SenderCompID", sender_comp_id)?;
    validate_header_value("TargetCompID", target_comp_id)?;

    let mut body_text = String::new();
    for (tag, value) in body {
        if matches!(tag.as_str(), "8" | "9" | "10" | "34" | "49" | "52" | "56") {
            continue;
        }
        validate_field_value(tag, value)?;
        write!(body_text, "{tag}={value}\u{1}")
            .map_err(|_| FixError::Protocol("failed to build FIX body".to_string()))?;
    }

    let sending_time = sending_time.format("%Y%m%d-%H:%M:%S%.3f").to_string();
    let mut body_with_header = String::new();
    write!(body_with_header, "35={first_value}\u{1}")
        .map_err(|_| FixError::Protocol("failed to build FIX header".to_string()))?;
    write!(
        body_with_header,
        "49={sender_comp_id}\u{1}56={target_comp_id}\u{1}34={sequence_number}\u{1}52={sending_time}\u{1}"
    )
    .map_err(|_| FixError::Protocol("failed to build FIX header".to_string()))?;
    if let Some(rest) = body_text.strip_prefix(&format!("35={first_value}\u{1}")) {
        body_with_header.push_str(rest);
    }

    let prefix = format!("8={begin_string}\u{1}9={}\u{1}", body_with_header.len());
    let checksum = prefix
        .bytes()
        .chain(body_with_header.bytes())
        .fold(0_u64, |sum, byte| (sum + u64::from(byte)) % 256);
    Ok(format!("{prefix}{body_with_header}10={checksum:03}\u{1}"))
}

/// Builds a display-only message where credentials are masked.
pub fn redact_for_display(raw: &str) -> String {
    let normalized = normalize_delimiters(raw);
    let Ok(fields) = split_fields(&normalized) else {
        return "[unparseable FIX message]".to_string();
    };
    let mut output = String::new();
    for field in fields {
        let value = redact_field(&field.tag, &field.value);
        write!(output, "{}={}\u{1}", field.tag, value).ok();
    }
    output
}

fn redact_field(tag: &str, value: &str) -> String {
    if is_sensitive_tag(tag) {
        "********".to_string()
    } else {
        value.to_string()
    }
}

fn is_sensitive_tag(tag: &str) -> bool {
    matches!(tag, "554" | "925")
}

fn is_admin_message_type(message_type: &str) -> bool {
    matches!(message_type, "0" | "1" | "2" | "3" | "4" | "5" | "A")
}

fn validate_header_value(name: &str, value: &str) -> Result<(), FixError> {
    if value.trim().is_empty() {
        return Err(FixError::Config(format!("{name} cannot be empty")));
    }
    if value.contains('\u{1}') || value.contains('|') || value.contains(['\r', '\n']) {
        return Err(FixError::Config(format!(
            "{name} cannot contain a FIX delimiter"
        )));
    }
    Ok(())
}

fn validate_field_value(tag: &str, value: &str) -> Result<(), FixError> {
    if value.contains('\u{1}') || value.contains(['\r', '\n']) {
        return Err(FixError::Protocol(format!(
            "tag {tag} contains an unexpected delimiter"
        )));
    }
    Ok(())
}

fn find_soh(buffer: &[u8], start: usize) -> Option<usize> {
    buffer
        .get(start..)?
        .iter()
        .position(|byte| *byte == SOH)
        .map(|offset| start + offset)
}

fn parse_u64(value: &[u8], name: &str) -> Result<u64, FixError> {
    let value = std::str::from_utf8(value)
        .map_err(|_| FixError::Protocol(format!("{name} is not valid UTF-8")))?;
    value
        .parse::<u64>()
        .map_err(|_| FixError::Protocol(format!("{name} must be an unsigned integer")))
}

#[cfg(test)]
mod tests {
    use chrono::TimeZone;

    use super::*;

    fn sample_time() -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 20, 12, 34, 56)
            .single()
            .expect("valid timestamp")
    }

    #[test]
    fn encodes_and_parses_valid_frame() {
        let body = vec![
            ("35".to_string(), "D".to_string()),
            ("11".to_string(), "ORDER-1".to_string()),
            ("55".to_string(), "AAPL".to_string()),
        ];
        let raw = encode_message("FIX.4.4", "CLIENT", "SERVER", 7, sample_time(), &body)
            .expect("encode message");
        assert!(raw.contains("34=7\u{1}"));
        assert!(raw.contains("10="));

        let mut decoder = FixFrameDecoder::new();
        let messages = decoder.push(raw.as_bytes()).expect("decode complete frame");
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].message_type, "D");
        assert_eq!(messages[0].sequence_number, Some(7));
        assert_eq!(messages[0].value("11"), Some("ORDER-1"));
    }

    #[test]
    fn decodes_fragmented_and_coalesced_frames() {
        let first = encode_message(
            "FIX.4.4",
            "CLIENT",
            "SERVER",
            1,
            sample_time(),
            &[("35".to_string(), "0".to_string())],
        )
        .expect("encode first");
        let second = encode_message(
            "FIX.4.4",
            "CLIENT",
            "SERVER",
            2,
            sample_time(),
            &[("35".to_string(), "0".to_string())],
        )
        .expect("encode second");
        let both = format!("{first}{second}");

        let mut decoder = FixFrameDecoder::new();
        let split_at = first.len() / 2;
        assert!(decoder
            .push(&both.as_bytes()[..split_at])
            .expect("decode partial")
            .is_empty());
        let messages = decoder
            .push(&both.as_bytes()[split_at..])
            .expect("decode remainder");
        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].sequence_number, Some(1));
        assert_eq!(messages[1].sequence_number, Some(2));
    }

    #[test]
    fn rejects_checksum_mismatch() {
        let raw = encode_message(
            "FIX.4.4",
            "CLIENT",
            "SERVER",
            1,
            sample_time(),
            &[("35".to_string(), "0".to_string())],
        )
        .expect("encode message");
        let corrupted = raw.replace("10=", "10=9");
        let mut decoder = FixFrameDecoder::new();
        assert!(decoder.push(corrupted.as_bytes()).is_err());
    }

    #[test]
    fn prepares_application_message_and_removes_session_fields() {
        let body = prepare_application_body(
            "8=FIX.4.4|9=0|35=D|49=BAD|56=BAD|34=99|11=ABC|55=MSFT|10=000",
        )
        .expect("prepare body");
        assert_eq!(body[0], ("35".to_string(), "D".to_string()));
        assert!(!body
            .iter()
            .any(|(tag, _)| matches!(tag.as_str(), "8" | "9" | "10" | "34" | "49" | "52" | "56")));
    }

    #[test]
    fn moves_msg_type_to_the_header_position() {
        let body = prepare_application_body("11=ABC|55=MSFT|35=D").expect("prepare body");
        assert_eq!(body[0], ("35".to_string(), "D".to_string()));
        assert_eq!(body[1], ("11".to_string(), "ABC".to_string()));
    }

    #[test]
    fn rejects_manual_admin_messages() {
        let error = prepare_application_body("35=A|98=0|108=30")
            .expect_err("admin messages must be rejected");
        assert!(error.to_string().contains("managed automatically"));
    }

    #[test]
    fn masks_logon_password_in_display_event() {
        let raw = encode_message(
            "FIX.4.4",
            "CLIENT",
            "SERVER",
            1,
            sample_time(),
            &[
                ("35".to_string(), "A".to_string()),
                ("553".to_string(), "alice".to_string()),
                ("554".to_string(), "super-secret".to_string()),
                ("925".to_string(), "new-secret".to_string()),
            ],
        )
        .expect("encode logon");
        let message = parse_message(&raw).expect("parse logon");
        let event = message.event(FixDirection::In, sample_time());

        assert!(!event.raw.contains("super-secret"));
        assert!(!event.raw.contains("new-secret"));
        assert!(event
            .fields
            .iter()
            .all(|(_, value)| value != "super-secret" && value != "new-secret"));

        for (tag, expected) in [("554", "super-secret"), ("925", "new-secret")] {
            let sensitive = event
                .sensitive_fields
                .iter()
                .find(|field| field.tag == tag)
                .expect("sensitive field metadata");
            assert_eq!(sensitive.value, expected);
            assert_eq!(event.fields[sensitive.field_index].0, tag);
        }
        assert!(
            event
                .sensitive_fields
                .iter()
                .all(|field| field.tag != "553"),
            "username is not treated as a credential"
        );
    }
}
