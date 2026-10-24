"""Certificate egress tests: DNS and the wire are synthetic; no network I/O."""

import asyncio
import base64
import socket
from datetime import UTC, datetime, timedelta

import aiohttp
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.x509.oid import AuthorityInformationAccessOID
from fastapi.testclient import TestClient

from pidash_signing.app import create_app
from pidash_signing.validate import ValidationSettings

from .conftest import _name


@pytest.fixture
def network(monkeypatch):
    """Run aiohttp's URL, redirect and DNS paths against an in-memory transport."""
    state = {"requests": [], "resolved": [], "connected": [], "answers": ["93.184.216.34"], "responses": {}}

    async def resolve(self, host, port=0, family=socket.AF_INET):
        state["resolved"].append(host)
        return [dict(hostname=host, host=ip, port=port,
                     family=socket.AF_INET6 if ":" in ip else socket.AF_INET,
                     proto=socket.IPPROTO_TCP, flags=socket.AI_NUMERICHOST)
                for ip in state["answers"]]

    async def connect(self, *args, addr_infos, req, **kwargs):
        # Exercise the final socket policy too, but never connect that socket.
        if self._socket_factory:
            sock = self._socket_factory(addr_infos[0])
            sock.close()
        state["connected"].append(addr_infos[0][4][0])
        protocol = self._factory()
        status, headers, body = state["responses"].get(str(req.url), (200, {}, b"synthetic"))
        response = (f"HTTP/1.1 {status} Test\r\nContent-Length: {len(body)}\r\nConnection: close\r\n"
                    + "".join(f"{key}: {value}\r\n" for key, value in headers.items()) + "\r\n").encode() + body

        class Transport(asyncio.Transport):
            closed = False
            sent = False

            def is_closing(self):
                return self.closed

            def close(self):
                self.closed = True

            def write(self, data):
                if not self.sent:
                    self.sent = True
                    state["requests"].append(str(req.url))
                    asyncio.get_running_loop().call_soon(protocol.data_received, response)

            def get_extra_info(self, name, default=None):
                return default

        transport = Transport()
        protocol.connection_made(transport)
        return transport, protocol

    monkeypatch.setattr(aiohttp.resolver.DefaultResolver, "resolve", resolve)
    monkeypatch.setattr(aiohttp.TCPConnector, "_wrap_create_connection", connect)
    return state


def certificate_with_url(pki, url):
    now = datetime.now(UTC)
    cert = (x509.CertificateBuilder().subject_name(_name("Synthetic Trustee"))
            .issuer_name(pki.ca.subject).public_key(pki.signer_key.public_key())
            .serial_number(42).not_valid_before(now - timedelta(days=1))
            .not_valid_after(now + timedelta(days=1))
            .add_extension(x509.KeyUsage(True, True, False, False, False, False, False, False, False), critical=True)
            .add_extension(x509.AuthorityInformationAccess([
                x509.AccessDescription(AuthorityInformationAccessOID.CA_ISSUERS,
                                       x509.UniformResourceIdentifier(url))
            ]), critical=False).sign(pki.ca_key, hashes.SHA256()))
    return base64.b64encode(cert.public_bytes(serialization.Encoding.DER)).decode()


@pytest.mark.parametrize("fetching", [False, True])
def test_certificate_url_cannot_reach_loopback(pki, network, fetching):
    url = "http://127.0.0.1/issuer"
    with TestClient(create_app(ValidationSettings(trust_roots=[], allow_fetching=fetching), token="secret")) as client:
        response = client.post("/certificate", headers={"Authorization": "Bearer secret"},
                               json={"certificate": certificate_with_url(pki, url)})
    assert response.status_code == 200
    assert response.json() == {"trusted": False}
    assert network["requests"] == []
    assert network["connected"] == []


def test_fetching_disabled_does_not_resolve_public_issuer(pki, network):
    with TestClient(create_app(ValidationSettings(trust_roots=[]), token="secret")) as client:
        client.post("/certificate", headers={"Authorization": "Bearer secret"},
                    json={"certificate": certificate_with_url(pki, "https://ca.example/issuer")})
    assert network["resolved"] == network["requests"] == []


@pytest.mark.parametrize("destination", [
    "http://127.0.0.1/internal", "http://[::1]/internal",
    "http://[::ffff:127.0.0.1]/internal", "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.1/internal", "http://192.168.1.1/internal", "http://172.16.0.1/internal",
    "http://[fe80::1]/internal", "http://[fc00::1]/internal", "file:///etc/hosts",
])
def test_public_redirect_cannot_send_an_internal_request(pki, network, destination):
    url = "https://ca.example/issuer"
    network["responses"][url] = (302, {"Location": destination}, b"")
    with TestClient(create_app(ValidationSettings(trust_roots=[], allow_fetching=True), token="secret")) as client:
        response = client.post("/certificate", headers={"Authorization": "Bearer secret"},
                               json={"certificate": certificate_with_url(pki, url)})
    assert response.status_code == 200
    assert network["requests"] == [url]
    assert network["connected"] == ["93.184.216.34"]


@pytest.mark.parametrize("answers", [["127.0.0.1"], ["93.184.216.34", "10.0.0.1"], ["::ffff:169.254.169.254"]])
def test_dns_answers_must_all_be_public(pki, network, answers):
    network["answers"] = answers
    with TestClient(create_app(ValidationSettings(trust_roots=[], allow_fetching=True), token="secret")) as client:
        client.post("/certificate", headers={"Authorization": "Bearer secret"},
                    json={"certificate": certificate_with_url(pki, "https://ca.example/issuer")})
    assert network["resolved"] == ["ca.example"]
    assert network["requests"] == network["connected"] == []


def test_public_issuer_fetch_and_redirect_work(pki, network):
    from pidash_signing.fetching import public_fetch_session
    from pyhanko_certvalidator.fetchers.aiohttp_fetchers import AIOHttpFetcherBackend

    url = "http://ca.example/issuer"
    target = "https://ca.example/root"
    network["responses"][url] = (302, {"Location": target}, b"")
    network["responses"][target] = (200, {"Content-Type": "application/pkix-cert"}, pki.ca_asn1.dump())

    async def run():
        async with public_fetch_session() as session:
            fetchers = AIOHttpFetcherBackend(session=session).get_fetchers()
            certs = await fetchers.cert_fetcher.fetch_certs(url, "certificate")
            assert [cert.dump() for cert in certs] == [pki.ca_asn1.dump()]
        assert session.closed

    asyncio.run(run())
    assert network["requests"] == [url, target]
    assert network["connected"] == ["93.184.216.34", "93.184.216.34"]


def test_rebinding_on_a_second_connection_is_blocked(network):
    from pidash_signing.fetching import public_fetch_session

    async def run():
        async with public_fetch_session() as session:
            async with session.get("http://ca.example/first") as response:
                await response.read()
            network["answers"] = ["127.0.0.1"]
            with pytest.raises(aiohttp.ClientError):
                await session.get("http://ca.example/second")

    asyncio.run(run())
    assert network["resolved"] == ["ca.example", "ca.example"]
    assert network["requests"] == ["http://ca.example/first"]


@pytest.mark.parametrize("address", ["127.0.0.1", "::ffff:127.0.0.1", "169.254.169.254", "0.0.0.0", "224.0.0.1", "100.64.0.1"])
def test_socket_boundary_refuses_nonpublic_addresses(address):
    from pidash_signing.fetching import public_socket

    with pytest.raises(OSError):
        public_socket((socket.AF_INET6 if ":" in address else socket.AF_INET,
                       socket.SOCK_STREAM, socket.IPPROTO_TCP, "", (address, 80)))
