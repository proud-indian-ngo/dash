//! pidash-sign: signs Proud Indian governance documents with a DSC token.
//!
//! The browser opens `pidash-sign://sign?job=<token>&server=<origin>` (or
//! `enrol`). The helper fetches the job from the server it was installed for,
//! asks for the token PIN in its own window, signs on the token and posts
//! the signature back. The PIN is never stored or sent anywhere.

mod config;
mod job;
mod token;
mod ui;

use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let result = match args.first().map(String::as_str) {
        Some("--version") => {
            println!("pidash-sign {}", env!("CARGO_PKG_VERSION"));
            Ok(())
        }
        Some("list") => job::list_certificates(),
        Some(link) if link.starts_with("pidash-sign://") => job::run_link(link),
        _ => {
            eprintln!(
                "Usage: pidash-sign <pidash-sign://...> | list | --version\n\
                 Opened from the dashboard when you sign a circular or enrol your DSC."
            );
            return ExitCode::from(2);
        }
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            ui::error(&error.to_string());
            ExitCode::FAILURE
        }
    }
}
