# pidash-sign

The pi-dash signing helper: signs governance documents with a trustee's DSC token (HyperSecu HYP2003 or any PKCS#11 token). See `docs/architecture/governance.md`, section 5.

pi-dash opens `pidash-sign://sign?job=<token>&server=<origin>` (or `enrol`). The helper:

1. refuses any server other than the one in its config (written by the installer), so a crafted link can't make the token sign for someone else;
2. fetches the job from `<server>/api/signing/jobs/<token>` (one-time, 15 minutes);
3. asks for the token PIN in its own window (never stored or sent);
4. signs the CMS signed attributes with `CKM_SHA256_RSA_PKCS`, using the certificate pi-dash enrolled for the trustee, or, for enrolment, reads the certificates on the token;
5. posts the result back and shows pi-dash's answer.

| | |
|---|---|
| Config | `~/.config/pidash-sign/config.json` (Mac), `%APPDATA%\pidash-sign\config.json` (Windows): `{ "server": "https://...", "module": "<PKCS#11 library>" }` |
| Token driver | Mac: `/usr/local/lib/libcastle_v2.1.0.0.dylib`; Windows: `C:\Windows\System32\castle.dll` (to confirm on a trustee's laptop); override with `PIDASH_PKCS11_MODULE` |
| Install | `install/install-macos.sh <server>` (ad-hoc signed, links via a small AppleScript app); `install/install-windows.ps1 -Server <server>` (registry, per user) |
| Release | Push a tag `signing-helper-vX.Y.Z`; `.github/workflows/signing-helper.yml` builds the Mac universal binary and the Windows build and attaches them to the release |

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
