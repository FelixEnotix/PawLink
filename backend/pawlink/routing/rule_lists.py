from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

import httpx
import yaml

from pawlink.models.profile import RoutingRule, RuleType

logger = logging.getLogger(__name__)

_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_CLASH_LINE_RE = re.compile(
    r"^(?P<rtype>DOMAIN|DOMAIN-SUFFIX|DOMAIN-KEYWORD|DOMAIN-REGEX|GEOIP|GEOSITE|"
    r"IP-CIDR|IP-CIDR6|PROCESS-NAME|PROCESS-PATH)\s*,\s*(?P<value>[^,]+)\s*,\s*(?P<action>\w+)",
    re.I,
)

_TYPE_MAP = {
    "DOMAIN": RuleType.DOMAIN,
    "DOMAIN-SUFFIX": RuleType.DOMAIN_SUFFIX,
    "DOMAIN-KEYWORD": RuleType.DOMAIN_KEYWORD,
    "DOMAIN-REGEX": RuleType.DOMAIN_REGEX,
    "GEOIP": RuleType.GEOIP,
    "GEOSITE": RuleType.GEOSITE,
    "IP-CIDR": RuleType.IP_CIDR,
    "IP-CIDR6": RuleType.IP_CIDR,
    "PROCESS-NAME": RuleType.PROCESS,
    "PROCESS-PATH": RuleType.PROCESS,
}

_ACTION_MAP = {
    "VPN": "PROXY",
    "PROXY": "PROXY",
    "DIRECT": "DIRECT",
    "REJECT": "REJECT",
    "BLOCK": "REJECT",
}


@dataclass(frozen=True)
class RuleListInfo:
    name: str
    rule_count: int
    path: str
    bundled: bool = False


class RuleListManager:
    """Named regional rule lists: filename stem = list name (RU, EU, …)."""

    def __init__(self, data_dir: str | Path) -> None:
        self._user_dir = Path(data_dir) / "rule-lists"
        self._user_dir.mkdir(parents=True, exist_ok=True)

    @property
    def directory(self) -> Path:
        return self._user_dir

    def ensure_bundled(self) -> None:
        """Copy packaged defaults into the user rule-lists folder if missing."""
        try:
            bundled = resources.files("pawlink.assets").joinpath("rule-lists")
        except Exception:
            logger.debug("No bundled rule-lists package")
            return
        if not bundled.is_dir():
            return
        for item in bundled.iterdir():
            if not item.is_file():
                continue
            if item.suffix.lower() not in {".txt", ".yaml", ".yml"}:
                continue
            dest = self._user_dir / item.name
            if dest.exists():
                continue
            try:
                dest.write_bytes(item.read_bytes())
                logger.info("Seeded rule list %s", dest.name)
            except Exception:
                logger.exception("Failed to seed rule list %s", item.name)

    def list_lists(self) -> list[RuleListInfo]:
        self.ensure_bundled()
        bundled_names = self._bundled_names()
        items: list[RuleListInfo] = []
        for path in sorted(self._user_dir.iterdir(), key=lambda p: p.stem.lower()):
            if not path.is_file() or path.suffix.lower() not in {".txt", ".yaml", ".yml"}:
                continue
            name = path.stem
            try:
                count = len(self.parse_file(path))
            except Exception:
                count = 0
            items.append(
                RuleListInfo(
                    name=name,
                    rule_count=count,
                    path=str(path),
                    bundled=name in bundled_names,
                )
            )
        return items

    def get_path(self, name: str) -> Path:
        safe = self._validate_name(name)
        for suffix in (".txt", ".yaml", ".yml"):
            candidate = self._user_dir / f"{safe}{suffix}"
            if candidate.is_file():
                return candidate
        raise FileNotFoundError(f"Список правил «{safe}» не найден")

    def parse_named(self, name: str) -> list[RoutingRule]:
        return self.parse_file(self.get_path(name))

    def save_content(self, name: str, content: str) -> RuleListInfo:
        safe = self._validate_name(name)
        # Validate parse before writing
        rules = self.parse_text(content)
        if not rules:
            raise ValueError("В файле нет распознанных правил")
        path = self._user_dir / f"{safe}.txt"
        path.write_text(content if content.endswith("\n") else content + "\n", encoding="utf-8")
        return RuleListInfo(name=safe, rule_count=len(rules), path=str(path), bundled=False)

    async def download(self, name: str, url: str) -> RuleListInfo:
        safe = self._validate_name(name)
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            content = response.text
        return self.save_content(safe, content)

    def delete(self, name: str) -> bool:
        try:
            path = self.get_path(name)
        except FileNotFoundError:
            return False
        path.unlink(missing_ok=True)
        return True

    @classmethod
    def parse_file(cls, path: Path) -> list[RoutingRule]:
        text = path.read_text(encoding="utf-8")
        return cls.parse_text(text)

    @classmethod
    def parse_text(cls, text: str) -> list[RoutingRule]:
        """Parse Clash-style rule lists (YAML prepend/append or plain lines)."""
        stripped = text.strip()
        if not stripped:
            return []

        lines: list[str] = []
        # YAML with prepend:/append: keys (user's Дефолтные правила format)
        if re.search(r"^(prepend|append)\s*:", stripped, re.M | re.I):
            try:
                data = yaml.safe_load(stripped)
            except yaml.YAMLError:
                data = None
            if isinstance(data, dict):
                for key in ("prepend", "append", "rules"):
                    block = data.get(key)
                    if isinstance(block, list):
                        for item in block:
                            if isinstance(item, str):
                                lines.append(item.strip())
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, str):
                        lines.append(item.strip())
        else:
            lines = [ln.strip() for ln in stripped.splitlines()]

        rules: list[RoutingRule] = []
        seen: set[tuple[str, str]] = set()
        for raw in lines:
            rule = cls.parse_clash_line(raw)
            if rule is None:
                continue
            key = (rule.rule_type.value, rule.value.lower())
            if key in seen:
                continue
            seen.add(key)
            rules.append(rule)
        return rules

    @classmethod
    def parse_clash_line(cls, raw: str) -> RoutingRule | None:
        text = raw.strip().strip("'\"")
        if not text or text.startswith("#") or text.startswith("prepend") or text.startswith("append"):
            return None
        # Drop YAML list markers
        if text.startswith("- "):
            text = text[2:].strip().strip("'\"")
        match = _CLASH_LINE_RE.match(text)
        if not match:
            return None
        rtype = match.group("rtype").upper()
        value = match.group("value").strip()
        action_raw = match.group("action").upper()
        rule_type = _TYPE_MAP.get(rtype)
        action = _ACTION_MAP.get(action_raw)
        if rule_type is None or action is None:
            return None
        if rule_type == RuleType.PROCESS:
            value = value.replace("/", "\\").split("\\")[-1].lower()
            if not value.endswith(".exe"):
                value = f"{value}.exe"
        elif rule_type in {RuleType.DOMAIN, RuleType.DOMAIN_SUFFIX, RuleType.DOMAIN_KEYWORD}:
            value = value.lower()
            if value.startswith("www."):
                value = value[4:]
        elif rule_type == RuleType.GEOIP:
            value = value.upper()
        elif rule_type == RuleType.GEOSITE:
            value = value.lower()
        return RoutingRule(rule_type=rule_type, value=value, action=action)

    @staticmethod
    def _validate_name(name: str) -> str:
        safe = (name or "").strip()
        if not _NAME_RE.match(safe):
            raise ValueError(
                "Имя списка: латиница/цифры, до 64 символов (например RU, EU, custom-1)"
            )
        return safe

    @staticmethod
    def _bundled_names() -> set[str]:
        names: set[str] = set()
        try:
            bundled = resources.files("pawlink.assets").joinpath("rule-lists")
            if bundled.is_dir():
                for item in bundled.iterdir():
                    if item.is_file():
                        names.add(Path(item.name).stem)
        except Exception:
            pass
        return names
