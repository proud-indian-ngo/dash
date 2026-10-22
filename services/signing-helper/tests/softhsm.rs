//! End to end against SoftHSM: the helper, headless, signs jobs served here
//! with an RSA-2048, a P-256 and a P-384 key, refuses tampered
//! SignedAttributes before logging in, and refuses a digest that doesn't suit
//! the key.
//! Runs when `PIDASH_SIGN_SOFTHSM_MODULE` names libsofthsm2, and needs
//! softhsm2-util, pkcs11-tool (OpenSC) and openssl on the PATH.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use sha2::{Digest, Sha256};
use x509_parser::asn1_rs::oid;

const PIN: &str = "1234";
const WRONG_PIN: &str = "0000";

fn run(command: &mut Command) -> Output {
    let output = command.output().unwrap();
    assert!(
        output.status.success(),
        "{command:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    output
}

fn der_tlv(tag: u8, content: &[u8]) -> Vec<u8> {
    let mut out = vec![tag];
    if content.len() >= 0x80 {
        out.push(0x81);
    }
    out.push(content.len() as u8);
    out.extend_from_slice(content);
    out
}

fn attribute(oid_raw: &[u8], value: Vec<u8>) -> Vec<u8> {
    der_tlv(
        0x30,
        &[der_tlv(0x06, oid_raw), der_tlv(0x31, &value)].concat(),
    )
}

/// SignedAttributes as the signing service builds them, with a
/// `digest_len`-byte messageDigest, plus `extra`.
fn signed_attributes(certificate: &[u8], digest_len: usize, extra: Option<Vec<u8>>) -> Vec<u8> {
    let cert_id = der_tlv(0x30, &der_tlv(0x04, &Sha256::digest(certificate)));
    let mut attributes = vec![
        attribute(
            &oid!(raw 1.2.840.113549.1.9.3),
            der_tlv(0x06, &oid!(raw 1.2.840.113549.1.7.1)),
        ),
        attribute(&oid!(raw 1.2.840.113549.1.9.4), der_tlv(0x04, &vec![0xab; digest_len])),
        attribute(
            &oid!(raw 1.2.840.113549.1.9.16.2.47),
            der_tlv(0x30, &der_tlv(0x30, &cert_id)),
        ),
    ];
    attributes.extend(extra);
    attributes.sort();
    der_tlv(0x31, &attributes.concat())
}

/// Serves `job` until the helper posts back, and returns what it posted.
fn serve(listener: TcpListener, job: String) -> serde_json::Value {
    loop {
        let (mut stream, _) = listener.accept().unwrap();
        let mut reader = BufReader::new(stream.try_clone().unwrap());
        let mut request = String::new();
        reader.read_line(&mut request).unwrap();
        let mut length = 0;
        loop {
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                length = value.trim().parse().unwrap();
            }
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).unwrap();
        let reply = if request.starts_with("GET") {
            job.clone()
        } else {
            r#"{"message":"Signed."}"#.into()
        };
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
            reply.len()
        )
        .unwrap();
        if request.starts_with("POST") {
            return serde_json::from_slice(&body).unwrap();
        }
    }
}

/// Runs the helper on a sign job for `certificate` and returns its exit and what it posted.
fn sign_job(
    dir: &Path,
    module: &str,
    certificate: &[u8],
    to_sign: &[u8],
    digest_algorithm: &str,
    pin: &str,
) -> (Output, serde_json::Value) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let server = format!("http://{}", listener.local_addr().unwrap());
    let config = dir.join("config.json");
    std::fs::write(
        &config,
        serde_json::json!({ "server": server, "module": module }).to_string(),
    )
    .unwrap();
    let job = serde_json::json!({
        "kind": "sign",
        "title": "Test circular",
        "signer": "Test Trustee",
        "toSign": STANDARD.encode(to_sign),
        "digestAlgorithm": digest_algorithm,
        "certificateSha256": hex::encode(Sha256::digest(certificate)),
    })
    .to_string();
    let posted = std::thread::spawn(move || serve(listener, job));
    let link = format!("pidash-sign://sign?job=test-job&server={server}");
    let output = Command::new(env!("CARGO_BIN_EXE_pidash-sign"))
        .arg(link)
        .env("SOFTHSM2_CONF", dir.join("softhsm2.conf"))
        .env("PIDASH_SIGN_CONFIG", &config)
        .env("PIDASH_SIGN_HEADLESS", "1")
        .env("PIDASH_SIGN_PIN", pin)
        .env_remove("PIDASH_PKCS11_MODULE")
        .output()
        .unwrap();
    (output, posted.join().unwrap())
}

#[test]
fn signs_with_rsa_p256_and_p384_keys_on_softhsm() {
    let Ok(module) = std::env::var("PIDASH_SIGN_SOFTHSM_MODULE") else {
        eprintln!("skipped: set PIDASH_SIGN_SOFTHSM_MODULE to libsofthsm2 to run");
        return;
    };
    let dir: PathBuf =
        std::env::temp_dir().join(format!("pidash-sign-softhsm-{}", std::process::id()));
    std::fs::create_dir_all(dir.join("tokens")).unwrap();
    let conf = dir.join("softhsm2.conf");
    std::fs::write(
        &conf,
        format!("directories.tokendir = {}\n", dir.join("tokens").display()),
    )
    .unwrap();
    run(Command::new("softhsm2-util")
        .env("SOFTHSM2_CONF", &conf)
        .args([
            "--init-token",
            "--free",
            "--label",
            "test",
            "--pin",
            PIN,
            "--so-pin",
            "5678",
        ]));
    let keys: [(&str, &str, &[&str]); 3] = [
        ("rsa", "01", &["-newkey", "rsa:2048"]),
        (
            "ec",
            "02",
            &["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256"],
        ),
        (
            "p384",
            "03",
            &["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-384"],
        ),
    ];
    for (name, id, newkey) in keys {
        run(Command::new("openssl")
            .current_dir(&dir)
            .args([
                "req",
                "-x509",
                "-nodes",
                "-days",
                "1",
                "-subj",
                &format!("/CN=Test {name}"),
            ])
            .args(newkey)
            .args([
                "-keyout",
                &format!("{name}.pem"),
                "-outform",
                "DER",
                "-out",
                &format!("{name}.der"),
            ]));
        run(Command::new("openssl").current_dir(&dir).args([
            "pkey",
            "-in",
            &format!("{name}.pem"),
            "-outform",
            "DER",
            "-out",
            &format!("{name}.key"),
        ]));
        for (file, kind) in [
            (format!("{name}.key"), "privkey"),
            (format!("{name}.der"), "cert"),
        ] {
            run(Command::new("pkcs11-tool")
                .current_dir(&dir)
                .env("SOFTHSM2_CONF", &conf)
                .args([
                    "--module",
                    &module,
                    "--login",
                    "--pin",
                    PIN,
                    "--write-object",
                    &file,
                ])
                .args(["--type", kind, "--id", id, "--label", name, "--usage-sign"]));
        }
    }

    // The P-384 key signs SHA-384 with CKM_ECDSA; the helper takes only a
    // 96-byte r||s from it.
    for (name, digest_algorithm, digest_len) in [
        ("rsa", "sha256", 32),
        ("ec", "sha256", 32),
        ("p384", "sha384", 48),
    ] {
        let certificate = std::fs::read(dir.join(format!("{name}.der"))).unwrap();
        let to_sign = signed_attributes(&certificate, digest_len, None);
        let (output, posted) =
            sign_job(&dir, &module, &certificate, &to_sign, digest_algorithm, PIN);
        assert!(
            output.status.success(),
            "{name}: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        assert_eq!(posted["certificate"], STANDARD.encode(&certificate));
        let signature = STANDARD
            .decode(posted["signature"].as_str().unwrap())
            .unwrap();
        std::fs::write(dir.join("to-sign"), &to_sign).unwrap();
        std::fs::write(dir.join("signature"), signature).unwrap();
        let public_key = run(Command::new("openssl").current_dir(&dir).args([
            "x509",
            "-inform",
            "DER",
            "-in",
            &format!("{name}.der"),
            "-pubkey",
            "-noout",
        ]));
        std::fs::write(dir.join("public.pem"), public_key.stdout).unwrap();
        run(Command::new("openssl").current_dir(&dir).args([
            "dgst",
            &format!("-{digest_algorithm}"),
            "-verify",
            "public.pem",
            "-signature",
            "signature",
            "to-sign",
        ]));
    }

    // With the wrong PIN, a job that gets as far as the token fails at login...
    let certificate = std::fs::read(dir.join("rsa.der")).unwrap();
    let to_sign = signed_attributes(&certificate, 32, None);
    let (output, posted) = sign_job(&dir, &module, &certificate, &to_sign, "sha256", WRONG_PIN);
    assert!(!output.status.success());
    assert!(
        posted["failed"]
            .as_str()
            .unwrap()
            .starts_with("The token refused the PIN")
    );

    // ...so refusing tampered SignedAttributes with it shows the check comes first.
    let smime_capabilities = attribute(&oid!(raw 1.2.840.113549.1.9.15), der_tlv(0x30, &[]));
    for (to_sign, digest_algorithm, refusal) in [
        (
            signed_attributes(&certificate, 32, Some(smime_capabilities)),
            "sha256",
            "unexpected attribute 1.2.840.113549.1.9.15",
        ),
        (
            signed_attributes(&certificate, 48, None),
            "sha256",
            "messageDigest isn't a Sha256 digest",
        ),
    ] {
        let (output, posted) = sign_job(
            &dir,
            &module,
            &certificate,
            &to_sign,
            digest_algorithm,
            WRONG_PIN,
        );
        assert!(!output.status.success());
        let failed = posted["failed"].as_str().unwrap();
        assert!(
            failed.starts_with("The dashboard asked to sign something this helper won't sign")
                && failed.contains(refusal),
            "{failed}"
        );
    }

    // The key's curve is read from the token after login.
    for (name, digest_len, digest_algorithm, suited) in [
        ("ec", 48, "sha384", "Sha256"),
        ("p384", 32, "sha256", "Sha384"),
    ] {
        let certificate = std::fs::read(dir.join(format!("{name}.der"))).unwrap();
        let to_sign = signed_attributes(&certificate, digest_len, None);
        let (output, posted) =
            sign_job(&dir, &module, &certificate, &to_sign, digest_algorithm, PIN);
        assert!(!output.status.success());
        assert!(
            posted["failed"]
                .as_str()
                .unwrap()
                .contains(&format!("this certificate's EC key signs with {suited}"))
        );
    }

    let _ = std::fs::remove_dir_all(&dir);
}
