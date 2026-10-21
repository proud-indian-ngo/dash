//! Self-update. Before each link the helper reads the latest release's
//! manifest; when it names a newer version, the helper downloads that build,
//! checks it against the manifest, swaps it in and hands the link to the new
//! copy. CI signs the manifest with the release key, whose public half is
//! built in here, so only a build we released is installed, whoever served
//! it. Files the helper downloads itself carry no quarantine mark, so
//! Gatekeeper and SmartScreen don't ask again. Any failure leaves the
//! current helper to do the job.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant, SystemTime};

use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use sha2::{Digest, Sha256};

use crate::config;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

/// The public half of the release key (Ed25519). CI signs with the private half.
const RELEASE_KEY: &str = "4fc11cec997c13f3fa7f9a50a4d286dee769befba167c39a440f532fcaa60aeb";
const RELEASES: &str = "https://github.com/proud-indian-ngo/dash/releases/latest/download";
const MANIFEST: &str = "pidash-sign-manifest.json";
/// Set on the relaunched copy, so it doesn't check again.
const RELAUNCHED: &str = "PIDASH_SIGN_UPDATED";
const MAX_DOWNLOAD_BYTES: u64 = 64 * 1024 * 1024;

#[cfg(target_os = "macos")]
const ASSET: Option<&str> = Some("pidash-sign-macos.zip");
#[cfg(target_os = "windows")]
const ASSET: Option<&str> = Some("pidash-sign-windows-x64.exe");
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
const ASSET: Option<&str> = None;

/// Held while one run swaps the helper, so a second run (a trustee clicking
/// again) leaves the files alone and does its job with the copy it has.
struct Lock(PathBuf);

impl Lock {
    fn take(dir: &Path) -> Result<Lock> {
        let path = dir.join(".pidash-sign-update.lock");
        // A run that died mid-update leaves its lock behind; it's stale after ten minutes.
        let stale = std::fs::metadata(&path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|at| SystemTime::now().duration_since(at).ok())
            .is_some_and(|age| age > Duration::from_secs(600));
        if stale {
            let _ = std::fs::remove_file(&path);
        }
        std::fs::File::create_new(&path).map_err(|_| "Another update is running.")?;
        Ok(Lock(path))
    }
}

impl Drop for Lock {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

/// What a release holds: its version and each file's SHA-256 (hex).
#[derive(Debug, Deserialize)]
pub struct Manifest {
    pub version: String,
    pub files: HashMap<String, String>,
}

fn parse_version(version: &str) -> Option<(u32, u32, u32)> {
    let mut parts = version.split('.').map(|part| part.parse::<u32>().ok());
    let version = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(version)
}

pub fn is_newer(candidate: &str, current: &str) -> bool {
    match (parse_version(candidate), parse_version(current)) {
        (Some(candidate), Some(current)) => candidate > current,
        _ => false,
    }
}

/// The manifest, if `signature` is the release key's over exactly these bytes.
pub fn verify_manifest(bytes: &[u8], signature: &[u8], key: &[u8; 32]) -> Result<Manifest> {
    let key = VerifyingKey::from_bytes(key)?;
    let signature = Signature::from_slice(signature)?;
    key.verify_strict(bytes, &signature)?;
    Ok(serde_json::from_slice(bytes)?)
}

fn fetch(url: &str, deadline: Instant) -> Result<Vec<u8>> {
    let timeout = deadline
        .checked_duration_since(Instant::now())
        .ok_or("The update check timed out.")?;
    let mut response = ureq::get(url)
        .config()
        .timeout_global(Some(timeout))
        .build()
        .call()?;
    Ok(response
        .body_mut()
        .with_config()
        .limit(MAX_DOWNLOAD_BYTES)
        .read_to_vec()?)
}

/// The newer build of `asset` than `current`, verified, or `None` when
/// `current` is the latest. The check shares one short budget, so a slow
/// GitHub delays signing by seconds at most.
fn download_newer(
    base: &str,
    asset: &str,
    key: &[u8; 32],
    current: &str,
) -> Result<Option<(String, Vec<u8>)>> {
    let base = base.trim_end_matches('/');
    let check = Instant::now() + Duration::from_secs(5);
    let bytes = fetch(&format!("{base}/{MANIFEST}"), check)?;
    let signature = fetch(&format!("{base}/{MANIFEST}.sig"), check)?;
    let manifest = verify_manifest(&bytes, &signature, key)?;
    if !is_newer(&manifest.version, current) {
        return Ok(None);
    }
    let expected = manifest
        .files
        .get(asset)
        .ok_or_else(|| format!("The release has no {asset}."))?;
    let build = fetch(
        &format!("{base}/{asset}"),
        Instant::now() + Duration::from_secs(300),
    )?;
    if !hex::encode(Sha256::digest(&build)).eq_ignore_ascii_case(expected) {
        return Err(format!("The downloaded {asset} doesn't match the release.").into());
    }
    Ok(Some((manifest.version, build)))
}

/// Replaces this app bundle with the downloaded one (a zip of the .app).
/// Unpacks beside it so the swap is a rename on the same volume.
#[cfg(target_os = "macos")]
fn install(archive: &[u8]) -> Result<PathBuf> {
    const APP: &str = "Proud Indian Signing.app";
    let exe = std::env::current_exe()?;
    let bundle = exe
        .ancestors()
        .nth(3)
        .filter(|path| path.extension().is_some_and(|ext| ext == "app"))
        .ok_or("The helper isn't running from its app.")?;
    let folder = bundle.parent().ok_or("The app has no folder.")?;
    let _lock = Lock::take(folder)?;
    let staging = folder.join(format!(".pidash-sign-update-{}", std::process::id()));
    std::fs::create_dir(&staging)?;
    let zip = staging.join("update.zip");
    std::fs::write(&zip, archive)?;
    let status = Command::new("/usr/bin/ditto")
        .args(["-x", "-k"])
        .arg(&zip)
        .arg(&staging)
        .status()?;
    let new = staging.join(APP);
    if !status.success() || !new.join("Contents/MacOS/pidash-sign").is_file() {
        let _ = std::fs::remove_dir_all(&staging);
        return Err("The update didn't unpack.".into());
    }
    let old = staging.join("previous.app");
    std::fs::rename(bundle, &old)?;
    if let Err(error) = std::fs::rename(&new, bundle) {
        std::fs::rename(&old, bundle)?;
        return Err(error.into());
    }
    let _ = std::fs::remove_dir_all(&staging);
    Ok(exe)
}

/// Replaces the installed exe. A running exe can be renamed but not
/// overwritten, so this one moves aside and the next run deletes it.
#[cfg(target_os = "windows")]
fn install(build: &[u8]) -> Result<PathBuf> {
    let exe = std::env::current_exe()?;
    if exe != crate::install::target()? {
        return Err("The helper isn't running from where it's installed.".into());
    }
    let _lock = Lock::take(exe.parent().ok_or("The helper has no folder.")?)?;
    let new = exe.with_file_name("pidash-sign.new.exe");
    let old = exe.with_file_name("pidash-sign.old.exe");
    std::fs::write(&new, build)?;
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old)?;
    if let Err(error) = std::fs::rename(&new, &exe) {
        std::fs::rename(&old, &exe)?;
        return Err(error.into());
    }
    Ok(exe)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn install(_: &[u8]) -> Result<PathBuf> {
    Err("Updates are for the Mac and Windows builds.".into())
}

/// Updates the helper if a newer release exists and runs `link` with it,
/// returning that run's exit code. `None`: this helper should do the job.
pub fn run_with_newest(link: &str) -> Option<ExitCode> {
    #[cfg(target_os = "windows")]
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(exe.with_file_name("pidash-sign.old.exe"));
    }
    let asset = ASSET?;
    if std::env::var_os(RELAUNCHED).is_some() || crate::ui::headless() {
        return None;
    }
    let settings = config::load();
    let base = settings.updates.as_deref().unwrap_or(RELEASES);
    let key: [u8; 32] = hex::decode(RELEASE_KEY)
        .ok()?
        .try_into()
        .ok()?;
    let (version, build) = match download_newer(base, asset, &key, env!("CARGO_PKG_VERSION")) {
        Ok(Some(newer)) => newer,
        Ok(None) => return None,
        Err(error) => {
            eprintln!("Update check failed: {error}");
            return None;
        }
    };
    let exe = match install(&build) {
        Ok(exe) => exe,
        Err(error) => {
            eprintln!("Couldn't install {version}: {error}");
            return None;
        }
    };
    // If the new copy won't start, this one, still loaded, does the job.
    let status = match Command::new(exe).arg(link).env(RELAUNCHED, "1").status() {
        Ok(status) => status,
        Err(error) => {
            eprintln!("Couldn't start {version}: {error}");
            return None;
        }
    };
    Some(match status.code() {
        Some(code) => ExitCode::from(u8::try_from(code).unwrap_or(1)),
        None => {
            crate::ui::error(&format!(
                "The signing helper updated to {version} but stopped unexpectedly. Try again from the dashboard."
            ));
            ExitCode::FAILURE
        }
    })
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;

    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};

    use super::{MANIFEST, download_newer, is_newer, verify_manifest};

    /// Serves `files` over HTTP on a free port; returns the base URL.
    fn serve(files: HashMap<String, Vec<u8>>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                let mut stream = stream.unwrap();
                let mut reader = BufReader::new(stream.try_clone().unwrap());
                let mut request = String::new();
                reader.read_line(&mut request).unwrap();
                let path = request.split(' ').nth(1).unwrap_or("/").trim_start_matches('/');
                let (status, body) = match files.get(path) {
                    Some(body) => ("200 OK", body.clone()),
                    None => ("404 Not Found", Vec::new()),
                };
                let head = format!(
                    "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                let _ = stream.write_all(head.as_bytes());
                let _ = stream.write_all(&body);
            }
        });
        base
    }

    /// A release of `asset` at `version`, its manifest signed by `key` and
    /// listing `listed_hash` for it.
    fn release(key: &SigningKey, version: &str, asset: &[u8], listed_hash: &str) -> String {
        let manifest = format!(r#"{{"version":"{version}","files":{{"a.zip":"{listed_hash}"}}}}"#);
        let signature = key.sign(manifest.as_bytes()).to_bytes().to_vec();
        serve(HashMap::from([
            (MANIFEST.to_owned(), manifest.into_bytes()),
            (format!("{MANIFEST}.sig"), signature),
            ("a.zip".to_owned(), asset.to_vec()),
        ]))
    }

    #[test]
    fn downloads_only_a_newer_matching_build() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let public = key.verifying_key().to_bytes();
        let build = b"new build";
        let hash = hex::encode(Sha256::digest(build));
        let base = release(&key, "0.3.0", build, &hash);

        let (version, bytes) = download_newer(&base, "a.zip", &public, "0.2.0").unwrap().unwrap();
        assert_eq!((version.as_str(), bytes.as_slice()), ("0.3.0", &build[..]));
        assert!(download_newer(&base, "a.zip", &public, "0.3.0").unwrap().is_none());
        assert!(download_newer(&base, "missing.zip", &public, "0.2.0").is_err());

        let tampered = release(&key, "0.3.0", b"other build", &hash);
        assert!(download_newer(&tampered, "a.zip", &public, "0.2.0").is_err());

        let forged = release(&SigningKey::from_bytes(&[8; 32]), "0.3.0", build, &hash);
        assert!(download_newer(&forged, "a.zip", &public, "0.2.0").is_err());
    }

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.2.1", "0.2.0"));
        assert!(is_newer("0.10.0", "0.9.9"));
        assert!(is_newer("1.0.0", "0.99.99"));
        assert!(!is_newer("0.2.0", "0.2.0"));
        assert!(!is_newer("0.1.9", "0.2.0"));
        assert!(!is_newer("0.3", "0.2.0"));
        assert!(!is_newer("0.3.0.1", "0.2.0"));
        assert!(!is_newer("v0.3.0", "0.2.0"));
    }

    #[test]
    fn accepts_only_the_release_keys_signature() {
        let key = SigningKey::from_bytes(&[7; 32]);
        let other = SigningKey::from_bytes(&[8; 32]);
        let manifest = br#"{"version":"0.3.0","files":{"a.zip":"00"}}"#;
        let public = key.verifying_key().to_bytes();

        let signed = key.sign(manifest).to_bytes();
        assert_eq!(verify_manifest(manifest, &signed, &public).unwrap().version, "0.3.0");

        let forged = other.sign(manifest).to_bytes();
        assert!(verify_manifest(manifest, &forged, &public).is_err());

        let tampered = br#"{"version":"9.9.9","files":{"a.zip":"00"}}"#;
        assert!(verify_manifest(tampered, &signed, &public).is_err());
        assert!(verify_manifest(manifest, &signed[..63], &public).is_err());
    }
}
