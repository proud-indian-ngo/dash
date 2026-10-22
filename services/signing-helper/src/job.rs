//! One signing or enrolment job from a `pidash-sign://` link.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::json;

use crate::cms::{self, DigestAlgorithm};
use crate::config;
use crate::token::{Token, TokenError};
use crate::ui;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

#[derive(Debug, PartialEq)]
pub struct Link {
    pub action: String,
    pub job: String,
    pub server: String,
}

/// Parses `pidash-sign://sign?job=...&server=...`.
pub fn parse_link(link: &str) -> Result<Link> {
    let url = url::Url::parse(link)?;
    if url.scheme() != "pidash-sign" {
        return Err("Not a pidash-sign link".into());
    }
    let action = url.host_str().unwrap_or_default().to_owned();
    if action != "sign" && action != "enrol" {
        return Err(format!("Unknown action {action}").into());
    }
    let mut job = None;
    let mut server = None;
    for (key, value) in url.query_pairs() {
        match key.as_ref() {
            "job" => job = Some(value.into_owned()),
            "server" => server = Some(value.into_owned()),
            _ => {}
        }
    }
    let job = job.filter(|j| {
        !j.is_empty() && j.len() <= 128 && j.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    });
    match (job, server) {
        (Some(job), Some(server)) => Ok(Link { action, job, server }),
        _ => Err("The link is missing its job or server".into()),
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Job {
    kind: String,
    title: String,
    signer: String,
    to_sign: Option<String>,
    digest_algorithm: Option<String>,
    certificate_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ServerMessage {
    message: Option<String>,
}

/// Sent with every request, so the dashboard can refuse a helper too old for it.
const VERSION_HEADER: &str = "X-Pidash-Sign-Version";
const VERSION: &str = env!("CARGO_PKG_VERSION");

fn job_url(server: &str, job: &str) -> String {
    format!("{}/api/signing/jobs/{job}", server.trim_end_matches('/'))
}

/// The dashboard's JSON reply, or the message it refused the request with.
fn reply<T: DeserializeOwned>(
    sent: std::result::Result<ureq::http::Response<ureq::Body>, ureq::Error>,
) -> Result<T> {
    let mut response = sent.map_err(|e| format!("Couldn't reach the dashboard: {e}"))?;
    if !response.status().is_success() {
        let message = response
            .body_mut()
            .read_json::<ServerMessage>()
            .ok()
            .and_then(|m| m.message)
            .unwrap_or_else(|| "The dashboard refused the request.".into());
        return Err(message.into());
    }
    Ok(response.body_mut().read_json()?)
}

pub fn run_link(link: &str) -> Result<()> {
    let link = parse_link(link)?;
    let settings = config::load();
    let Some(allowed) = config::server(&settings) else {
        return Err(format!(
            "This helper wasn't built for a dashboard. Download it from the dashboard again, or set the server in {}.",
            config::config_path().display()
        )
        .into());
    };
    if !config::same_origin(allowed, &link.server) {
        return Err(format!(
            "This link is for {}, but the helper only signs for {allowed}.",
            link.server
        )
        .into());
    }
    let url = job_url(allowed, &link.job);
    // A refusal's body carries the dashboard's message, so statuses aren't errors.
    let job: Job = reply(
        ureq::get(&url)
            .header(VERSION_HEADER, VERSION)
            .config()
            .http_status_as_error(false)
            .build()
            .call(),
    )?;
    let body = match job_result(&job, &link, &settings) {
        Ok(body) => body,
        Err(error) => {
            report_failure(&url, &error.to_string());
            return Err(error);
        }
    };
    let done: ServerMessage = reply(
        ureq::post(&url)
            .header(VERSION_HEADER, VERSION)
            .config()
            .http_status_as_error(false)
            .build()
            .send_json(body),
    )?;
    ui::info(
        done.message
            .as_deref()
            .unwrap_or("Done. You can return to the dashboard."),
    );
    Ok(())
}

/// What to post back: the certificates to enrol, or the signature made on the token.
fn job_result(job: &Job, link: &Link, settings: &config::Config) -> Result<serde_json::Value> {
    if job.kind != link.action {
        return Err("The job doesn't match the link.".into());
    }
    let module = config::module_path(settings)?;
    if job.kind == "enrol" {
        enrol(job, &module)
    } else {
        sign(job, &module)
    }
}

fn enrol(job: &Job, module: &std::path::Path) -> Result<serde_json::Value> {
    let prompt = format!("Register the DSC on this token for {} in the dashboard.", job.signer);
    let Some(pin) = ui::ask_pin(&prompt) else {
        return Err("Signing cancelled.".into());
    };
    let token = Token::open(module, &pin)?;
    drop(pin);
    let certificates = token.certificates()?;
    if certificates.is_empty() {
        return Err(TokenError("No signing certificate was found on the token.".into()).into());
    }
    let signing: Vec<String> = certificates.iter().map(|c| STANDARD.encode(&c.der)).collect();
    let chain: Vec<String> = token
        .all_certificates()?
        .iter()
        .map(|der| STANDARD.encode(der))
        .filter(|der| !signing.contains(der))
        .collect();
    Ok(json!({ "certificates": signing, "chain": chain }))
}

/// Checks what the dashboard asks to sign against the enrolled certificate's
/// hash before the PIN prompt, which shows the digest being signed. The token
/// is read only after login, the way its drivers have been tested.
fn sign(job: &Job, module: &std::path::Path) -> Result<serde_json::Value> {
    let expected = job.certificate_sha256.as_deref().unwrap_or_default();
    let certificate_sha256 = hex::decode(expected)
        .ok()
        .filter(|hash| hash.len() == 32)
        .ok_or("The dashboard didn't say which certificate to sign with.")?;
    let digest = DigestAlgorithm::parse(job.digest_algorithm.as_deref())?;
    let data = STANDARD.decode(job.to_sign.as_deref().unwrap_or_default())?;
    let message_digest = cms::check_signed_attributes(&data, digest, &certificate_sha256)
        .map_err(|e| format!("The dashboard asked to sign something this helper won't sign: {e}."))?;
    let prompt = format!(
        "Sign \u{201C}{}\u{201D} as {}.\n\nDocument digest: {}",
        job.title,
        job.signer,
        hex::encode(message_digest)
    );
    let Some(pin) = ui::ask_pin(&prompt) else {
        return Err("Signing cancelled.".into());
    };
    let token = Token::open(module, &pin)?;
    drop(pin);
    let certificate = token
        .certificates()?
        .into_iter()
        .find(|c| c.sha256.eq_ignore_ascii_case(expected))
        .ok_or_else(|| {
            TokenError(
                "This token doesn't hold the certificate enrolled for you in the dashboard. Plug in your own token, or enrol this one first.".into(),
            )
        })?;
    let signature = token.sign(&certificate, &data, digest)?;
    Ok(json!({
        "certificate": STANDARD.encode(&certificate.der),
        "signature": STANDARD.encode(signature),
    }))
}

/// Tells the dashboard the job failed here, so the page stops waiting and
/// shows why. Best effort: the helper's own window shows the reason anyway.
fn report_failure(url: &str, message: &str) {
    let _ = ureq::post(url)
        .header(VERSION_HEADER, VERSION)
        .send_json(json!({ "failed": message }));
}

/// `pidash-sign list`: shows the signing certificates on the token, to check a setup.
pub fn list_certificates() -> Result<()> {
    let settings = config::load();
    let Some(pin) = ui::ask_pin("List the certificates on your token.") else {
        return Err("Cancelled.".into());
    };
    let token = Token::open(&config::module_path(&settings)?, &pin)?;
    for certificate in token.certificates()? {
        let name = x509_parser::parse_x509_certificate(&certificate.der)
            .map(|(_, cert)| cert.subject().to_string())
            .unwrap_or_else(|_| "unreadable certificate".into());
        println!("{}  {name}", certificate.sha256);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::parse_link;

    #[test]
    fn parses_sign_and_enrol_links() {
        let link = parse_link("pidash-sign://sign?job=abc_DEF-123&server=https%3A%2F%2Fdash.example.org").unwrap();
        assert_eq!(link.action, "sign");
        assert_eq!(link.job, "abc_DEF-123");
        assert_eq!(link.server, "https://dash.example.org");
        assert_eq!(parse_link("pidash-sign://enrol?job=x&server=https://a.b").unwrap().action, "enrol");
    }

    #[test]
    fn refuses_bad_links() {
        assert!(parse_link("https://evil.example.org").is_err());
        assert!(parse_link("pidash-sign://delete?job=x&server=https://a.b").is_err());
        assert!(parse_link("pidash-sign://sign?server=https://a.b").is_err());
        assert!(parse_link("pidash-sign://sign?job=../x&server=https://a.b").is_err());
    }
}
