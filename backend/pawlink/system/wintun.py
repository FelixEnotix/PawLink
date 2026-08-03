from __future__ import annotations

import ctypes
import logging
import subprocess
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"

# Friendly names used by PawLink and leftover Clash/Meta TUN adapters.
_STALE_ADAPTER_NAMES = ("PawLink", "Meta Tunnel")


class WintunManager:
    """Virtual network interface driver (Wintun.dll) lifecycle management."""

    DEFAULT_DLL_NAME = "wintun.dll"

    def __init__(self, dll_path: str | Path | None = None) -> None:
        self._dll_path = Path(dll_path) if dll_path else self._resolve_default_path()
        self._handle = None

    @staticmethod
    def _resolve_default_path() -> Path:
        base = Path(__file__).resolve().parents[2]
        candidates = [
            base / "bin" / "wintun.dll",
            base / "wintun.dll",
            Path.cwd() / "wintun.dll",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate
        return candidates[0]

    @property
    def dll_path(self) -> Path:
        return self._dll_path

    @property
    def is_available(self) -> bool:
        return self._dll_path.exists()

    def load(self) -> bool:
        if not IS_WINDOWS:
            logger.warning("Wintun is only available on Windows")
            return False
        if not self.is_available:
            logger.error("Wintun.dll not found at %s", self._dll_path)
            return False
        try:
            self._handle = ctypes.WinDLL(str(self._dll_path))
            logger.info("Wintun.dll loaded from %s", self._dll_path)
            return True
        except OSError as exc:
            logger.error("Failed to load Wintun.dll: %s", exc)
            return False

    def unload(self) -> None:
        self._handle = None

    def cleanup_stale_adapters(self) -> int:
        """Remove phantom Wintun Net devices left after crashes (needs admin)."""
        if not IS_WINDOWS:
            return 0
        name_filter = "|".join(_STALE_ADAPTER_NAMES)
        ps = f"""
$ErrorActionPreference = 'SilentlyContinue'
$count = 0
Get-PnpDevice -Class Net |
  Where-Object {{
    $_.FriendlyName -match '^({name_filter})$' -and
    ($_.Status -eq 'Unknown' -or $_.Problem -eq 'CM_PROB_PHANTOM')
  }} |
  ForEach-Object {{
    $id = $_.InstanceId
    pnputil /remove-device "$id" | Out-Null
    if ($LASTEXITCODE -eq 0) {{ $count++ }}
  }}
Write-Output $count
"""
        try:
            # CREATE_NO_WINDOW + -WindowStyle Hidden: no blue PowerShell flash on admin start.
            completed = subprocess.run(
                [
                    "powershell.exe",
                    "-NoProfile",
                    "-NonInteractive",
                    "-WindowStyle",
                    "Hidden",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    ps,
                ],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
                creationflags=subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0,
            )
            out = (completed.stdout or "").strip().splitlines()
            removed = int(out[-1]) if out and out[-1].isdigit() else 0
            if removed:
                logger.info("Removed %s stale Wintun adapter(s)", removed)
            return removed
        except Exception:
            logger.debug("Stale Wintun cleanup failed", exc_info=True)
            return 0

    def to_mihomo_tun_config(self, stack: str = "mixed", *, split_tunnel: bool = False) -> dict:
        # Mirror koala-clash / clash-verge defaults: mixed stack, dns-hijack,
        # private LAN excluded so local network keeps working under auto-route.
        # strict-route blocks traffic leak when the TUN drops (kill-switch).
        # ``split_tunnel`` is kept for API compatibility; LAN excludes apply always.
        _ = split_tunnel
        tun: dict = {
            "enable": True,
            "stack": stack,
            "auto-route": True,
            "auto-detect-interface": True,
            "strict-route": True,
            "dns-hijack": ["any:53"],
            "device": "PawLink",
            "mtu": 1500,
            "route-exclude-address": [
                "0.0.0.0/8",
                "10.0.0.0/8",
                "100.64.0.0/10",
                "127.0.0.0/8",
                "169.254.0.0/16",
                "172.16.0.0/12",
                "192.0.0.0/24",
                "192.168.0.0/16",
                "224.0.0.0/4",
                "255.255.255.255/32",
            ],
        }
        return {"tun": tun}
