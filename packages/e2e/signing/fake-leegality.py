"""Leegality's API for one E2E run, so Aadhaar eSign stays offline.

Runs inside the E2E signing service's container, beside the fake TSA. It
keeps documents in memory and answers what the dashboard calls: create
(`POST /api/v2.1/sign/request`), details (`GET /api/v3.3/document/details`,
whose file link it serves) and delete. `POST /test/sign` with
`{"irn"?, "name"}` (the document's reference, else the newest document
the named signer hasn't signed) plays a trustee signing: the run's signer
certificate in that name signs in a field it adds in their box, the field
taking the last cross-reference stream's object number, as Leegality's do.

Usage: fake-leegality.py <pki dir> <port> <public base URL>
"""

from __future__ import annotations

import base64
import io
import json
import re
import sys
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from asn1crypto import keys, pem, x509
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign import fields, signers, timestamps
from pyhanko_certvalidator.registry import SimpleCertificateStore

DOCUMENTS: dict[str, dict] = {}


def der(data: bytes) -> bytes:
    return pem.unarmor(data)[2] if pem.detect(data) else data


def signer_for(pki: Path, name: str) -> signers.SimpleSigner:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    data = json.loads((pki / "signers" / f"{slug}.json").read_text())
    return signers.SimpleSigner(
        signing_cert=x509.Certificate.load(base64.b64decode(data["certificate"])),
        signing_key=keys.PrivateKeyInfo.load(der(data["privateKey"].encode())),
        cert_registry=SimpleCertificateStore.from_certs(
            [x509.Certificate.load(der((pki / "roots" / "test-ca.pem").read_bytes()))]
        ),
    )


def sign(pki: Path, document: dict, invitee: dict) -> None:
    pdf = document["file"]
    [appearance] = invitee["appearances"]
    box = tuple(int(appearance[k]) for k in ("x1", "y1", "x2", "y2"))
    page = int(appearance["page"]) - 1
    writer = IncrementalPdfFileWriter(io.BytesIO(pdf), strict=False)
    xrefs = PdfFileReader(io.BytesIO(pdf), strict=False).xrefs
    stream_ref = xrefs.get_xref_container_info(xrefs.total_revisions - 1).stream_ref
    if stream_ref is not None:
        writer._lastobj_id = stream_ref.idnum - 1
    field = f"leegality_{uuid.uuid4().hex[:8]}"
    out = signers.sign_pdf(
        writer,
        signers.PdfSignatureMetadata(field_name=field),
        signer=signer_for(pki, invitee["name"]),
        new_field_spec=fields.SigFieldSpec(field, box=box, on_page=page),
        # Timestamped like Leegality's, by the fake TSA beside it.
        timestamper=timestamps.HTTPTimeStamper("http://127.0.0.1:8081"),
    )
    document["file"] = out.getvalue()
    invitee["signed"] = True


def main(pki: Path, port: int, public_url: str) -> None:
    class Handler(BaseHTTPRequestHandler):
        def reply(self, status: int, body: bytes, kind: str = "application/json") -> None:
            self.send_response(status)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def json(self, body: object) -> None:
            self.reply(200, json.dumps(body).encode())

        def body(self) -> dict:
            return json.loads(self.rfile.read(int(self.headers.get("Content-Length", "0"))))

        def do_POST(self) -> None:  # noqa: N802
            path = urlparse(self.path).path
            if path == "/api/v2.1/sign/request":
                request = self.body()
                document_id = uuid.uuid4().hex.upper()
                invitees = [{**i, "signed": False} for i in request["invitees"]]
                DOCUMENTS[document_id] = {
                    "file": base64.b64decode(request["file"]["file"]),
                    "invitees": invitees,
                    "irn": request.get("irn"),
                }
                self.json(
                    {
                        "data": {
                            "documentId": document_id,
                            "invitations": [
                                {"email": i["email"], "name": i["name"]} for i in invitees
                            ],
                        },
                        "messages": [],
                        "status": 1,
                    }
                )
            elif path == "/test/sign":
                request = self.body()
                # By reference, or by its prefix (the trustee-keyed declaration
                # reference) for the newest the named signer hasn't signed.
                if "irn" in request:
                    matches = [d for d in DOCUMENTS.values() if d["irn"] == request["irn"]]
                else:
                    matches = [
                        d
                        for d in DOCUMENTS.values()
                        if (d["irn"] or "").startswith(request["irnPrefix"])
                        and any(i["name"] == request["name"] and not i["signed"] for i in d["invitees"])
                    ]
                document = matches[-1]
                [invitee] = [i for i in document["invitees"] if i["name"] == request["name"]]
                sign(pki, document, invitee)
                self.json({"status": 1})
            else:
                self.reply(404, b"{}")

        def do_GET(self) -> None:  # noqa: N802
            url = urlparse(self.path)
            query = {k: v[0] for k, v in parse_qs(url.query).items()}
            if url.path == "/api/v3.3/document/details":
                document = DOCUMENTS.get(query.get("documentId", ""))
                if document is None:
                    self.json({"data": {}, "messages": [{"message": "No document"}], "status": 0})
                    return
                document_id = query["documentId"]
                self.json(
                    {
                        "data": {
                            "document": {"status": "SENT"},
                            "file": f"{public_url}/files/{document_id}"
                            if query.get("file") == "true"
                            else None,
                            "invitations": [
                                {
                                    "email": i["email"],
                                    "invitationStatus": {"signed": i["signed"]},
                                    "invitationUrl": f"{public_url}/sign/{document_id}/{n}",
                                }
                                for n, i in enumerate(document["invitees"])
                            ],
                        },
                        "messages": [],
                        "status": 1,
                    }
                )
            elif url.path.startswith("/files/"):
                document = DOCUMENTS.get(url.path.removeprefix("/files/"))
                if document is None:
                    self.reply(404, b"")
                else:
                    self.reply(200, document["file"], "application/pdf")
            elif url.path.startswith("/sign/"):
                self.reply(200, b"<h1>Leegality (E2E)</h1>", "text/html")
            else:
                self.reply(404, b"{}")

        def do_DELETE(self) -> None:  # noqa: N802
            query = {k: v[0] for k, v in parse_qs(urlparse(self.path).query).items()}
            found = DOCUMENTS.pop(query.get("documentId", ""), None)
            self.json({"data": {}, "status": 1 if found else 0})

        def log_message(self, *_: object) -> None:
            pass

    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main(Path(sys.argv[1]), int(sys.argv[2]), sys.argv[3].rstrip("/"))
