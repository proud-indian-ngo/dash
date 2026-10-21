# pidash-sign

The signing helper signs governance documents with a trustee's DSC token (HyperSecu HYP2003 or any PKCS#11 token). How signing works: [resolutions](../../docs/architecture/governance-resolutions.md#signing).

It handles `pidash-sign://sign?job=<token>&server=<origin>` and `pidash-sign://enrol?...` links, refuses any server but the one in its config, and asks for the PIN in its own window.

| | |
|---|---|
| Server | Baked in at build time from `PIDASH_SIGN_SERVER`: in CI the repository variable of that name, or production. `server` in the config replaces it, for a test dashboard |
| Config | Optional. `~/.config/pidash-sign/config.json` (Mac), `%APPDATA%\pidash-sign\config.json` (Windows): `{ "server": "https://...", "module": "<PKCS#11 library>", "updates": "<release folder URL>" }` |
| Token driver | Mac: `/usr/local/lib/libcastle_v2.1.0.0.dylib`; Windows: `C:\Windows\System32\HYP2003csp11IND.dll`; override with `PIDASH_PKCS11_MODULE` |
| Install | Mac: `pidash-sign-macos.dmg` holds `Proud Indian Signing.app`, an AppleScript applet (`macos/handler.applescript`) that receives `pidash-sign://` links and runs the binary beside it; opening it removes a 0.1.x install (`~/Applications` app running `~/.local/bin/pidash-sign`), which would otherwise compete for the links. Windows: opening `pidash-sign-windows-x64.exe` without a link copies it to `%LOCALAPPDATA%\pidash-sign` and registers the links under HKCU. Neither needs administrator rights. The dashboard's Signing helper page links to the latest release |
| Signing | No paid certificates: the Mac app is ad-hoc signed and the Windows exe unsigned, so trustees pass Gatekeeper (Open Anyway) or SmartScreen (Run anyway) once |
| Release | Bump the version in `Cargo.toml`, push a tag `signing-helper-vX.Y.Z`; CI builds the Mac `.dmg` and app zip (`macos/build-dmg.sh`) and the Windows exe, writes `pidash-sign-manifest.json` (version and each file's SHA-256), signs it with the `SIGNING_HELPER_RELEASE_KEY` secret, and publishes everything as a GitHub release marked latest. The release job waits for approval in the `signing-helper-release` environment, and fails if the tag isn't the `Cargo.toml` version or the secret's public half isn't `RELEASE_KEY` |
| Updates | Before each link the helper fetches the latest release's manifest and `.sig`, verifies it against `RELEASE_KEY` (`src/update.rs`), and when it is newer downloads its build, checks the SHA-256, swaps it in (the Mac app bundle by rename beside it; the Windows exe by moving the running one aside) and reruns the link with the new copy. A lock file beside the app or exe keeps two runs from swapping at once; the second does its job with the copy it has. Any failure falls back to the current helper. A Mac app outside a writable folder (run from the `.dmg`, translocated, or `/Applications` on an account without admin rights) can't update itself; such an account keeps the app in `~/Applications`. `updates` in the config points at another release folder, for testing |
| Release key | Ed25519. The private key is a PEM in the `SIGNING_HELPER_RELEASE_KEY` secret of the `signing-helper-release` environment, and in Bitwarden; keep an offline copy, since a lost key means trustees reinstall by hand. The public half is `RELEASE_KEY`. Rotating it means shipping a helper with the new public key, signed with the old one, before switching the secret |
| Versions | The helper sends `X-Pidash-Sign-Version`; the dashboard refuses a helper older than `MIN_HELPER_VERSION` (`apps/web/src/lib/governance/signing-jobs.ts`) and fails the job with "Update the signing helper". Raise it when a dashboard change needs a new helper, after releasing that helper |

## Develop and test

```bash
cargo test
# Against a software token: SoftHSM2 with a test certificate
export SOFTHSM2_CONF=/tmp/softhsm/softhsm2.conf
PIDASH_SIGN_HEADLESS=1 PIDASH_SIGN_PIN=1234 \
  PIDASH_PKCS11_MODULE=/opt/homebrew/lib/softhsm/libsofthsm2.so \
  cargo run -- list
```

A local build has no server unless `PIDASH_SIGN_SERVER` is set when building, or the config names one. `macos/build-dmg.sh target/release/pidash-sign out.dmg [out.zip]` builds the Mac app as CI does.

`PIDASH_SIGN_HEADLESS=1` replaces the windows with the console, reads the PIN from `PIDASH_SIGN_PIN` and skips updates (tests only). `PIDASH_SIGN_CONFIG` points at another config file.
