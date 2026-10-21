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

/// On Windows the PIN prompt is an HTA page that tinyfiledialogs writes in
/// the C locale: the first non-ASCII character truncates the page, and the
/// text is read as HTML. So everything outside plain ASCII becomes an entity.
fn hta_text(text: &str) -> String {
    text.chars()
        .map(|c| match c {
            '\n' => "<br>".to_string(),
            '&' | '<' | '>' | '"' | '\'' => format!("&#{};", c as u32),
            c if c.is_ascii() => c.to_string(),
            c => format!("&#{};", c as u32),
        })
        .collect()
}

pub fn ask_pin(what: &str) -> Option<String> {
    if headless() {
        return std::env::var("PIDASH_SIGN_PIN").ok();
    }
    let text = format!("{what}\n\nEnter your DSC token PIN:");
    let text = if cfg!(windows) { hta_text(&text) } else { printable(&text) };
    tinyfiledialogs::password_box("Proud Indian signing", &text)
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
    use super::{hta_text, printable};

    #[test]
    fn hta_text_is_ascii_without_quotes() {
        assert_eq!(
            hta_text("Sign \u{201C}A & B\u{201D} as Ravi\u{2019}s\nPIN"),
            "Sign &#8220;A &#38; B&#8221; as Ravi&#8217;s<br>PIN"
        );
    }

    #[test]
    fn replaces_ascii_quotes() {
        assert_eq!(
            printable(r#"Sign "Test"; it doesn't"#),
            "Sign \u{201D}Test\u{201D}; it doesn\u{2019}t"
        );
    }
}
