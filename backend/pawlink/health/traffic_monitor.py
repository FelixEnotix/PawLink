from __future__ import annotations

import asyncio
import logging
import re
import time
from typing import Callable

import httpx

logger = logging.getLogger(__name__)

POLL_INTERVAL_S = 1.5
# Cap how much of /connections we buffer — totals are near the start of the JSON.
MAX_CONNECTIONS_BODY_BYTES = 256 * 1024

# Mihomo /connections JSON can include thousands of connection objects.
# We only need the two totals — extract them without building the full tree.
_DOWNLOAD_TOTAL_RE = re.compile(r'"downloadTotal"\s*:\s*(\d+)')
_UPLOAD_TOTAL_RE = re.compile(r'"uploadTotal"\s*:\s*(\d+)')


def _extract_counter(body: str, pattern: re.Pattern[str]) -> int:
    match = pattern.search(body)
    if not match:
        return 0
    try:
        return int(match.group(1))
    except ValueError:
        return 0


class TrafficMonitor:
    """Track VPN throughput and byte totals via mihomo external controller."""

    def __init__(self) -> None:
        self._controller_url: str | None = None
        self._subscription_resolver: Callable[[], str | None] | None = None
        self._on_bytes: Callable[[int, int, str | None], None] | None = None
        self._task: asyncio.Task | None = None
        self._client: httpx.AsyncClient | None = None
        self._last_download_total = 0
        self._last_upload_total = 0
        self._last_poll_at = 0.0
        self._has_baseline = False
        self._speed_up = 0
        self._speed_down = 0
        self._session_up = 0
        self._session_down = 0

    def set_controller_url(self, url: str | None) -> None:
        self._controller_url = url
        if url is None:
            self._has_baseline = False
            self._speed_up = 0
            self._speed_down = 0
            self._last_poll_at = 0.0

    def set_subscription_resolver(self, resolver: Callable[[], str | None]) -> None:
        self._subscription_resolver = resolver

    def set_bytes_handler(self, handler: Callable[[int, int, str | None], None]) -> None:
        self._on_bytes = handler

    def reset_session(self) -> None:
        self._session_up = 0
        self._session_down = 0
        self._speed_up = 0
        self._speed_down = 0
        self._has_baseline = False
        self._last_poll_at = 0.0

    def start(self) -> None:
        if self._task is not None:
            return
        self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        """Sync stop used from sync paths; prefer stop_async when awaiting shutdown."""
        if self._task is not None:
            self._task.cancel()
            self._task = None
        self._speed_up = 0
        self._speed_down = 0
        self._has_baseline = False
        self._last_poll_at = 0.0
        client = self._client
        self._client = None
        if client is not None:
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                try:
                    asyncio.run(client.aclose())
                except Exception:
                    pass
            else:
                loop.create_task(client.aclose())

    async def stop_async(self) -> None:
        if self._task is not None:
            self._task.cancel()
            task = self._task
            self._task = None
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        self._speed_up = 0
        self._speed_down = 0
        self._has_baseline = False
        self._last_poll_at = 0.0
        client = self._client
        self._client = None
        if client is not None:
            try:
                await client.aclose()
            except Exception:
                pass

    def get_stats(self, *, subscription_totals: dict[str, dict[str, int]]) -> dict:
        active_id = self._subscription_resolver() if self._subscription_resolver else None
        active_totals = subscription_totals.get(active_id or "", {"total_up": 0, "total_down": 0})
        return {
            "speed_up": self._speed_up,
            "speed_down": self._speed_down,
            "session_up": self._session_up,
            "session_down": self._session_down,
            "active_subscription_id": active_id,
            "active_subscription_up": active_totals.get("total_up", 0),
            "active_subscription_down": active_totals.get("total_down", 0),
            "subscriptions": subscription_totals,
        }

    def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=4.0, trust_env=False)
        return self._client

    async def _loop(self) -> None:
        while True:
            try:
                await self._poll_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.debug("Traffic poll failed", exc_info=True)
            await asyncio.sleep(POLL_INTERVAL_S)

    async def _poll_once(self) -> None:
        if not self._controller_url:
            return
        client = self._get_client()
        async with client.stream("GET", f"{self._controller_url}/connections") as response:
            response.raise_for_status()
            # Stream until both totals are found (they sit near the JSON head).
            chunks: list[bytes] = []
            total = 0
            download_total = 0
            upload_total = 0
            found_dl = False
            found_ul = False
            async for chunk in response.aiter_bytes():
                chunks.append(chunk)
                total += len(chunk)
                text = b"".join(chunks).decode("utf-8", errors="ignore")
                if not found_dl:
                    m = _DOWNLOAD_TOTAL_RE.search(text)
                    if m:
                        download_total = int(m.group(1))
                        found_dl = True
                if not found_ul:
                    m = _UPLOAD_TOTAL_RE.search(text)
                    if m:
                        upload_total = int(m.group(1))
                        found_ul = True
                if found_dl and found_ul:
                    break
                if total >= MAX_CONNECTIONS_BODY_BYTES:
                    break
            del chunks
        now = time.monotonic()

        if not self._has_baseline:
            self._last_download_total = download_total
            self._last_upload_total = upload_total
            self._last_poll_at = now
            self._has_baseline = True
            self._speed_up = 0
            self._speed_down = 0
            return

        # Mihomo counters reset when the core process restarts/reloads.
        if download_total < self._last_download_total or upload_total < self._last_upload_total:
            self._last_download_total = download_total
            self._last_upload_total = upload_total
            self._last_poll_at = now
            self._speed_up = 0
            self._speed_down = 0
            return

        delta_down = max(0, download_total - self._last_download_total)
        delta_up = max(0, upload_total - self._last_upload_total)
        elapsed = max(now - self._last_poll_at, 0.001)
        self._last_download_total = download_total
        self._last_upload_total = upload_total
        self._last_poll_at = now

        if delta_down == 0 and delta_up == 0:
            self._speed_up = 0
            self._speed_down = 0
            return

        # Convert interval delta to bytes/second for the UI.
        self._speed_up = int(delta_up / elapsed)
        self._speed_down = int(delta_down / elapsed)
        self._session_up += delta_up
        self._session_down += delta_down

        sub_id = self._subscription_resolver() if self._subscription_resolver else None
        if self._on_bytes:
            self._on_bytes(delta_up, delta_down, sub_id)
