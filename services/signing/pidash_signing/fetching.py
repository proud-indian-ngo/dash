"""Public HTTP(S) transport for untrusted certificate issuer/revocation URLs."""

import socket
import ssl
from contextlib import asynccontextmanager
from ipaddress import IPv6Address, ip_address

import aiohttp
import certifi


def _require_public(address: str) -> None:
    try:
        ip = ip_address(address)
    except ValueError as error:
        raise OSError(
            "Certificate fetch destination must be a numeric public IP"
        ) from error
    if isinstance(ip, IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    if "%" in address or not ip.is_global or ip.is_multicast or ip.is_reserved:
        raise OSError("Certificate fetch destination must be a public IP")


class PublicResolver(aiohttp.abc.AbstractResolver):
    def __init__(self) -> None:
        self._resolver = aiohttp.resolver.DefaultResolver()

    async def resolve(self, host: str, port: int = 0, family: int = socket.AF_INET):
        answers = await self._resolver.resolve(host, port, family)
        for answer in answers:
            _require_public(answer["host"])
        return answers

    async def close(self) -> None:
        await self._resolver.close()


def public_socket(addr_info) -> socket.socket:
    # aiohttp connects this socket to the same numeric sockaddr. No second DNS
    # lookup can replace the validated answer, and IP literals pass here too.
    family, kind, protocol, _, address = addr_info
    _require_public(address[0])
    return socket.socket(family=family, type=kind, proto=protocol)


async def _http_only(request, handler):
    # Client middleware is run again for each redirect, before connection reuse.
    if request.url.scheme not in {"http", "https"} or request.proxy is not None:
        raise aiohttp.ClientConnectionError("Certificate fetching requires direct HTTP(S)")
    return await handler(request)


@asynccontextmanager
async def public_fetch_session():
    resolver = PublicResolver()
    try:
        async with aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(
                resolver=resolver,
                use_dns_cache=False,
                socket_factory=public_socket,
                ssl=ssl.create_default_context(cafile=certifi.where()),
            ),
            middlewares=(_http_only,),
            trust_env=False,
            cookie_jar=aiohttp.DummyCookieJar(),
        ) as session:
            yield session
    finally:
        await resolver.close()
