use thiserror::Error;

#[derive(Error, Debug, Clone, PartialEq, Eq)]
pub enum CoreError {
    #[error("undefined variable: {0}")]
    UndefinedVariable(String),

    #[error("cryptography error: {0}")]
    Crypto(String),

    #[error("invalid input: {0}")]
    InvalidInput(String),

    #[error("serialization error: {0}")]
    Serialization(String),
}
