//! The trustee's DSC token through PKCS#11. The PIN is used to log in and
//! dropped; nothing from the token is written to disk.

use std::path::Path;
use std::time::{Duration, Instant};

use cryptoki::context::{CInitializeArgs, Pkcs11};
use cryptoki::mechanism::Mechanism;
use cryptoki::object::{Attribute, AttributeType, ObjectClass, ObjectHandle};
use cryptoki::session::{Session, UserType};
use cryptoki::types::AuthPin;
use sha2::{Digest, Sha256};

/// A certificate on the token that has a matching private key.
pub struct TokenCertificate {
    pub der: Vec<u8>,
    pub sha256: String,
    key: ObjectHandle,
}

pub struct Token {
    _pkcs11: Pkcs11,
    session: Session,
}

#[derive(Debug)]
pub struct TokenError(pub String);

impl std::fmt::Display for TokenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for TokenError {}

fn err(context: &str, error: impl std::fmt::Display) -> TokenError {
    TokenError(format!("{context}: {error}"))
}

pub fn sha256_hex(data: &[u8]) -> String {
    hex::encode(Sha256::digest(data))
}

impl Token {
    /// Opens the first slot with a token and logs in with the PIN.
    pub fn open(module: &Path, pin: &str) -> Result<Self, TokenError> {
        let pkcs11 = Pkcs11::new(module).map_err(|e| {
            err(
                &format!("Couldn't load the token driver at {}", module.display()),
                e,
            )
        })?;
        pkcs11
            .initialize(CInitializeArgs::OsThreads)
            .map_err(|e| err("Couldn't start the token driver", e))?;
        // The HyperSecu driver finds the token a second or two after
        // initialising, so an empty slot list right away doesn't mean no token.
        let deadline = Instant::now() + Duration::from_secs(5);
        let slot = loop {
            let slots = pkcs11
                .get_slots_with_token()
                .map_err(|e| err("Couldn't list tokens", e))?;
            if let Some(slot) = slots.into_iter().next() {
                break slot;
            }
            if Instant::now() >= deadline {
                return Err(TokenError("No DSC token is plugged in.".into()));
            }
            std::thread::sleep(Duration::from_millis(250));
        };
        let session = pkcs11
            .open_ro_session(slot)
            .map_err(|e| err("Couldn't open the token", e))?;
        session
            .login(UserType::User, Some(&AuthPin::new(pin.to_owned().into())))
            .map_err(|e| err("The token refused the PIN", e))?;
        Ok(Self {
            _pkcs11: pkcs11,
            session,
        })
    }

    /// Certificates that have a private key beside them (signing certificates).
    pub fn certificates(&self) -> Result<Vec<TokenCertificate>, TokenError> {
        let objects = self
            .session
            .find_objects(&[Attribute::Class(ObjectClass::CERTIFICATE)])
            .map_err(|e| err("Couldn't read certificates", e))?;
        let mut found = Vec::new();
        for object in objects {
            let attributes = self
                .session
                .get_attributes(object, &[AttributeType::Value, AttributeType::Id])
                .map_err(|e| err("Couldn't read a certificate", e))?;
            let mut der = None;
            let mut id = None;
            for attribute in attributes {
                match attribute {
                    Attribute::Value(value) => der = Some(value),
                    Attribute::Id(value) => id = Some(value),
                    _ => {}
                }
            }
            let (Some(der), Some(id)) = (der, id) else {
                continue;
            };
            let keys = self
                .session
                .find_objects(&[
                    Attribute::Class(ObjectClass::PRIVATE_KEY),
                    Attribute::Id(id),
                ])
                .map_err(|e| err("Couldn't find the key", e))?;
            if let Some(key) = keys.into_iter().next() {
                found.push(TokenCertificate {
                    sha256: sha256_hex(&der),
                    der,
                    key,
                });
            }
        }
        Ok(found)
    }

    /// Every certificate on the token, DER: the signing ones and the CA chain.
    pub fn all_certificates(&self) -> Result<Vec<Vec<u8>>, TokenError> {
        let objects = self
            .session
            .find_objects(&[Attribute::Class(ObjectClass::CERTIFICATE)])
            .map_err(|e| err("Couldn't read certificates", e))?;
        let mut found = Vec::new();
        for object in objects {
            let attributes = self
                .session
                .get_attributes(object, &[AttributeType::Value])
                .map_err(|e| err("Couldn't read a certificate", e))?;
            for attribute in attributes {
                if let Attribute::Value(value) = attribute {
                    found.push(value);
                }
            }
        }
        Ok(found)
    }

    /// RSA PKCS#1 v1.5 over SHA-256 of `data`, the PAdES signature value.
    pub fn sign(&self, certificate: &TokenCertificate, data: &[u8]) -> Result<Vec<u8>, TokenError> {
        self.session
            .sign(&Mechanism::Sha256RsaPkcs, certificate.key, data)
            .map_err(|e| err("The token couldn't sign", e))
    }
}
