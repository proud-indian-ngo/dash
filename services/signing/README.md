# pi-dash signing service

Internal pyHanko service for governance PDFs. What it checks and why: [governance](../../docs/architecture/governance.md#signing-service).

Every route except `GET /health` needs `Authorization: Bearer $SIGNING_SERVICE_TOKEN`, the value the web app sends. `SIGNING_TRUST_ROOTS_DIR` replaces `roots/`; `intermediates/` completes chains a PDF leaves out; `SIGNING_ALLOW_FETCHING=true` lets validation fetch OCSP and CRL data.

```bash
cd services/signing
uv sync
uv run pytest
SIGNING_SERVICE_TOKEN=local-signing-token uv run uvicorn pidash_signing.app:app --port 8090
```
