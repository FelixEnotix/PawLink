from __future__ import annotations

import json
import logging
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"


@dataclass
class NetworkSnapshot:
    """Captured native Windows network/DNS state for recovery."""

    interface_metrics: list[dict] = field(default_factory=list)
    dns_servers: list[str] = field(default_factory=list)
    routes: list[str] = field(default_factory=list)
    timestamp: float = 0.0


class NetworkRecoveryService:
    """
    Purge temporary routing tables and restore native adapter/DNS state (Module 6).
    Prevents local network lockouts after proxy shutdown or crash.
    """

    def __init__(self, snapshot_dir: str | Path | None = None) -> None:
        self._snapshot_dir = Path(snapshot_dir or Path.home() / ".pawlink" / "snapshots")
        self._snapshot_dir.mkdir(parents=True, exist_ok=True)
        self._snapshot: NetworkSnapshot | None = None

    def capture_snapshot(self) -> NetworkSnapshot:
        snapshot = NetworkSnapshot()
        if IS_WINDOWS:
            snapshot.interface_metrics = self._capture_interfaces_win()
            snapshot.dns_servers = self._capture_dns_win()
            snapshot.routes = self._capture_routes_win()
        else:
            snapshot.routes = self._run_lines(["ip", "route"])

        import time

        snapshot.timestamp = time.time()
        self._snapshot = snapshot
        self._persist_snapshot(snapshot)
        logger.info("Network snapshot captured")
        return snapshot

    def restore(self) -> None:
        if self._snapshot is None:
            self._snapshot = self._load_snapshot()
        if self._snapshot is None:
            logger.warning("No network snapshot available for recovery")
            self._emergency_cleanup()
            return

        self._emergency_cleanup()
        logger.info("PawLink network cleanup completed")

    def _emergency_cleanup(self) -> None:
        """Clear resolver caches without changing user-owned network settings.

        Resetting Winsock/IPv4 or deleting the default route on every shutdown
        can disconnect the machine. Route and DNS restoration must only target
        settings explicitly changed and tracked by PawLink.
        """
        if IS_WINDOWS:
            self._run_safe(["ipconfig", "/flushdns"])
        else:
            logger.debug("No platform-specific network cleanup required")

    def _persist_snapshot(self, snapshot: NetworkSnapshot) -> None:
        path = self._snapshot_dir / "network_snapshot.json"
        path.write_text(
            json.dumps(
                {
                    "interface_metrics": snapshot.interface_metrics,
                    "dns_servers": snapshot.dns_servers,
                    "routes": snapshot.routes,
                    "timestamp": snapshot.timestamp,
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    def _load_snapshot(self) -> NetworkSnapshot | None:
        path = self._snapshot_dir / "network_snapshot.json"
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return NetworkSnapshot(**data)

    @staticmethod
    def _run_safe(cmd: list[str]) -> None:
        try:
            subprocess.run(
                cmd,
                capture_output=True,
                timeout=30,
                creationflags=subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0,
            )
        except (subprocess.SubprocessError, FileNotFoundError) as exc:
            logger.debug("Command %s skipped: %s", cmd, exc)

    @staticmethod
    def _run_lines(cmd: list[str]) -> list[str]:
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=15,
                creationflags=subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0,
            )
            output = result.stdout or b""
            if isinstance(output, bytes):
                output = output.decode("utf-8", errors="replace")
            return [line.strip() for line in output.splitlines() if line.strip()]
        except (subprocess.SubprocessError, FileNotFoundError):
            return []

    @staticmethod
    def _capture_interfaces_win() -> list[dict]:
        lines = NetworkRecoveryService._run_lines(["netsh", "interface", "ipv4", "show", "interfaces"])
        return [{"raw": line} for line in lines]

    @staticmethod
    def _capture_dns_win() -> list[str]:
        lines = NetworkRecoveryService._run_lines(["netsh", "interface", "ipv4", "show", "dns"])
        servers: list[str] = []
        for line in lines:
            if "DNS" in line and any(c.isdigit() for c in line):
                parts = line.split()
                for part in parts:
                    if part.count(".") == 3:
                        servers.append(part)
        return servers

    @staticmethod
    def _capture_routes_win() -> list[str]:
        return NetworkRecoveryService._run_lines(["route", "print", "-4"])

