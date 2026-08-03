from __future__ import annotations

import base64
import binascii
import hashlib
import json
import re
import uuid
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

import yaml

from pawlink.config.parsers.base import ConfigParser
from pawlink.models.profile import EndpointProfile, ProtocolType

PROXY_URI_SCHEME_RE = re.compile(r"^(vless|ss|trojan|vmess|hysteria2|hy2)://", re.I)


def _slug(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "-", name.strip())[:64] or str(uuid.uuid4())[:8]


def _make_id(name: str, host: str, port: int | str, protocol: str = "") -> str:
    """Stable, endpoint-unique profile id.

    A hash of the endpoint is appended so nodes sharing a display name
    do not collide and silently overwrite each other on import.
    """
    digest = hashlib.sha1(f"{protocol}|{host}|{port}".encode()).hexdigest()[:8]
    return f"{_slug(name)}-{digest}"


def _decode_ss_userinfo(userinfo: str) -> tuple[str, str]:
    """Decode Shadowsocks userinfo into (method, password).

    Handles both plaintext ``method:password`` and SIP002 base64 forms.
    """
    candidate = unquote(userinfo)
    if ":" in candidate:
        method, password = candidate.split(":", 1)
        return method, password
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            padded = candidate + "=" * (-len(candidate) % 4)
            decoded = decoder(padded).decode("utf-8")
            if ":" in decoded:
                method, password = decoded.split(":", 1)
                return method, password
        except Exception:
            continue
    return "unknown", candidate


class ClashYamlParser(ConfigParser):
    def can_parse(self, raw: str) -> bool:
        text = raw.strip()
        if not text.startswith(("proxies:", "proxy-groups:", "mixed-port:", "port:")):
            if "proxies:" not in text[:4096]:
                return False
        try:
            data = yaml.safe_load(text)
            return isinstance(data, dict) and "proxies" in data
        except yaml.YAMLError:
            return False

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        data = yaml.safe_load(raw)
        profiles: list[EndpointProfile] = []
        for proxy in data.get("proxies", []):
            profile = _clash_proxy_to_profile(proxy, source)
            if profile:
                profiles.append(profile)
        return profiles


def _clash_proxy_to_profile(proxy: dict[str, Any], source: str | None) -> EndpointProfile | None:
    name = str(proxy.get("name", "unnamed"))
    ptype = str(proxy.get("type", "")).lower()
    host = proxy.get("server") or proxy.get("host")
    port = proxy.get("port")
    if not host or not port:
        return None

    protocol_map = {
        "vless": ProtocolType.VLESS,
        "ss": ProtocolType.SHADOWSOCKS,
        "shadowsocks": ProtocolType.SHADOWSOCKS,
        "hysteria2": ProtocolType.HYSTERIA2,
        "trojan": ProtocolType.TROJAN,
        "vmess": ProtocolType.VMess,
    }
    protocol = protocol_map.get(ptype, ProtocolType.UNKNOWN)

    tls = bool(proxy.get("tls"))
    sni = proxy.get("sni") or proxy.get("servername")

    reality = proxy.get("reality-opts") or proxy.get("reality") or {}
    if isinstance(reality, dict):
        pub_key = reality.get("public-key") or reality.get("public_key")
        short_id = reality.get("short-id") or reality.get("short_id")
    else:
        pub_key = proxy.get("public-key")
        short_id = proxy.get("short-id")

    extra = {k: v for k, v in proxy.items() if k not in {"name", "type", "server", "port"}}
    # Clash stores the Shadowsocks method under "cipher"; normalize to "method"
    # so the core config builder finds it regardless of the input format.
    if proxy.get("cipher") and not extra.get("method"):
        extra["method"] = proxy["cipher"]

    return EndpointProfile(
        id=_make_id(name, str(host), port, ptype),
        name=name,
        protocol=protocol,
        host=str(host),
        port=int(port),
        uuid=proxy.get("uuid") or proxy.get("id"),
        password=proxy.get("password") or proxy.get("auth"),
        tls_sni=str(sni) if sni else None,
        tls_enabled=tls,
        reality_public_key=str(pub_key) if pub_key else None,
        reality_short_id=str(short_id) if short_id else None,
        network=proxy.get("network") or proxy.get("type-network"),
        flow=proxy.get("flow"),
        extra=extra,
        source=source,
    )


class JsonConfigParser(ConfigParser):
    def can_parse(self, raw: str) -> bool:
        text = raw.strip()
        if not text.startswith(("{", "[")):
            return False
        try:
            data = json.loads(text)
            return isinstance(data, (dict, list))
        except json.JSONDecodeError:
            return False

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        data = json.loads(raw)
        profiles: list[EndpointProfile] = []

        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    p = _json_outbound_to_profile(item, source)
                    if p:
                        profiles.append(p)
            return profiles

        outbounds = data.get("outbounds") or data.get("proxies") or []
        for outbound in outbounds:
            p = _json_outbound_to_profile(outbound, source)
            if p:
                profiles.append(p)
        return profiles


def _json_outbound_to_profile(item: dict[str, Any], source: str | None) -> EndpointProfile | None:
    if item.get("type") == "direct" or item.get("tag") == "direct":
        return None

    name = str(item.get("tag") or item.get("name") or "unnamed")
    otype = str(item.get("type", "")).lower()

    protocol_map = {
        "vless": ProtocolType.VLESS,
        "shadowsocks": ProtocolType.SHADOWSOCKS,
        "hysteria2": ProtocolType.HYSTERIA2,
        "trojan": ProtocolType.TROJAN,
        "vmess": ProtocolType.VMess,
    }
    protocol = protocol_map.get(otype, ProtocolType.UNKNOWN)

    server = item.get("server") or item.get("server_address")
    port = item.get("server_port") or item.get("port")
    if not server or not port:
        return None

    tls = item.get("tls") or {}
    sni = None
    if isinstance(tls, dict):
        sni = tls.get("server_name") or tls.get("sni")
    elif isinstance(tls, bool):
        sni = item.get("server_name")

    reality = item.get("reality") or (tls.get("reality") if isinstance(tls, dict) else None) or {}
    pub_key = reality.get("public_key") if isinstance(reality, dict) else None
    short_id = reality.get("short_id") if isinstance(reality, dict) else None

    return EndpointProfile(
        id=_make_id(name, str(server), port, otype),
        name=name,
        protocol=protocol,
        host=str(server),
        port=int(port),
        uuid=item.get("uuid"),
        password=item.get("password"),
        tls_sni=str(sni) if sni else None,
        tls_enabled=bool(tls),
        reality_public_key=str(pub_key) if pub_key else None,
        reality_short_id=str(short_id) if short_id else None,
        network=item.get("network"),
        flow=item.get("flow"),
        extra={k: v for k, v in item.items() if k not in {"tag", "type", "server", "server_port"}},
        source=source,
    )


class Base64ConfigParser(ConfigParser):
    """Base64-wrapped payloads: URI bundles, JSON, or Clash YAML.

    Tolerates line-wrapped base64 (common in subscription responses) and both
    standard and URL-safe alphabets, with or without padding.
    """

    @staticmethod
    def _decode(raw: str) -> str | None:
        if "://" in raw:
            return None
        compact = "".join(raw.split())
        if not compact:
            return None
        padded = compact + "=" * (-len(compact) % 4)
        for altchars in (None, b"-_"):
            try:
                decoded = base64.b64decode(padded, altchars=altchars, validate=True)
                text = decoded.decode("utf-8", errors="strict")
                if text.strip():
                    return text
            except (binascii.Error, UnicodeDecodeError, ValueError):
                continue
        return None

    def can_parse(self, raw: str) -> bool:
        return self._decode(raw) is not None

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        decoded = self._decode(raw)
        if decoded is None:
            raise ValueError("Payload is not valid base64")
        decoded = decoded.strip()

        if decoded.startswith(("{", "[")):
            return JsonConfigParser().parse(decoded, source)
        if "proxies:" in decoded:
            return ClashYamlParser().parse(decoded, source)
        return UriListParser().parse(decoded, source)


class VlessUriParser(ConfigParser):
    def can_parse(self, raw: str) -> bool:
        return raw.strip().lower().startswith("vless://")

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        uri = raw.strip()
        parsed = urlparse(uri)
        name = unquote(parsed.fragment) or f"{parsed.hostname}:{parsed.port}"
        params = parse_qs(parsed.query)

        def _p(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        security = _p("security")
        sni = _p("sni") or _p("host")
        reality = security == "reality"

        return [
            EndpointProfile(
                id=_make_id(name, parsed.hostname or "", parsed.port or 443, "vless"),
                name=name,
                protocol=ProtocolType.VLESS,
                host=parsed.hostname or "",
                port=parsed.port or 443,
                uuid=parsed.username or "",
                tls_enabled=security in ("tls", "reality"),
                tls_sni=sni,
                reality_public_key=_p("pbk") if reality else None,
                reality_short_id=_p("sid") if reality else None,
                network=_p("type"),
                flow=_p("flow"),
                extra={"params": {k: v[0] for k, v in params.items()}},
                source=source,
            )
        ]


class ShadowsocksUriParser(ConfigParser):
    def can_parse(self, raw: str) -> bool:
        return raw.strip().lower().startswith("ss://")

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        uri = raw.strip()
        parsed = urlparse(uri)
        name = unquote(parsed.fragment) or "shadowsocks"

        if "@" in parsed.netloc:
            userinfo, hostport = parsed.netloc.rsplit("@", 1)
            if ":" in hostport:
                host, port_str = hostport.rsplit(":", 1)
                port = int(port_str)
            else:
                host, port = hostport, 8388
            # SIP002: userinfo may be base64(method:password) or plain "method:password"
            method, password = _decode_ss_userinfo(userinfo)
        else:
            decoded = base64.urlsafe_b64decode(parsed.netloc + "==").decode("utf-8")
            method, password = decoded.split(":", 1)
            host = parsed.hostname or ""
            port = parsed.port or 8388

        return [
            EndpointProfile(
                id=_make_id(name, host, port, "ss"),
                name=name,
                protocol=ProtocolType.SHADOWSOCKS,
                host=host,
                port=port,
                password=password,
                extra={"method": method},
                source=source,
            )
        ]


class TrojanUriParser(ConfigParser):
    def can_parse(self, raw: str) -> bool:
        return raw.strip().lower().startswith("trojan://")

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        uri = raw.strip()
        parsed = urlparse(uri)
        name = unquote(parsed.fragment) or f"trojan-{parsed.hostname}"
        params = parse_qs(parsed.query)

        def _p(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        password = unquote(parsed.username) if parsed.username else None
        sni = _p("sni") or _p("peer")

        return [
            EndpointProfile(
                id=_make_id(name, parsed.hostname or "", parsed.port or 443, "trojan"),
                name=name,
                protocol=ProtocolType.TROJAN,
                host=parsed.hostname or "",
                port=parsed.port or 443,
                password=password,
                tls_enabled=True,
                tls_sni=sni,
                network=_p("type"),
                extra={"params": {k: v[0] for k, v in params.items()}},
                source=source,
            )
        ]


class VmessUriParser(ConfigParser):
    """vmess://base64({"v":"2","ps":...,"add":...,"port":...,"id":...})"""

    def can_parse(self, raw: str) -> bool:
        return raw.strip().lower().startswith("vmess://")

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        payload = raw.strip()[len("vmess://"):]
        padded = payload + "=" * (-len(payload) % 4)
        try:
            data = json.loads(base64.b64decode(padded).decode("utf-8"))
        except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValueError(f"Invalid vmess URI payload: {exc}") from exc

        host = str(data.get("add") or "")
        port = int(data.get("port") or 443)
        name = str(data.get("ps") or f"vmess-{host}")
        tls_value = str(data.get("tls") or "").lower()
        sni = data.get("sni") or data.get("host")

        return [
            EndpointProfile(
                id=_make_id(name, host, port, "vmess"),
                name=name,
                protocol=ProtocolType.VMess,
                host=host,
                port=port,
                uuid=str(data.get("id") or ""),
                tls_enabled=tls_value in ("tls", "1", "true"),
                tls_sni=str(sni) if sni else None,
                network=str(data.get("net")) if data.get("net") else None,
                extra={
                    "alterId": data.get("aid") or 0,
                    "params": {
                        "host": data.get("host") or "",
                        "path": data.get("path") or "",
                    },
                },
                source=source,
            )
        ]


class Hysteria2UriParser(ConfigParser):
    def can_parse(self, raw: str) -> bool:
        return raw.strip().lower().startswith(("hysteria2://", "hy2://"))

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        uri = raw.strip()
        parsed = urlparse(uri)
        name = unquote(parsed.fragment) or f"hysteria2-{parsed.hostname}"
        params = parse_qs(parsed.query)

        def _p(key: str) -> str | None:
            vals = params.get(key)
            return vals[0] if vals else None

        auth = parsed.username or _p("auth")
        password = unquote(auth) if auth else None

        return [
            EndpointProfile(
                id=_make_id(name, parsed.hostname or "", parsed.port or 443, "hysteria2"),
                name=name,
                protocol=ProtocolType.HYSTERIA2,
                host=parsed.hostname or "",
                port=parsed.port or 443,
                password=password,
                tls_enabled=True,
                tls_sni=_p("sni") or parsed.hostname,
                extra={"insecure": _p("insecure"), "obfs": _p("obfs")},
                source=source,
            )
        ]


class UriListParser(ConfigParser):
    """One or many proxy URIs separated by newlines (Hiddify-style paste).

    Accepts mixed vless://, ss://, trojan://, vmess://, hysteria2:// (hy2://)
    lines; broken lines are skipped instead of failing the whole import.
    """

    def __init__(self) -> None:
        self._parsers: list[ConfigParser] = [
            VlessUriParser(),
            ShadowsocksUriParser(),
            TrojanUriParser(),
            VmessUriParser(),
            Hysteria2UriParser(),
        ]

    def can_parse(self, raw: str) -> bool:
        lines = [line.strip() for line in raw.strip().splitlines() if line.strip()]
        return bool(lines) and any(PROXY_URI_SCHEME_RE.match(line) for line in lines)

    def parse(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        profiles: list[EndpointProfile] = []
        for line in raw.strip().splitlines():
            line = line.strip()
            if not line or not PROXY_URI_SCHEME_RE.match(line):
                continue
            for parser in self._parsers:
                if parser.can_parse(line):
                    try:
                        profiles.extend(parser.parse(line, source))
                    except (ValueError, KeyError):
                        pass  # skip malformed entries, keep the rest
                    break
        return profiles
