"""Bounded in-memory log capture for child processes (no growing log files)."""

from __future__ import annotations

import threading
from collections import deque
from typing import BinaryIO


class MemoryLogDrain:
    """Read a pipe on a background thread into a fixed-size byte ring."""

    def __init__(self, stream: BinaryIO, *, max_bytes: int = 64 * 1024) -> None:
        self._stream = stream
        self._max_bytes = max(4096, max_bytes)
        self._chunks: deque[bytes] = deque()
        self._size = 0
        self._lock = threading.Lock()
        self._thread = threading.Thread(target=self._run, daemon=True, name="PawLinkLogDrain")
        self._thread.start()

    def _run(self) -> None:
        try:
            while True:
                chunk = self._stream.read(8192)
                if not chunk:
                    break
                with self._lock:
                    self._chunks.append(chunk)
                    self._size += len(chunk)
                    while self._size > self._max_bytes and self._chunks:
                        dropped = self._chunks.popleft()
                        self._size -= len(dropped)
        except Exception:
            pass
        finally:
            try:
                self._stream.close()
            except Exception:
                pass

    def tail_text(self, *, max_lines: int = 40) -> str:
        with self._lock:
            data = b"".join(self._chunks)
        text = data.decode("utf-8", errors="replace")
        lines = [line for line in text.splitlines() if line.strip()]
        return "\n".join(lines[-max_lines:])

    def join(self, timeout: float = 1.0) -> None:
        self._thread.join(timeout=timeout)
