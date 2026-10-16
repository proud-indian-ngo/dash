# pi-dash signing service

Internal pyHanko service for governance PDFs (`docs/architecture/governance.md`, section 5). Phase 1 validates signed PDFs for the vault and the history import; preparing signature fields and embedding signatures arrive in later phases.

| Route | Auth | Does |
|---|---|---|
| `GET /health` | none | `{ ok, trustRoots }` |
| `POST /validate` | `Authorization: Bearer $SIGNING_SERVICE_TOKEN` | Body: the PDF (max 25 MB). Returns `{ status: valid \| invalid \| no_signatures, signatures: [...] }` with certificate facts and pyHanko's verdicts, never document text |

Environment: `SIGNING_SERVICE_TOKEN` (required; the web app sends the same value), `SIGNING_TRUST_ROOTS_DIR` (defaults to `roots/`), `SIGNING_ALLOW_FETCHING=true` to let validation fetch OCSP/CRL data.

```bash
cd services/signing
uv sync
uv run pytest
SIGNING_SERVICE_TOKEN=dev uv run uvicorn pidash_signing.app:app --port 8090
```
