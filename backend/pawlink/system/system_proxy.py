from __future__ import annotations

import logging
import sys
from dataclasses import dataclass

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"

INTERNET_SETTINGS_KEY = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings"


@dataclass
class _ProxySnapshot:
    enabled: int
    server: str
    override: str


class SystemProxyManager:
    """Windows system proxy (HTTP/HTTPS) for browsers and WinHTTP-aware apps.

    Used when TUN mode is unavailable (no admin / no wintun). Mihomo mixed-port
    listens on 127.0.0.1:7890; pointing the OS proxy there captures browser
    traffic without a virtual adapter.
    """

    def __init__(self) -> None:
        self._snapshot: _ProxySnapshot | None = None
        self._active = False
        self._active_port: int | None = None

    @property
    def is_active(self) -> bool:
        return self._active

    def enable(self, host: str = "127.0.0.1", port: int = 7890) -> bool:
        if not IS_WINDOWS:
            logger.debug("System proxy is only supported on Windows")
            return False
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                INTERNET_SETTINGS_KEY,
                0,
                winreg.KEY_READ | winreg.KEY_WRITE,
            ) as key:
                if self._snapshot is None:
                    self._snapshot = _ProxySnapshot(
                        enabled=int(winreg.QueryValueEx(key, "ProxyEnable")[0]),
                        server=str(winreg.QueryValueEx(key, "ProxyServer")[0]),
                        override=str(winreg.QueryValueEx(key, "ProxyOverride")[0]),
                    )
                winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 1)
                winreg.SetValueEx(
                    key,
                    "ProxyServer",
                    0,
                    winreg.REG_SZ,
                    f"{host}:{port}",
                )
                winreg.SetValueEx(key, "ProxyOverride", 0, winreg.REG_SZ, "<local>")
            self._apply_refresh()
            self._active = True
            self._active_port = port
            logger.info("System proxy enabled at %s:%s", host, port)
            return True
        except OSError as exc:
            logger.warning("Failed to enable system proxy: %s", exc)
            return False

    def disable(self) -> None:
        if not IS_WINDOWS:
            return
        if not self._active:
            if self._active_port is not None:
                self.clear_if_points_to(self._active_port)
            return
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                INTERNET_SETTINGS_KEY,
                0,
                winreg.KEY_WRITE,
            ) as key:
                if self._snapshot is not None:
                    winreg.SetValueEx(
                        key, "ProxyEnable", 0, winreg.REG_DWORD, self._snapshot.enabled
                    )
                    winreg.SetValueEx(
                        key, "ProxyServer", 0, winreg.REG_SZ, self._snapshot.server
                    )
                    winreg.SetValueEx(
                        key, "ProxyOverride", 0, winreg.REG_SZ, self._snapshot.override
                    )
                else:
                    winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
            self._apply_refresh()
            logger.info("System proxy restored")
        except OSError as exc:
            logger.warning("Failed to restore system proxy: %s", exc)
        finally:
            self._active = False
            self._active_port = None
            self._snapshot = None

    @staticmethod
    def read_current() -> tuple[bool, str]:
        if not IS_WINDOWS:
            return False, ""
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                INTERNET_SETTINGS_KEY,
                0,
                winreg.KEY_READ,
            ) as key:
                enabled = bool(int(winreg.QueryValueEx(key, "ProxyEnable")[0]))
                server = str(winreg.QueryValueEx(key, "ProxyServer")[0])
                return enabled, server
        except OSError:
            return False, ""

    def clear_if_points_to(self, port: int, host: str = "127.0.0.1") -> bool:
        """Disable system proxy if it still points at our mixed-port from a crashed session."""
        if not IS_WINDOWS:
            return False
        enabled, server = self.read_current()
        target = f"{host}:{port}"
        if not enabled or server.strip() != target:
            return False
        try:
            import winreg

            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER,
                INTERNET_SETTINGS_KEY,
                0,
                winreg.KEY_WRITE,
            ) as key:
                winreg.SetValueEx(key, "ProxyEnable", 0, winreg.REG_DWORD, 0)
            self._apply_refresh()
            logger.warning("Cleared stale system proxy pointing to %s", target)
            return True
        except OSError as exc:
            logger.warning("Failed to clear stale system proxy: %s", exc)
            return False
        finally:
            self._active = False
            self._active_port = None
            self._snapshot = None

    @staticmethod
    def _apply_refresh() -> None:
        try:
            import ctypes

            INTERNET_OPTION_SETTINGS_CHANGED = 39
            INTERNET_OPTION_REFRESH = 37
            internet_set_option = ctypes.windll.Wininet.InternetSetOptionW
            internet_set_option(0, INTERNET_OPTION_SETTINGS_CHANGED, 0, 0)
            internet_set_option(0, INTERNET_OPTION_REFRESH, 0, 0)
        except OSError:
            pass
