from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)


class MihomoController:
    """Mihomo / Clash Meta external REST API (reload, health)."""

    def __init__(self, controller_url: str) -> None:
        self._base = controller_url.rstrip("/")

    async def is_alive(self, *, timeout_s: float = 2.0) -> bool:
        try:
            async with httpx.AsyncClient(timeout=timeout_s, trust_env=False) as client:
                response = await client.get(f"{self._base}/version")
                return response.status_code == 200
        except (httpx.HTTPError, OSError):
            return False

    async def wait_until_alive(
        self,
        *,
        is_process_running: Callable[[], bool] | None = None,
        poll_seconds: float = 0.05,
        probe_timeout_s: float = 5.0,
    ) -> None:
        """Wait until the controller responds — no fixed deadline."""
        while True:
            if is_process_running is not None and not is_process_running():
                raise RuntimeError(
                    "Ядро mihomo завершилось до готовности. Перезапустите PawLink."
                )
            if await self.is_alive(timeout_s=probe_timeout_s):
                return
            await asyncio.sleep(poll_seconds)

    async def reload_config(self, config_path: Path) -> bool:
        """Hot-reload config from disk without restarting the core process."""
        path = str(config_path.resolve())
        try:
            async with httpx.AsyncClient(timeout=20.0, trust_env=False) as client:
                response = await client.put(
                    f"{self._base}/configs",
                    params={"force": "true"},
                    json={"path": path},
                )
            if response.status_code in (200, 204):
                logger.info("Mihomo config reloaded from %s", path)
                return True
            logger.warning(
                "Mihomo reload failed: HTTP %s %s",
                response.status_code,
                response.text[:200],
            )
        except (httpx.HTTPError, OSError) as exc:
            logger.warning("Mihomo reload request failed: %s", exc)
        return False

    async def get_runtime_mode(self) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self._base}/configs")
                response.raise_for_status()
                payload = response.json()
                mode = payload.get("mode")
                return str(mode) if mode else None
        except (httpx.HTTPError, OSError, ValueError):
            return None
