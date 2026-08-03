from __future__ import annotations

import asyncio
import io
import logging
import platform
import re
import zipfile
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

MIHOMO_LATEST_RELEASE_API = "https://api.github.com/repos/MetaCubeX/mihomo/releases/latest"
WINTUN_ZIP_URL = "https://www.wintun.net/builds/wintun-0.14.1.zip"
DOWNLOAD_TIMEOUT_S = 600.0


class CoreDownloadService:
    """On-demand download of runtime binaries (mihomo core, wintun driver).

    Keeps the first launch zero-configuration: the user does not have to
    manually place mihomo.exe / wintun.dll into the data directory.
    """

    def __init__(self, bin_dir: str | Path) -> None:
        self._bin_dir = Path(bin_dir)
        self._lock = asyncio.Lock()

    @property
    def core_path(self) -> Path:
        return self._bin_dir / "mihomo.exe"

    @property
    def wintun_path(self) -> Path:
        return self._bin_dir / "wintun.dll"

    @staticmethod
    def _arch() -> str:
        machine = platform.machine().lower()
        if machine in ("arm64", "aarch64"):
            return "arm64"
        return "amd64"

    async def ensure_core(self) -> Path:
        """Download the latest mihomo release if the binary is missing."""
        async with self._lock:
            if self.core_path.is_file():
                return self.core_path
            self._bin_dir.mkdir(parents=True, exist_ok=True)
            arch = self._arch()

            try:
                async with httpx.AsyncClient(
                    timeout=DOWNLOAD_TIMEOUT_S, follow_redirects=True
                ) as client:
                    release_resp = await client.get(MIHOMO_LATEST_RELEASE_API)
                    release_resp.raise_for_status()
                    asset = self._pick_release_asset(release_resp.json(), arch)
                    if asset is None:
                        raise RuntimeError(
                            f"no mihomo release asset for windows-{arch} found"
                        )
                    logger.info("Downloading proxy core: %s", asset["name"])
                    archive_resp = await client.get(asset["browser_download_url"])
                    archive_resp.raise_for_status()
                    payload = self._extract_exe(archive_resp.content)
            except (httpx.HTTPError, OSError, ValueError, KeyError) as exc:
                raise RuntimeError(f"Failed to download proxy core (mihomo): {exc}") from exc

            tmp = self.core_path.with_suffix(".tmp")
            tmp.write_bytes(payload)
            tmp.replace(self.core_path)
            logger.info("Proxy core installed at %s", self.core_path)
            return self.core_path

    async def ensure_wintun(self) -> Path | None:
        """Best-effort download of wintun.dll; returns None on failure."""
        async with self._lock:
            if self.wintun_path.is_file():
                return self.wintun_path
            self._bin_dir.mkdir(parents=True, exist_ok=True)
            arch = self._arch()
            try:
                async with httpx.AsyncClient(
                    timeout=DOWNLOAD_TIMEOUT_S, follow_redirects=True
                ) as client:
                    response = await client.get(WINTUN_ZIP_URL)
                    response.raise_for_status()
                with zipfile.ZipFile(io.BytesIO(response.content)) as zf:
                    member = next(
                        (
                            n
                            for n in zf.namelist()
                            if n.lower().endswith(f"bin/{arch}/wintun.dll")
                        ),
                        None,
                    )
                    if member is None:
                        logger.warning("wintun archive has no dll for arch %s", arch)
                        return None
                    payload = zf.read(member)
            except (httpx.HTTPError, OSError, ValueError, zipfile.BadZipFile) as exc:
                logger.warning("Failed to download wintun.dll: %s", exc)
                return None

            tmp = self.wintun_path.with_suffix(".tmp")
            tmp.write_bytes(payload)
            tmp.replace(self.wintun_path)
            logger.info("wintun.dll installed at %s", self.wintun_path)
            return self.wintun_path

    @staticmethod
    def _pick_release_asset(release: dict, arch: str) -> dict | None:
        assets = release.get("assets", [])
        exact = re.compile(rf"^mihomo-windows-{arch}-v[\w.\-]+\.zip$")
        # "compatible" builds target older CPUs without modern instruction sets.
        compatible = re.compile(rf"^mihomo-windows-{arch}-compatible-v[\w.\-]+\.zip$")
        for pattern in (exact, compatible):
            for asset in assets:
                if pattern.match(asset.get("name", "")):
                    return asset
        return None

    @staticmethod
    def _extract_exe(archive_bytes: bytes) -> bytes:
        with zipfile.ZipFile(io.BytesIO(archive_bytes)) as zf:
            exe_members = [n for n in zf.namelist() if n.lower().endswith(".exe")]
            if not exe_members:
                raise ValueError("mihomo archive contains no executable")
            return zf.read(exe_members[0])
