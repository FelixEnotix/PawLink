from __future__ import annotations

import re
from urllib.parse import urlparse

from pawlink.models.profile import RoutingRule, RuleType

FQDN_RE = re.compile(
    r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
)
URL_SCHEME_RE = re.compile(r"^https?://", re.I)
DOMAIN_LIKE_RE = re.compile(r"^[a-zA-Z0-9.*+-]+$")
REGEX_SPECIAL = re.compile(r"[\\^$|?+()\[\]{}]")
EXE_RE = re.compile(r"^[\w\s.-]+\.exe$", re.I)

# Map user input / domain tokens → MetaCubeX geosite categories.
# Without this, DOMAIN-KEYWORD,youtube leaves googlevideo/ytimg on MATCH,DIRECT
# and the page partially loads then stalls (exactly what mihomo.log showed).
_GEOSITE_ALIASES: dict[str, tuple[str, ...]] = {
    "youtube": ("youtube",),
    "youtu.be": ("youtube",),
    "youtu": ("youtube",),
    "ytimg": ("youtube",),
    "ggpht": ("youtube",),
    "googlevideo": ("youtube",),
    "google": ("google",),
    "gmail": ("google",),
    "googleapis": ("google",),
    "gstatic": ("google",),
    "telegram": ("telegram",),
    "t.me": ("telegram",),
    "discord": ("discord",),
    "netflix": ("netflix",),
    "nflxvideo": ("netflix",),
    "instagram": ("instagram",),
    "twitter": ("twitter",),
    "x.com": ("twitter",),
    "facebook": ("facebook",),
    "fb.com": ("facebook",),
    "tiktok": ("tiktok",),
    "github": ("github",),
    "chatgpt": ("openai",),
    "openai": ("openai",),
    "spotify": ("spotify",),
    "twitch": ("twitch",),
    "reddit": ("reddit",),
    "whatsapp": ("whatsapp",),
    "signal": ("signal",),
}


class RuleSanitizer:
    """
    Runtime custom rule validation and sanitization (Module 4).

    - URLs/links -> strict FQDN domain rules
    - Simple keywords -> domain_keyword or domain_regex for subdomain matching
    - Known services expand to GEOSITE (koala / clash-verge style) so CDNs work
    """

    def sanitize(self, raw_input: str, action: str = "PROXY") -> RoutingRule:
        text = raw_input.strip()
        if not text:
            raise ValueError("Rule input cannot be empty")

        if URL_SCHEME_RE.match(text) or text.startswith("//"):
            fqdn = self._strip_www(self._extract_fqdn_from_url(text))
            return RoutingRule(rule_type=RuleType.DOMAIN_SUFFIX, value=fqdn, action=action)

        if text.startswith("*.") or text.startswith("."):
            keyword = text.lstrip("*.").lstrip(".")
            return RoutingRule(rule_type=RuleType.DOMAIN_KEYWORD, value=keyword, action=action)

        if EXE_RE.match(text) or text.lower().endswith(".exe"):
            exe = text.lower()
            if not exe.endswith(".exe"):
                exe = f"{exe}.exe"
            # Windows paths: keep only the executable file name for PROCESS-NAME rules.
            exe = exe.replace("/", "\\").split("\\")[-1]
            return RoutingRule(rule_type=RuleType.PROCESS, value=exe, action=action)

        if FQDN_RE.match(text):
            return RoutingRule(
                rule_type=RuleType.DOMAIN_SUFFIX,
                value=self._strip_www(text.lower()),
                action=action,
            )

        if REGEX_SPECIAL.search(text):
            return RoutingRule(rule_type=RuleType.DOMAIN_REGEX, value=text, action=action)

        if DOMAIN_LIKE_RE.match(text):
            return RoutingRule(rule_type=RuleType.DOMAIN_KEYWORD, value=text.lower(), action=action)

        raise ValueError(f"Unable to classify rule input: {raw_input!r}")

    def sanitize_batch(
        self,
        inputs: list[str],
        action: str = "PROXY",
    ) -> list[RoutingRule]:
        return [self.sanitize(item, action) for item in inputs]

    @staticmethod
    def _strip_www(host: str) -> str:
        return host[4:] if host.startswith("www.") else host

    @staticmethod
    def _extract_fqdn_from_url(text: str) -> str:
        normalized = text if URL_SCHEME_RE.match(text) else f"https://{text.lstrip('/')}"
        parsed = urlparse(normalized)
        host = parsed.hostname
        if not host:
            raise ValueError(f"Cannot extract domain from URL: {text!r}")
        return host.lower()

    def to_mihomo_rule(self, rule: RoutingRule) -> str:
        return self.to_mihomo_rules(rule)[0]

    def to_mihomo_rules(self, rule: RoutingRule) -> list[str]:
        """Emit one or more mihomo rule lines (GEOSITE expansion included)."""
        action = (rule.action or "PROXY").upper()
        lines: list[str] = []
        seen: set[str] = set()

        def add(line: str) -> None:
            if line not in seen:
                seen.add(line)
                lines.append(line)

        for category in self._geosite_categories_for(rule):
            add(f"GEOSITE,{category},{action}")

        add(self._format_rule(rule))
        return lines

    def _geosite_categories_for(self, rule: RoutingRule) -> list[str]:
        if rule.rule_type == RuleType.GEOSITE:
            return [rule.value.lower()]
        if rule.rule_type == RuleType.PROCESS:
            return []
        if rule.rule_type not in {
            RuleType.DOMAIN,
            RuleType.DOMAIN_SUFFIX,
            RuleType.DOMAIN_KEYWORD,
        }:
            return []

        tokens = self._tokens_from_value(rule.value)
        categories: list[str] = []
        for token in tokens:
            for cat in _GEOSITE_ALIASES.get(token, ()):
                if cat not in categories:
                    categories.append(cat)
        return categories

    @staticmethod
    def _tokens_from_value(value: str) -> list[str]:
        text = value.lower().strip().lstrip(".")
        if text.startswith("www."):
            text = text[4:]
        parts = [p for p in text.split(".") if p]
        tokens = [text, *parts]
        # Also try registrable-ish labels: youtube.com → youtube
        if len(parts) >= 2:
            tokens.append(parts[-2])
        # Dedup preserve order
        out: list[str] = []
        for t in tokens:
            if t and t not in out:
                out.append(t)
        return out

    @staticmethod
    def _format_rule(rule: RoutingRule) -> str:
        prefix_map = {
            RuleType.DOMAIN: "DOMAIN",
            RuleType.DOMAIN_SUFFIX: "DOMAIN-SUFFIX",
            RuleType.DOMAIN_KEYWORD: "DOMAIN-KEYWORD",
            RuleType.DOMAIN_REGEX: "DOMAIN-REGEX",
            RuleType.GEOIP: "GEOIP",
            RuleType.GEOSITE: "GEOSITE",
            RuleType.IP_CIDR: "IP-CIDR",
            RuleType.PROCESS: "PROCESS-NAME",
        }
        prefix = prefix_map.get(rule.rule_type, "DOMAIN-SUFFIX")
        # GEOIP/IP-CIDR often need no-resolve to avoid DNS loops under TUN.
        if rule.rule_type in {RuleType.GEOIP, RuleType.IP_CIDR}:
            return f"{prefix},{rule.value},{rule.action},no-resolve"
        return f"{prefix},{rule.value},{rule.action}"
