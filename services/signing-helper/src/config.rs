//! Where the helper may connect, and which PKCS#11 driver to load.
//!
//! The release build bakes in the one dashboard it trusts
//! (`PIDASH_SIGN_SERVER` at build time); `config.json` may override it and
//! the driver, for a test dashboard. A link naming any other server is
//! refused, so a crafted link can't get the token to sign for someone else.

use std::path::PathBuf;

use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
pub struct Config {
    /// "https://dash.example.org": replaces the built-in server.
    pub server: Option<String>,
    /// Path to the token's PKCS#11 library.
    pub module: Option<String>,
    /// Where to look for new releases, for testing updates; GitHub by default.
    pub updates: Option<String>,
}

pub fn config_path() -> PathBuf {
    if let Ok(path) = std::env::var("PIDASH_SIGN_CONFIG") {
        return PathBuf::from(path);
    }
    #[cfg(target_os = "windows")]
    {
        let base = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
        PathBuf::from(base).join("pidash-sign").join("config.json")
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
        PathBuf::from(home)
            .join(".config")
            .join("pidash-sign")
            .join("config.json")
    }
}

pub fn load() -> Config {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// The only server the helper talks to: the config's, or the one built in.
pub fn server(config: &Config) -> Option<&str> {
    config.server.as_deref().or(option_env!("PIDASH_SIGN_SERVER"))
}

/// The token driver: `PIDASH_PKCS11_MODULE`, the config, or the HyperSecu default.
pub fn module_path(config: &Config) -> PathBuf {
    if let Ok(path) = std::env::var("PIDASH_PKCS11_MODULE") {
        return PathBuf::from(path);
    }
    if let Some(path) = &config.module {
        return PathBuf::from(path);
    }
    #[cfg(target_os = "macos")]
    {
        PathBuf::from("/usr/local/lib/libcastle_v2.1.0.0.dylib")
    }
    #[cfg(target_os = "windows")]
    {
        PathBuf::from(r"C:\Windows\System32\HYP2003csp11IND.dll")
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        PathBuf::from("/usr/lib/libcastle.so")
    }
}

/// Origins must match exactly: scheme, host and port.
pub fn same_origin(a: &str, b: &str) -> bool {
    match (url::Url::parse(a), url::Url::parse(b)) {
        (Ok(a), Ok(b)) => a.origin() == b.origin(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::same_origin;

    #[test]
    fn origins_must_match_exactly() {
        assert!(same_origin("https://dash.example.org", "https://dash.example.org/"));
        assert!(!same_origin("https://dash.example.org", "https://evil.example.org"));
        assert!(!same_origin("https://dash.example.org", "http://dash.example.org"));
        assert!(!same_origin("https://dash.example.org", "https://dash.example.org:8443"));
        assert!(!same_origin("https://dash.example.org", "not a url"));
    }
}
