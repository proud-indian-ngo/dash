# pi-dash signing plugin

pi-dash's additions to the generic signr signing service, installed into its image:

- the `proud-indian` stamp style (`"stampStyle": "proud-indian"` on `/sign/start`): the built-in stamp dated in India time, with the Proud Indian symbol behind it;
- `POST /pidash/prepare`: pi-dash's former `/prepare`, same request, response and errors: one empty signature field per trustee, each optionally with an answers field its signature locks. At cutover, pi-dash's web app must call `/pidash/prepare` instead of `/prepare`.
- `POST /fill`: sets a trustee's empty answers field, `{"pdf", "name", "value"}`, and returns the PDF. Two fills of the same input are identical byte for byte.

## Develop

`signr-service` isn't published yet, so uv can't lock this project (`managed = false` in `pyproject.toml`). Install it from a signr checkout into the venv by hand, then run the tests through the generic service:

```bash
cd services/signing-plugin
uv venv
uv pip install -e /path/to/signr/service -e '.[test]'
uv run pytest -q
```

## Image

`Dockerfile` builds on the generic image and installs the plugin. Its base tag is a placeholder until signr-service is published:

```bash
docker build --build-arg SIGNR_SERVICE_IMAGE=signr-service -t pidash-signing services/signing-plugin
```

Configuration is the generic service's; see its README.
