from __future__ import annotations

import logging
from dataclasses import dataclass

import psutil

from pawlink.models.profile import ProcessTunnelEntry, ProcessTunnelMode

logger = logging.getLogger(__name__)


@dataclass
class RunningProcess:
    pid: int
    executable: str
    name: str
    exe_path: str | None = None


class ProcessEnumerator:
    """Enumerate active Windows applications and extract binary metadata (Module 5)."""

    def list_running(self) -> list[RunningProcess]:
        processes: list[RunningProcess] = []
        seen: set[str] = set()

        for proc in psutil.process_iter(["pid", "name", "exe"]):
            try:
                info = proc.info
                name = info.get("name") or ""
                if not name.lower().endswith(".exe"):
                    name = f"{name}.exe" if name else "unknown.exe"
                exe = name.lower()
                if exe in seen:
                    continue
                seen.add(exe)
                processes.append(
                    RunningProcess(
                        pid=info["pid"],
                        executable=exe,
                        name=info.get("name") or exe,
                        exe_path=info.get("exe"),
                    )
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        processes.sort(key=lambda p: p.executable)
        return processes

    def find_by_name(self, executable: str) -> list[RunningProcess]:
        target = executable.lower()
        if not target.endswith(".exe"):
            target = f"{target}.exe"
        return [p for p in self.list_running() if p.executable == target]


class ProcessTunnelConfigBuilder:
    """Build include_process / exclude_process routing parameters."""

    def __init__(self, entries: list[ProcessTunnelEntry] | None = None) -> None:
        self._entries = list(entries or [])

    @property
    def entries(self) -> list[ProcessTunnelEntry]:
        return list(self._entries)

    def add(self, executable: str, mode: ProcessTunnelMode) -> ProcessTunnelEntry:
        exe = executable.lower()
        if not exe.endswith(".exe"):
            exe = f"{exe}.exe"
        entry = ProcessTunnelEntry(executable=exe, mode=mode)
        self._entries = [e for e in self._entries if e.executable != exe]
        self._entries.append(entry)
        return entry

    def remove(self, executable: str) -> bool:
        exe = executable.lower()
        if not exe.endswith(".exe"):
            exe = f"{exe}.exe"
        before = len(self._entries)
        self._entries = [e for e in self._entries if e.executable != exe]
        return len(self._entries) < before

    def include_list(self) -> list[str]:
        return [e.executable for e in self._entries if e.mode == ProcessTunnelMode.INCLUDE]

    def exclude_list(self) -> list[str]:
        return [e.executable for e in self._entries if e.mode == ProcessTunnelMode.EXCLUDE]

    def to_mihomo_tun_process(self, *, use_include: bool = True) -> dict:
        """Deprecated: mihomo TUN has no Windows include-process.

        Android uses ``include-package`` / ``exclude-package`` only. On Windows,
        app routing must use PROCESS-NAME rules + ``find-process-mode: always``.
        Kept for callers/tests; always returns an empty dict.
        """
        _ = use_include
        return {}

    def to_mihomo_process_rules(self, action: str = "PROXY") -> list[str]:
        rules: list[str] = []
        for exe in self.include_list():
            rules.append(f"PROCESS-NAME,{exe},{action}")
        for exe in self.exclude_list():
            rules.append(f"PROCESS-NAME,{exe},DIRECT")
        return rules
