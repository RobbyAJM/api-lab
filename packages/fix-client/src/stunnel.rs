//! stunnel configuration generation and validation.

use std::fmt::Write as _;
use std::net::{Ipv4Addr, SocketAddr};
use std::path::Path;

use crate::error::FixError;

/// Inputs needed to generate a managed stunnel client configuration.
#[derive(Debug, Clone, Copy)]
pub struct StunnelConfigInput<'a> {
    pub local_host: &'a str,
    pub local_port: u16,
    pub remote_host: &'a str,
    pub remote_port: u16,
    pub ca_file: &'a str,
    pub client_cert_file: &'a str,
    pub client_key_file: &'a str,
    pub verify_peer: bool,
}

/// Builds a client-mode stunnel configuration for one FIX session.
///
/// # Errors
///
/// Returns an error when a generated value contains a config newline or when
/// required addresses are empty.
pub fn generate_config(input: &StunnelConfigInput<'_>) -> Result<String, FixError> {
    let local_host = validate_value("local host", input.local_host)?;
    let remote_host = validate_value("remote host", input.remote_host)?;
    for (name, path) in [
        ("CA file", input.ca_file),
        ("client certificate", input.client_cert_file),
        ("client key", input.client_key_file),
    ] {
        if !path.is_empty() {
            validate_value(name, path)?;
        }
    }

    let mut config = String::from("foreground = yes\nclient = yes\ndebug = info\n\n[fix]\n");
    writeln!(config, "client = yes").ok();
    writeln!(
        config,
        "accept = {}",
        format_host_port(local_host, input.local_port)
    )
    .ok();
    writeln!(
        config,
        "connect = {}",
        format_host_port(remote_host, input.remote_port)
    )
    .ok();
    writeln!(
        config,
        "verifyChain = {}",
        if input.verify_peer { "yes" } else { "no" }
    )
    .ok();
    if input.verify_peer {
        writeln!(config, "checkHost = {remote_host}").ok();
    }
    if !input.ca_file.is_empty() {
        writeln!(config, "CAfile = {}", normalize_path(input.ca_file)).ok();
    }
    if !input.client_cert_file.is_empty() {
        writeln!(config, "cert = {}", normalize_path(input.client_cert_file)).ok();
    }
    if !input.client_key_file.is_empty() {
        writeln!(config, "key = {}", normalize_path(input.client_key_file)).ok();
    }
    Ok(config)
}

/// Formats a host and port for stunnel's `connect` field.
pub fn format_host_port(host: &str, port: u16) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]:{port}")
    } else {
        format!("{host}:{port}")
    }
}

/// Returns a loopback socket address from user-provided host/port strings.
///
/// # Errors
///
/// Returns an error if the port is not a valid u16 or the host is not loopback.
pub fn loopback_address(host: &str, port: &str) -> Result<SocketAddr, FixError> {
    let host = if host.trim().is_empty() {
        "127.0.0.1"
    } else {
        host.trim()
    };
    let port = parse_port(port, "stunnel local port")?;
    if host != "127.0.0.1" && host != "localhost" && host != "::1" {
        return Err(FixError::Config(
            "external stunnel listener must use a loopback address".to_string(),
        ));
    }
    if host == "::1" {
        return Ok(SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], port)));
    }
    let ip = if host == "localhost" {
        Ipv4Addr::LOCALHOST
    } else {
        host.parse::<Ipv4Addr>()
            .map_err(|_| FixError::Config("invalid stunnel loopback address".to_string()))?
    };
    Ok(SocketAddr::from((ip, port)))
}

/// Parses a required TCP port.
///
/// # Errors
///
/// Returns an error for non-numeric or zero ports.
pub fn parse_port(value: &str, label: &str) -> Result<u16, FixError> {
    let port = value
        .trim()
        .parse::<u16>()
        .map_err(|_| FixError::Config(format!("{label} must be a number between 1 and 65535")))?;
    if port == 0 {
        return Err(FixError::Config(format!("{label} cannot be zero")));
    }
    Ok(port)
}

/// Resolves the stunnel executable command. Empty values use PATH lookup.
pub fn executable(value: &str) -> &str {
    if value.trim().is_empty() {
        "stunnel"
    } else {
        value.trim()
    }
}

fn validate_value<'a>(name: &str, value: &'a str) -> Result<&'a str, FixError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(FixError::Config(format!("{name} cannot be empty")));
    }
    if trimmed.contains(['\r', '\n']) || trimmed.contains(']') {
        return Err(FixError::Config(format!(
            "{name} contains invalid configuration characters"
        )));
    }
    Ok(trimmed)
}

fn normalize_path(path: &str) -> String {
    Path::new(path).to_string_lossy().replace('\\', "/")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config_input<'a>() -> StunnelConfigInput<'a> {
        StunnelConfigInput {
            local_host: "127.0.0.1",
            local_port: 32123,
            remote_host: "fix.example.com",
            remote_port: 9876,
            ca_file: "",
            client_cert_file: "",
            client_key_file: "",
            verify_peer: true,
        }
    }

    #[test]
    fn generates_secure_client_config() {
        let input = config_input();
        let config = generate_config(&input).expect("generate config");
        assert!(config.contains("client = yes"));
        assert!(config.contains("accept = 127.0.0.1:32123"));
        assert!(config.contains("connect = fix.example.com:9876"));
        assert!(config.contains("verifyChain = yes"));
        assert!(config.contains("checkHost = fix.example.com"));
    }

    #[test]
    fn includes_optional_certificate_paths() {
        let mut input = config_input();
        input.ca_file = r"C:\certs\ca.pem";
        input.client_cert_file = r"C:\certs\client.pem";
        input.client_key_file = r"C:\certs\client.key";
        let config = generate_config(&input).expect("generate config");
        assert!(config.contains("CAfile = C:/certs/ca.pem"));
        assert!(config.contains("cert = C:/certs/client.pem"));
        assert!(config.contains("key = C:/certs/client.key"));
    }

    #[test]
    fn rejects_config_injection() {
        let mut input = config_input();
        input.remote_host = "fix.example.com\n[evil]";
        assert!(generate_config(&input).is_err());
    }

    #[test]
    fn supports_ipv6_remote_host() {
        assert_eq!(format_host_port("::1", 9876), "[::1]:9876");
        assert_eq!(format_host_port("127.0.0.1", 9876), "127.0.0.1:9876");
    }

    #[test]
    fn validates_external_loopback_listener() {
        assert!(loopback_address("127.0.0.1", "12345").is_ok());
        assert!(loopback_address("0.0.0.0", "12345").is_err());
        assert!(loopback_address("127.0.0.1", "0").is_err());
    }
}
