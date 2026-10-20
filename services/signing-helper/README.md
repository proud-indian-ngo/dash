# pidash-sign

The pi-dash signing helper signs governance documents with a trustee's DSC token (HyperSecu HYP2003 or any PKCS#11 token). How signing works: [resolutions](../../docs/architecture/governance-resolutions.md#signing).

It handles `pidash-sign://sign?job=<token>&server=<origin>` and `pidash-sign://enrol?...` links, refuses any server but the one in its config, and asks for the PIN in its own window.

| | |
|---|---|
| Config | `~/.config/pidash-sign/config.json` (Mac), `%APPDATA%\pidash-sign\config.json` (Windows): `{ "server": "https://...", "module": "<PKCS#11 library>" }` |
| Token driver | Mac: `/usr/local/lib/libcastle_v2.1.0.0.dylib`; Windows: `C:\Windows\System32\castle.dll` (confirm on a trustee's laptop before anyone enrols); override with `PIDASH_PKCS11_MODULE` |
| Install | `install/install-macos.sh <server>` (ad-hoc signed, links via a small AppleScript app); `install/install-windows.ps1 -Server <server> [-Module <path>]` (registry, per user) |
| Release | Push a tag `signing-helper-vX.Y.Z`; CI builds the Mac universal binary and the Windows binary into the GitHub release |

## Develop and test

```bash
cargo test
# Against a software token: SoftHSM2 with a test certificate
export SOFTHSM2_CONF=/tmp/softhsm/softhsm2.conf
PIDASH_SIGN_HEADLESS=1 PIDASH_SIGN_PIN=1234 \
  PIDASH_PKCS11_MODULE=/opt/homebrew/lib/softhsm/libsofthsm2.so \
  cargo run -- list
```

`PIDASH_SIGN_HEADLESS=1` replaces the windows with the console and reads the PIN from `PIDASH_SIGN_PIN` (tests only). `PIDASH_SIGN_CONFIG` points at another config file.
