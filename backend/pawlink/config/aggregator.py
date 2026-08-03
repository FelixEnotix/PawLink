from __future__ import annotations

import asyncio
from pathlib import Path

import httpx

from pawlink.config.parsers.base import ConfigParser
from pawlink.config.parsers.formats import (
    Base64ConfigParser,
    ClashYamlParser,
    JsonConfigParser,
    UriListParser,
)
from pawlink.models.profile import EndpointProfile

# Clash-compatible UA: many subscription panels return a full Clash config
# (or the correct format variant) only when the client identifies as Clash.
SUBSCRIPTION_USER_AGENT = "clash.meta; ClashMeta/1.19; PawLink/0.1"


class ConfigAggregator:
    """Runtime format detection and unified profile aggregation (Module 1)."""

    def __init__(self) -> None:
        self._parsers: list[ConfigParser] = [
            UriListParser(),
            ClashYamlParser(),
            JsonConfigParser(),
            Base64ConfigParser(),
        ]

    def detect_parser(self, raw: str) -> ConfigParser | None:
        for parser in self._parsers:
            if parser.can_parse(raw):
                return parser
        return None

    def parse_raw(self, raw: str, source: str | None = None) -> list[EndpointProfile]:
        parser = self.detect_parser(raw)
        if parser is None:
            raise ValueError("Unable to detect configuration format")
        return parser.parse(raw, source)

    def parse_file(self, path: str | Path) -> list[EndpointProfile]:
        file_path = Path(path)
        raw = file_path.read_text(encoding="utf-8")
        return self.parse_raw(raw, source=str(file_path))

    async def fetch_subscription(self, url: str) -> list[EndpointProfile]:
        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": SUBSCRIPTION_USER_AGENT},
        ) as client:
            response = await client.get(url)
            response.raise_for_status()
            raw = response.text
        return self.parse_raw(raw, source=url)

    def fetch_subscription_sync(self, url: str) -> list[EndpointProfile]:
        return asyncio.run(self.fetch_subscription(url))

    def aggregate(
        self,
        *,
        raw_strings: list[str] | None = None,
        file_paths: list[str | Path] | None = None,
        subscription_urls: list[str] | None = None,
    ) -> list[EndpointProfile]:
        """Merge multiple inputs into a deduplicated unified profile array."""
        profiles: list[EndpointProfile] = []
        seen: set[tuple[str, int, str]] = set()

        for raw in raw_strings or []:
            profiles.extend(self._dedupe(self.parse_raw(raw), seen))

        for path in file_paths or []:
            profiles.extend(self._dedupe(self.parse_file(path), seen))

        for url in subscription_urls or []:
            profiles.extend(self._dedupe(self.fetch_subscription_sync(url), seen))

        return profiles

    @staticmethod
    def _dedupe(
        batch: list[EndpointProfile],
        seen: set[tuple[str, int, str]],
    ) -> list[EndpointProfile]:
        result: list[EndpointProfile] = []
        for profile in batch:
            key = (profile.host, profile.port, profile.protocol.value)
            if key in seen:
                continue
            seen.add(key)
            result.append(profile)
        return result
