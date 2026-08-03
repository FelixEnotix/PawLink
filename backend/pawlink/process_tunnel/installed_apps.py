from __future__ import annotations

import logging
import sys
import time
from dataclasses import dataclass

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"
CACHE_TTL_S = 90.0

UNINSTALL_PATHS = (
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
)


@dataclass
class InstalledApplication:
    name: str
    executable: str
    icon_path: str | None = None
    install_path: str | None = None


class InstalledAppEnumerator:
    """List installed Windows applications from registry uninstall keys."""

    def __init__(self) -> None:
        self._cache: list[InstalledApplication] | None = None
        self._cache_at = 0.0

    def list_installed(self, *, force: bool = False) -> list[InstalledApplication]:
        if not IS_WINDOWS:
            return []

        now = time.monotonic()
        if (
            not force
            and self._cache is not None
            and now - self._cache_at < CACHE_TTL_S
        ):
            return self._cache

        apps: list[InstalledApplication] = []
        seen: set[str] = set()

        try:
            import winreg
        except ImportError:
            logger.warning("winreg unavailable")
            return []

        for hive in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            for sub_path in UNINSTALL_PATHS:
                try:
                    with winreg.OpenKey(hive, sub_path) as root:
                        self._scan_uninstall_root(root, apps, seen)
                except OSError:
                    continue

        apps.sort(key=lambda item: item.name.lower())
        self._cache = apps
        self._cache_at = now
        return apps

    def invalidate_cache(self) -> None:
        self._cache = None
        self._cache_at = 0.0

    def _scan_uninstall_root(self, root, apps: list[InstalledApplication], seen: set[str]) -> None:
        import winreg

        index = 0
        while True:
            try:
                key_name = winreg.EnumKey(root, index)
            except OSError:
                break
            index += 1
            try:
                with winreg.OpenKey(root, key_name) as key:
                    name = self._read_str(key, "DisplayName")
                    if not name:
                        continue
                    if self._read_int(key, "SystemComponent") == 1:
                        continue
                    if self._read_int(key, "ParentKeyName") is not None:
                        continue

                    install_path = self._read_str(key, "InstallLocation")
                    display_icon = self._read_str(key, "DisplayIcon")
                    uninstall = self._read_str(key, "UninstallString")
                    exe = self._resolve_executable(display_icon, install_path, uninstall)
                    if not exe:
                        continue
                    exe_key = exe.lower()
                    if exe_key in seen:
                        continue
                    seen.add(exe_key)

                    icon_path = self._resolve_icon_path(display_icon, install_path, exe)
                    apps.append(
                        InstalledApplication(
                            name=name.strip(),
                            executable=exe_key,
                            icon_path=icon_path,
                            install_path=install_path,
                        )
                    )
            except OSError:
                continue

    @staticmethod
    def _read_str(key, value_name: str) -> str | None:
        import winreg

        try:
            raw, kind = winreg.QueryValueEx(key, value_name)
        except OSError:
            return None
        if kind not in (winreg.REG_SZ, winreg.REG_EXPAND_SZ):
            return None
        text = str(raw).strip()
        return text or None

    @staticmethod
    def _read_int(key, value_name: str) -> int | None:
        import winreg

        try:
            raw, kind = winreg.QueryValueEx(key, value_name)
        except OSError:
            return None
        if kind != winreg.REG_DWORD:
            return None
        return int(raw)

    @staticmethod
    def _strip_exe(path: str) -> str:
        cleaned = path.strip().strip('"')
        if cleaned.lower().endswith(".exe"):
            return cleaned
        return cleaned

    def _resolve_executable(
        self,
        display_icon: str | None,
        install_path: str | None,
        uninstall: str | None,
    ) -> str | None:
        for candidate in (display_icon, uninstall):
            if not candidate:
                continue
            token = candidate.split(",")[0].strip().strip('"')
            if token.lower().endswith(".exe"):
                return token.split("\\")[-1].lower()

        if install_path:
            from pathlib import Path

            folder = Path(install_path)
            if folder.is_dir():
                for exe in folder.glob("*.exe"):
                    if exe.name.lower() not in {"uninstall.exe", "unins000.exe"}:
                        return exe.name.lower()
        return None

    def _resolve_icon_path(
        self,
        display_icon: str | None,
        install_path: str | None,
        executable: str,
    ) -> str | None:
        if display_icon:
            token = display_icon.split(",")[0].strip().strip('"')
            if token:
                return token

        if install_path:
            from pathlib import Path

            folder = Path(install_path)
            candidate = folder / executable
            if candidate.is_file():
                return str(candidate)
        return None
