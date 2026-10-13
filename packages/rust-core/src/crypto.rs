use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::password_hash::SaltString;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

use crate::error::CoreError;

pub fn hash_password(password: &str) -> Result<String, CoreError> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| CoreError::Crypto(format!("failed to hash password: {e}")))?
        .to_string();
    Ok(password_hash)
}

pub fn verify_password(password: &str, hash: &str) -> Result<bool, CoreError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| CoreError::Crypto(format!("invalid password hash format: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

pub fn generate_token_hex() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

pub fn hash_token_sha256(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn encrypt_aes_gcm(plaintext: &str, key_hex: &str) -> Result<String, CoreError> {
    let key_bytes = hex::decode(key_hex)
        .map_err(|e| CoreError::Crypto(format!("invalid key hex: {e}")))?;
    if key_bytes.len() != 32 {
        return Err(CoreError::Crypto("key must be 32 bytes (64 hex characters)".into()));
    }

    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| CoreError::Crypto(format!("failed to create cipher: {e}")))?;

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| CoreError::Crypto(format!("encryption failed: {e}")))?;

    // store nonce (12 bytes) + ciphertext
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(hex::encode(combined))
}

pub fn decrypt_aes_gcm(encrypted_hex: &str, key_hex: &str) -> Result<String, CoreError> {
    let key_bytes = hex::decode(key_hex)
        .map_err(|e| CoreError::Crypto(format!("invalid key hex: {e}")))?;
    if key_bytes.len() != 32 {
        return Err(CoreError::Crypto("key must be 32 bytes (64 hex characters)".into()));
    }

    let encrypted_bytes = hex::decode(encrypted_hex)
        .map_err(|e| CoreError::Crypto(format!("invalid encrypted hex: {e}")))?;

    if encrypted_bytes.len() < 12 {
        return Err(CoreError::Crypto("encrypted data too short".into()));
    }

    let (nonce_bytes, ciphertext) = encrypted_bytes.split_at(12);
    let cipher = Aes256Gcm::new_from_slice(&key_bytes)
        .map_err(|e| CoreError::Crypto(format!("failed to create cipher: {e}")))?;
    let nonce = Nonce::from_slice(nonce_bytes);

    let decrypted = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| CoreError::Crypto(format!("decryption failed: {e}")))?;

    String::from_utf8(decrypted)
        .map_err(|e| CoreError::Crypto(format!("decrypted payload not valid UTF-8: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_password_hashing() {
        let pwd = "super_secret_password_123";
        let hash = hash_password(pwd).unwrap();
        assert!(verify_password(pwd, &hash).unwrap());
        assert!(!verify_password("wrong_password", &hash).unwrap());
    }

    #[test]
    fn test_token_hashing() {
        let token = generate_token_hex();
        let hash1 = hash_token_sha256(&token);
        let hash2 = hash_token_sha256(&token);
        assert_eq!(hash1, hash2);
        assert_ne!(token, hash1);
    }

    #[test]
    fn test_aes_gcm_encrypt_decrypt() {
        let key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let secret = "sensitive-api-token-xyz";
        let enc = encrypt_aes_gcm(secret, key).unwrap();
        assert_ne!(secret, enc);
        let dec = decrypt_aes_gcm(&enc, key).unwrap();
        assert_eq!(secret, dec);
    }
}
