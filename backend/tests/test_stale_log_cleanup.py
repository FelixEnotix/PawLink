from __future__ import annotations

from pathlib import Path

from pawlink.service import PawLinkService


def test_cleanup_removes_stale_log_files(tmp_path: Path) -> None:
    mihomo = tmp_path / "mihomo.log"
    backend = tmp_path / "backend.log"
    mihomo.write_text("old-core-log\n" * 1000, encoding="utf-8")
    backend.write_text("old-backend-log\n" * 1000, encoding="utf-8")

    svc = PawLinkService(data_dir=tmp_path)
    svc._cleanup_stale_log_files()

    assert not mihomo.exists()
    assert not backend.exists()
