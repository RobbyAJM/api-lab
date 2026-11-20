//! FIX 4.2/4.4 framing, session handling, and stunnel configuration support.

pub mod codec;
pub mod error;
pub mod session;
pub mod stunnel;

pub use codec::{
    encode_message, parse_message, prepare_application_body, FixField, FixFrameDecoder, FixMessage,
};
pub use error::FixError;
pub use session::{run_connected, SessionConfig};
pub use stunnel::{
    executable, format_host_port, generate_config, loopback_address, parse_port, StunnelConfigInput,
};
