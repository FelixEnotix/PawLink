from __future__ import annotations

import io
import time

from pawlink.system.log_cap import MemoryLogDrain


def test_memory_log_drain_keeps_only_tail() -> None:
    payload = (b"line-%05d\n" % i for i in range(5000))
    stream = io.BytesIO(b"".join(payload))
    drain = MemoryLogDrain(stream, max_bytes=8 * 1024)
    drain.join(timeout=2.0)

    text = drain.tail_text(max_lines=200)
    assert text
    assert len(text.encode("utf-8")) <= 8 * 1024 + 2048
    assert "line-04999" in text
    assert "line-00000" not in text


def test_memory_log_drain_handles_flood_without_growth() -> None:
    chunk = b"x" * 10_000
    stream = io.BytesIO(chunk * 200)  # ~2 MB
    drain = MemoryLogDrain(stream, max_bytes=32 * 1024)
    t0 = time.perf_counter()
    drain.join(timeout=3.0)
    elapsed = time.perf_counter() - t0
    assert elapsed < 2.0
    text = drain.tail_text(max_lines=5)
    assert text
    assert len(text.encode("utf-8")) <= 40 * 1024
