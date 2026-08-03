from __future__ import annotations

import logging
import socket
import subprocess
import sys
import time

logger = logging.getLogger(__name__)

IS_WINDOWS = sys.platform == "win32"


def _port_is_free(port: int, host: str = "127.0.0.1") -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind((host, port))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _listening_pids(port: int) -> list[int]:
    if not IS_WINDOWS:
        return []
    try:
        result = subprocess.run(
            ["netstat", "-ano", "-p", "tcp"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except (subprocess.SubprocessError, OSError) as exc:
        logger.debug("netstat failed: %s", exc)
        return []

    pids: set[int] = set()
    needle = f":{port}"
    for line in (result.stdout or "").splitlines():
        if "LISTENING" not in line.upper():
            continue
        parts = line.split()
        if len(parts) < 4:
            continue
        local = parts[1]
        if not local.endswith(needle):
            continue
        try:
            pid = int(parts[-1])
        except ValueError:
            continue
        if pid > 0:
            pids.add(pid)
    return sorted(pids)


def kill_listeners_on_port(port: int) -> list[int]:
    """Terminate processes listening on a TCP port (Windows). Returns killed PIDs."""
    if not IS_WINDOWS:
        return []
    if _port_is_free(port):
        return []

    killed: list[int] = []
    for pid in _listening_pids(port):
        try:
            subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True,
                text=True,
                timeout=5,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            killed.append(pid)
        except (subprocess.SubprocessError, OSError):
            continue
    if killed:
        logger.info("Freed port %s (stopped PIDs: %s)", port, killed)
    return killed


def wait_until_port_free(port: int, *, poll_seconds: float = 0.1) -> None:
    """Block until the port can be bound — no fixed deadline, works on slow machines."""
    while not _port_is_free(port):
        time.sleep(poll_seconds)


def free_mihomo_ports(*, mixed_port: int = 7890, controller_port: int = 9090) -> None:
    """Legacy helper for dev scripts — prefer release_own_mihomo_ports in the app."""
    for port in (mixed_port, controller_port):
        kill_listeners_on_port(port)
        wait_until_port_free(port)
