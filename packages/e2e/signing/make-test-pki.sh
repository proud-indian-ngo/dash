#!/bin/bash
# Makes this run's throwaway CA and trustee signers (make-test-pki.py) in
# <dir> with the signing service image, whose Python has the libraries it
# needs. Used by run-e2e.sh and the CI e2e job.
#
# Usage: make-test-pki.sh <signing image> <dir>
set -euo pipefail

IMAGE="$1"
DIR="$2"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/make-test-pki.py"

rm -rf "$DIR"
mkdir -p "$DIR"
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$DIR:/out" \
  -v "$SCRIPT:/make-test-pki.py:ro" \
  --entrypoint /app/.venv/bin/python "$IMAGE" \
  /make-test-pki.py /out
