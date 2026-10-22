# pi-dash signing plugin

pi-dash's additions to the generic signr signing service, installed into its image:

- the `proud-indian` stamp style (`"stampStyle": "proud-indian"` on `/sign/start`): the built-in stamp dated in India time, with the Proud Indian symbol behind it;
- `POST /pidash/prepare`: one empty signature field per trustee, each optionally with an answers field its signature locks. The web app calls it instead of the generic `/prepare`.
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
docker build -t signr-service ../signr/service
docker build --build-arg SIGNR_SERVICE_IMAGE=signr-service -t pidash-signing services/signing-plugin
docker run --rm -p 8090:8080 -e SIGNING_SERVICE_TOKEN="$SIGNING_SERVICE_TOKEN" -e TZ=Asia/Kolkata pidash-signing
```

The last line serves it locally on the port `.env.sample` names, with the token from `.env`.

Configuration is the generic service's; see its README.
