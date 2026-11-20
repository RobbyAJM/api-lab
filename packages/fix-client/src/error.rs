use thiserror::Error;

/// Errors raised while validating, framing, or running a FIX session.
#[derive(Debug, Error)]
pub enum FixError {
    #[error("i/o error: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid FIX message: {0}")]
    Protocol(String),
    #[error("invalid FIX configuration: {0}")]
    Config(String),
    #[error("unsupported FIX operation: {0}")]
    Unsupported(String),
    #[error("stunnel error: {0}")]
    Stunnel(String),
}
