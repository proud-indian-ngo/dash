"""A timestamp authority (RFC 3161) for one E2E run, so the run stays offline.

Runs inside the E2E signing service's container, beside the service, which
timestamps signatures and long-term copies with it (`SIGNING_TSA_URL`).
Its certificate is under the run's test CA (make-test-pki.py), so the
service trusts its timestamps.

Usage: fake-tsa.py <tsa dir> <port>
"""

from __future__ import annotations

import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from asn1crypto import keys, pem, tsp, x509
from pyhanko.sign.timestamps.dummy_client import DummyTimeStamper


def load(path: Path) -> bytes:
    _, _, der = pem.unarmor(path.read_bytes())
    return der


def main(directory: Path, port: int) -> None:
    stamper = DummyTimeStamper(
        tsa_cert=x509.Certificate.load(load(directory / "certificate.pem")),
        tsa_key=keys.PrivateKeyInfo.load(load(directory / "key.pem")),
    )

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            reply = stamper.request_tsa_response(tsp.TimeStampReq.load(body)).dump()
            self.send_response(200)
            self.send_header("Content-Type", "application/timestamp-reply")
            self.send_header("Content-Length", str(len(reply)))
            self.end_headers()
            self.wfile.write(reply)

    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main(Path(sys.argv[1]), int(sys.argv[2]))
