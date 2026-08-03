"""PawLink backend entry point."""

from __future__ import annotations

import argparse
import logging
import os
import sys

import uvicorn

from pawlink.system.elevation import PrivilegeElevationService


def _configure_logging(quiet: bool) -> None:
    level = logging.WARNING if quiet else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.WARNING if quiet else logging.INFO)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING if quiet else logging.INFO)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


def main() -> None:
    parser = argparse.ArgumentParser(description="PawLink Backend Service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--elevate", action="store_true", help="Request UAC elevation on startup")
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Reduce console logging (also enabled by PAWLINK_QUIET=1)",
    )
    args = parser.parse_args()

    quiet = args.quiet or os.environ.get("PAWLINK_QUIET", "").strip() in {"1", "true", "yes"}
    _configure_logging(quiet)

    if args.elevate:
        elevation = PrivilegeElevationService()
        if elevation.request_elevation():
            sys.exit(0)

    uvicorn.run(
        "pawlink.api:app",
        host=args.host,
        port=args.port,
        reload=False,
        log_level="warning" if quiet else "info",
        access_log=not quiet,
    )


if __name__ == "__main__":
    main()
