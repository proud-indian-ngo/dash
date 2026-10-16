//! The helper's own windows: the PIN prompt and the outcome. With
//! `PIDASH_SIGN_HEADLESS=1` (tests, scripts) it reads the PIN from
//! `PIDASH_SIGN_PIN` and prints instead.

fn headless() -> bool {
    std::env::var("PIDASH_SIGN_HEADLESS").is_ok_and(|v| v == "1")
}

pub fn ask_pin(what: &str) -> Option<String> {
    if headless() {
        return std::env::var("PIDASH_SIGN_PIN").ok();
    }
    tinyfiledialogs::password_box("pi-dash signing", &format!("{what}\n\nEnter your DSC token PIN:"))
        .filter(|pin| !pin.is_empty())
}

pub fn info(message: &str) {
    if headless() {
        println!("{message}");
        return;
    }
    tinyfiledialogs::message_box_ok(
        "pi-dash signing",
        message,
        tinyfiledialogs::MessageBoxIcon::Info,
    );
}

pub fn error(message: &str) {
    if headless() {
        eprintln!("{message}");
        return;
    }
    tinyfiledialogs::message_box_ok(
        "pi-dash signing",
        message,
        tinyfiledialogs::MessageBoxIcon::Error,
    );
}
