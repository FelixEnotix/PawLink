from __future__ import annotations

import ctypes
import logging
import os
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"


class PrivilegeElevationService:
    """UAC privilege elevation for Wintun driver loading (Module 6)."""

    def __init__(self) -> None:
        self._admin_cached: bool | None = None

    def is_admin(self) -> bool:
        if self._admin_cached is not None:
            return self._admin_cached
        if not IS_WINDOWS:
            self._admin_cached = os.geteuid() == 0 if hasattr(os, "geteuid") else True
            return self._admin_cached
        try:
            self._admin_cached = bool(ctypes.windll.shell32.IsUserAnAdmin())
        except Exception:
            self._admin_cached = False
        return self._admin_cached

    def request_elevation(self, executable: str | None = None, args: list[str] | None = None) -> bool:
        """
        Trigger UAC elevation dialog and restart the process elevated.
        Returns True if elevation was requested (current process should exit).
        """
        if not IS_WINDOWS:
            logger.warning("Elevation is only supported on Windows")
            return False

        if self.is_admin():
            return False

        exe = executable or sys.executable
        params = " ".join(args or sys.argv[1:])
        if exe.endswith("python.exe") or exe.endswith("pythonw.exe"):
            script = Path(sys.argv[0]).resolve()
            params = f'"{script}" {params}'.strip()

        logger.info("Requesting UAC elevation")
        ret = ctypes.windll.shell32.ShellExecuteW(
            None,
            "runas",
            exe,
            params,
            None,
            1,
        )
        if ret <= 32:
            logger.error("Elevation failed with code %s", ret)
            return False
        return True

    def ensure_elevated(self) -> bool:
        """Returns True if already elevated or elevation succeeded."""
        if self.is_admin():
            return True
        return not self.request_elevation()
