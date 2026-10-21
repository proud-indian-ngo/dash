//! Windows: opening the downloaded exe installs it for this user. It copies
//! itself to `%LOCALAPPDATA%\pidash-sign` and registers `pidash-sign://`
//! links under HKCU, so nothing needs administrator rights.

use std::path::PathBuf;
use std::process::Command;

use crate::{config, ui};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

const KEY: &str = r"HKCU\Software\Classes\pidash-sign";

fn reg_add(key: &str, name: Option<&str>, value: &str) -> Result<()> {
    let mut command = Command::new("reg");
    command.args(["add", key]);
    match name {
        Some(name) => command.args(["/v", name]),
        None => command.arg("/ve"),
    };
    let status = command.args(["/t", "REG_SZ", "/d", value, "/f"]).status()?;
    if !status.success() {
        return Err(format!("Couldn't register pidash-sign:// links ({key}).").into());
    }
    Ok(())
}

/// Where the helper installs itself, and runs from once installed.
pub fn target() -> Result<PathBuf> {
    let base = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA isn't set.")?;
    Ok(PathBuf::from(base).join("pidash-sign").join("pidash-sign.exe"))
}

pub fn install() -> Result<()> {
    let target = target()?;
    let current = std::env::current_exe()?;
    if current != target {
        if let Some(dir) = target.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::copy(&current, &target)?;
        // The copy keeps the browser's download mark, which would bring
        // SmartScreen back each time a link opens the helper.
        let _ = std::fs::remove_file(format!("{}:Zone.Identifier", target.display()));
    }
    let exe = target.display();
    reg_add(KEY, None, "URL:Proud Indian signing")?;
    reg_add(KEY, Some("URL Protocol"), "")?;
    reg_add(&format!(r"{KEY}\shell\open\command"), None, &format!("\"{exe}\" \"%1\""))?;
    let mut message = format!(
        "The Proud Indian signing helper {} is installed. Plug in your DSC token and return to the dashboard.",
        env!("CARGO_PKG_VERSION")
    );
    let driver = config::module_path(&config::load());
    if !driver.exists() {
        message.push_str(&format!(
            "\n\nYour token's driver wasn't found at {}. Install it from the CA that issued your DSC before you sign.",
            driver.display()
        ));
    }
    ui::info(&message);
    Ok(())
}
