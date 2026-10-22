# pi-dash signing service: the generic signr image with the pi-dash plugin.
# PLACEHOLDER: set the owner once signr-service is published to GHCR, or pass
# --build-arg SIGNR_SERVICE_IMAGE=<image>.
ARG SIGNR_SERVICE_IMAGE=ghcr.io/PLACEHOLDER-OWNER/signr-service:0.1
FROM ${SIGNR_SERVICE_IMAGE}
USER root
COPY pyproject.toml /tmp/plugin/
COPY pidash_signing_plugin /tmp/plugin/pidash_signing_plugin
RUN uv pip install --python /app/.venv/bin/python --no-cache /tmp/plugin && rm -rf /tmp/plugin
USER signing
