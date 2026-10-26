# pi-dash signing service: the generic KeySeal image with the pi-dash plugin.
# Pass --build-arg KEYSEAL_SERVICE_IMAGE=<image> to build on a local one.
ARG KEYSEAL_SERVICE_IMAGE=ghcr.io/somus/keyseal-service:0.1
FROM ${KEYSEAL_SERVICE_IMAGE}
USER root
COPY pyproject.toml /tmp/plugin/
COPY pidash_signing_plugin /tmp/plugin/pidash_signing_plugin
RUN uv pip install --python /app/.venv/bin/python --no-cache /tmp/plugin && rm -rf /tmp/plugin
USER signing
