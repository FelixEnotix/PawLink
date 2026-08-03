from __future__ import annotations

import atexit
import logging
import os
import subprocess
from pathlib import Path
import sys
import threading
import time
from typing import Callable

from pawlink.system.log_cap import MemoryLogDrain

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"
_MIHOMO_LOG_NAME = "mihomo.log"
_MIHOMO_LOG_MEMORY_BYTES = 64 * 1024


class WatchdogService:
    """
    Lifecycle observer: terminates proxy on crash/sleep/termination (Module 6).
    """

    def __init__(
        self,
        proxy_terminator: Callable[[], None],
        *,
        parent_pid: int | None = None,
        poll_interval_s: float = 2.0,
    ) -> None:
        self._terminator = proxy_terminator
        self._parent_pid = parent_pid or os.getppid()
        self._poll_interval_s = poll_interval_s
        self._running = False
        self._thread: threading.Thread | None = None
        self._recovery_callback: Callable[[], None] | None = None

    def on_recovery(self, callback: Callable[[], None]) -> None:
        self._recovery_callback = callback

    def _is_parent_alive(self) -> bool:
        if self._parent_pid <= 0:
            return True
        if IS_WINDOWS:
            try:
                import psutil

                return psutil.pid_exists(self._parent_pid)
            except Exception:
                return True
        try:
            os.kill(self._parent_pid, 0)
            return True
        except OSError:
            return False

    def _trigger_failsafe(self, reason: str) -> None:
        logger.warning("Watchdog failsafe triggered: %s", reason)
        try:
            self._terminator()
        except Exception:
            logger.exception("Proxy termination failed")
        if self._recovery_callback:
            try:
                self._recovery_callback()
            except Exception:
                logger.exception("Network recovery failed")

    def _watch_loop(self) -> None:
        while self._running:
            if not self._is_parent_alive():
                self._trigger_failsafe("parent process terminated")
                break
            time.sleep(self._poll_interval_s)

    def _register_power_events(self) -> None:
        if not IS_WINDOWS:
            return
        try:
            import win32con  # noqa: F401
            logger.debug("Power event handler available via pywin32")
        except ImportError:
            logger.debug("pywin32 not available for power event monitoring")

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._register_power_events()
        self._thread = threading.Thread(target=self._watch_loop, daemon=True, name="PawLinkWatchdog")
        self._thread.start()
        logger.info("Watchdog started (parent_pid=%s)", self._parent_pid)

    def stop(self) -> None:
        self._running = False
        if self._thread:
            self._thread.join(timeout=5.0)


class ProxyProcessManager:
    """Manages the underlying proxy core binary subprocess."""

    def __init__(self, binary_path: str, config_path: str, *, work_dir: str | None = None) -> None:
        self._binary_path = binary_path
        self._config_path = config_path
        self._work_dir = work_dir or str(Path(config_path).parent)
        self._process: subprocess.Popen | None = None
        self._log_drain: MemoryLogDrain | None = None
        self._atexit_registered = False
        self._exit_callback: Callable[[], None] | None = None
        self._exit_thread: threading.Thread | None = None
        self._intentional_stop = False

    def on_exit(self, callback: Callable[[], None]) -> None:
        self._exit_callback = callback

    @property
    def intentional_stop(self) -> bool:
        return self._intentional_stop

    @property
    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None

    @property
    def pid(self) -> int | None:
        return self._process.pid if self._process else None

    def _discard_stale_log_file(self) -> None:
        """Remove leftover on-disk mihomo logs from older builds."""
        log_path = Path(self._work_dir) / _MIHOMO_LOG_NAME
        try:
            if log_path.is_file():
                log_path.unlink()
        except OSError:
            logger.debug("Could not remove stale %s", log_path)

    def _close_log(self) -> None:
        drain = self._log_drain
        self._log_drain = None
        if drain is not None:
            drain.join(timeout=0.5)

    def _startup_error_detail(self) -> str:
        if not self._log_drain:
            return ""
        try:
            tail = self._log_drain.tail_text(max_lines=30)
        except Exception:
            return ""
        if not tail:
            return ""
        lines = tail.splitlines()
        for line in reversed(lines):
            lower = line.lower()
            if "fatal" in lower or "error" in lower:
                return f": {line.split('msg=')[-1].strip().strip('\"')}"
        return f": {lines[-1]}"

    def start(self) -> None:
        if self.is_running:
            return
        if not os.path.isfile(self._binary_path):
            raise FileNotFoundError(f"Proxy core not found: {self._binary_path}")
        if not self._atexit_registered:
            atexit.register(self.terminate)
            self._atexit_registered = True

        # PIPE + dedicated reader keeps the OS pipe from filling up, while an
        # in-memory ring avoids unbounded mihomo.log growth on disk.
        self._discard_stale_log_file()
        self._close_log()

        self._process = subprocess.Popen(
            [self._binary_path, "-d", self._work_dir, "-f", self._config_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if IS_WINDOWS else 0,
        )
        assert self._process.stdout is not None
        self._log_drain = MemoryLogDrain(
            self._process.stdout,
            max_bytes=_MIHOMO_LOG_MEMORY_BYTES,
        )
        exit_code = self._process.poll()
        if exit_code is not None:
            detail = self._startup_error_detail()
            self._process = None
            self._close_log()
            raise RuntimeError(
                f"Proxy core exited during startup with code {exit_code}{detail}"
            )
        logger.info("Proxy core started (pid=%s), logs kept in memory only", self._process.pid)
        self._start_exit_watcher()

    def _start_exit_watcher(self) -> None:
        process = self._process
        if process is None:
            return

        def _watch() -> None:
            code = process.wait()
            intentional = self._intentional_stop
            self._intentional_stop = False
            if self._process is process and self._exit_callback and not intentional:
                logger.warning("Proxy core exited unexpectedly (code=%s)", code)
                try:
                    self._exit_callback()
                except Exception:
                    logger.exception("Proxy exit callback failed")
            elif self._process is process and intentional:
                logger.debug("Proxy core stopped (code=%s)", code)
            if self._process is process:
                self._process = None
            self._close_log()

        self._exit_thread = threading.Thread(target=_watch, daemon=True, name="PawLinkProxyExit")
        self._exit_thread.start()

    @staticmethod
    def _wait_until_process_exit(process: subprocess.Popen) -> None:
        """Poll until the child exits — no fixed timeout."""
        while process.poll() is None:
            time.sleep(0.05)

    def stop(self) -> None:
        if not self._process:
            self._close_log()
            return
        self._intentional_stop = True
        process = self._process
        try:
            process.terminate()
            self._wait_until_process_exit(process)
            if process.poll() is None:
                process.kill()
                self._wait_until_process_exit(process)
        finally:
            self._process = None
            self._close_log()
            self._discard_stale_log_file()
            logger.info("Proxy core stopped")

    def terminate(self) -> None:
        self.stop()
