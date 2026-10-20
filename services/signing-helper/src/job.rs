//! One signing or enrolment job from a `pidash-sign://` link.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde::Deserialize;
use serde_json::json;

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
    certificate_sha256: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ServerMessage {
    message: Option<String>,
}

fn job_url(server: &str, job: &str) -> String {
    format!("{}/api/signing/jobs/{job}", server.trim_end_matches('/'))
}

fn server_error(response: ureq::Error) -> Box<dyn std::error::Error> {
    match response {
        ureq::Error::Status(_, response) => {
            let message = response
                .into_json::<ServerMessage>()
                .ok()
                .and_then(|m| m.message)
                .unwrap_or_else(|| "pi-dash refused the request.".into());
            message.into()
        }
        other => format!("Couldn't reach pi-dash: {other}").into(),
    }
}

pub fn run_link(link: &str) -> Result<()> {
    let link = parse_link(link)?;
    let settings = config::load();
    let Some(allowed) = settings.server.as_deref() else {
        return Err(format!(
            "The helper isn't set up for a pi-dash server. Run the installer again (config: {}).",
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
    let job: Job = ureq::get(&url).call().map_err(server_error)?.into_json()?;
    if job.kind != link.action {
        return Err("The job doesn't match the link.".into());
    }
    let prompt = if job.kind == "enrol" {
        format!("Register the DSC on this token for {} in pi-dash.", job.signer)
    } else {
        format!("Sign \u{201C}{}\u{201D} as {}.", job.title, job.signer)
    };
    let Some(pin) = ui::ask_pin(&prompt) else {
        return Err("Signing cancelled.".into());
    };
    let token = Token::open(&config::module_path(&settings), &pin)?;
    drop(pin);
    let certificates = token.certificates()?;
    if certificates.is_empty() {
        return Err(TokenError("No signing certificate was found on the token.".into()).into());
    }

    let body = if job.kind == "enrol" {
        let signing: Vec<String> = certificates.iter().map(|c| STANDARD.encode(&c.der)).collect();
        let chain: Vec<String> = token
            .all_certificates()?
            .iter()
            .map(|der| STANDARD.encode(der))
            .filter(|der| !signing.contains(der))
            .collect();
        json!({ "certificates": signing, "chain": chain })
    } else {
        let expected = job.certificate_sha256.as_deref().unwrap_or_default();
        let certificate = certificates
            .iter()
            .find(|c| c.sha256.eq_ignore_ascii_case(expected))
            .ok_or_else(|| {
                TokenError(
                    "This token doesn't hold the certificate enrolled for you in pi-dash. Plug in your own token, or enrol this one first.".into(),
                )
            })?;
        let data = STANDARD.decode(job.to_sign.as_deref().unwrap_or_default())?;
        let signature = token.sign(certificate, &data)?;
        json!({
            "certificate": STANDARD.encode(&certificate.der),
            "signature": STANDARD.encode(signature),
        })
    };
    let reply: ServerMessage = ureq::post(&url)
        .send_json(body)
        .map_err(server_error)?
        .into_json()?;
    ui::info(
        reply
            .message
            .as_deref()
            .unwrap_or("Done. You can return to pi-dash."),
    );
    Ok(())
}

/// `pidash-sign list`: shows the signing certificates on the token, to check a setup.
pub fn list_certificates() -> Result<()> {
    let settings = config::load();
    let Some(pin) = ui::ask_pin("List the certificates on your token.") else {
        return Err("Cancelled.".into());
    };
    let token = Token::open(&config::module_path(&settings), &pin)?;
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
