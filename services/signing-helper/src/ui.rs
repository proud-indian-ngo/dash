//! The helper's own windows: the PIN prompt and the outcome. With
//! `PIDASH_SIGN_HEADLESS=1` (tests, scripts) it reads the PIN from
//! `PIDASH_SIGN_PIN` and prints instead.

/// tinyfiledialogs refuses text with ASCII quotes ("INVALID MESSAGE WITH
/// QUOTES"), so they become typographic ones.
fn printable(text: &str) -> String {
    text.replace('\'', "\u{2019}").replace('"', "\u{201D}")
}

pub fn headless() -> bool {
    std::env::var("PIDASH_SIGN_HEADLESS").is_ok_and(|v| v == "1")
}

pub fn ask_pin(what: &str) -> Option<String> {
    if headless() {
        return std::env::var("PIDASH_SIGN_PIN").ok();
    }
    tinyfiledialogs::password_box(
        "Proud Indian signing",
        &printable(&format!("{what}\n\nEnter your DSC token PIN:")),
    )
    .filter(|pin| !pin.is_empty())
}

pub fn info(message: &str) {
    if headless() {
        println!("{message}");
        return;
    }
    tinyfiledialogs::message_box_ok(
        "Proud Indian signing",
        &printable(message),
        tinyfiledialogs::MessageBoxIcon::Info,
    );
}

pub fn error(message: &str) {
    if headless() {
        eprintln!("{message}");
        return;
    }
    tinyfiledialogs::message_box_ok(
        "Proud Indian signing",
        &printable(message),
        tinyfiledialogs::MessageBoxIcon::Error,
    );
}

#[cfg(test)]
mod tests {
    use super::printable;

    #[test]
    fn replaces_ascii_quotes() {
        assert_eq!(
            printable(r#"Sign "Test"; it doesn't"#),
            "Sign \u{201D}Test\u{201D}; it doesn\u{2019}t"
        );
    }
}
