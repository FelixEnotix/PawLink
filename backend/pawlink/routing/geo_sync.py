from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

GEOSITE_URL = "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"
GEOIP_URL = "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.dat"
SYNC_INTERVAL_HOURS = 24


class GeoDatabaseSyncService:
    """Automatic Geosite/GeoIP database synchronization every 24 hours (Module 4)."""

    def __init__(
        self,
        data_dir: str | Path,
        *,
        geosite_url: str = GEOSITE_URL,
        geoip_url: str = GEOIP_URL,
        interval_hours: float = SYNC_INTERVAL_HOURS,
    ) -> None:
        self._data_dir = Path(data_dir)
        self._geosite_url = geosite_url
        self._geoip_url = geoip_url
        self._interval_s = interval_hours * 3600
        self._last_sync: float | None = None
        self._task: asyncio.Task | None = None

    @property
    def geosite_path(self) -> Path:
        return self._data_dir / "geosite.dat"

    @property
    def geoip_path(self) -> Path:
        return self._data_dir / "geoip.dat"

    @property
    def last_sync(self) -> float | None:
        return self._last_sync

    def needs_sync(self) -> bool:
        if self._last_sync is not None:
            return (time.time() - self._last_sync) >= self._interval_s
        # Fresh process: respect databases already on disk instead of
        # re-downloading tens of megabytes on every application start.
        if self.geosite_path.exists() and self.geoip_path.exists():
            oldest_mtime = min(
                self.geosite_path.stat().st_mtime,
                self.geoip_path.stat().st_mtime,
            )
            return (time.time() - oldest_mtime) >= self._interval_s
        return True

    async def sync(self) -> dict[str, str]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            geosite = await self._download(client, self._geosite_url, self.geosite_path)
            geoip = await self._download(client, self._geoip_url, self.geoip_path)
        self._last_sync = time.time()
        logger.info("Geo databases synced to %s", self._data_dir)
        return {"geosite": geosite, "geoip": geoip}

    @staticmethod
    async def _download(client: httpx.AsyncClient, url: str, dest: Path) -> str:
        response = await client.get(url)
        response.raise_for_status()
        dest.write_bytes(response.content)
        return str(dest)

    async def ensure_synced(self) -> dict[str, str]:
        if self.needs_sync() or not self.geosite_path.exists():
            return await self.sync()
        return {"geosite": str(self.geosite_path), "geoip": str(self.geoip_path)}

    async def _loop(self) -> None:
        while True:
            try:
                if self.needs_sync():
                    await self.sync()
            except Exception:
                logger.exception("Geo database sync failed")
            await asyncio.sleep(self._interval_s)

    def start(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())

    def stop(self) -> None:
        if self._task and not self._task.done():
            self._task.cancel()

    def default_rules(self) -> list[str]:
        """Built-in regional routing rules using synced databases."""
        return [
            "GEOSITE,cn,DIRECT",
            "GEOIP,cn,DIRECT",
            "GEOSITE,geolocation-!cn,PROXY",
            "MATCH,PROXY",
        ]
