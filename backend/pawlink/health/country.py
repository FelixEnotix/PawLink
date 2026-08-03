from __future__ import annotations

import re

# ISO / alias codes mapped to canonical ISO-3166 alpha-2 (uppercase).
FLAG_CODES: dict[str, str] = {
    "US": "US",
    "USA": "US",
    "GB": "GB",
    "UK": "GB",
    "DE": "DE",
    "FR": "FR",
    "NL": "NL",
    "RU": "RU",
    "JP": "JP",
    "SG": "SG",
    "HK": "HK",
    "KR": "KR",
    "FI": "FI",
    "SE": "SE",
    "CH": "CH",
    "PL": "PL",
    "CZ": "CZ",
    "TR": "TR",
    "AE": "AE",
    "IN": "IN",
    "CA": "CA",
    "AU": "AU",
    "BR": "BR",
    "IT": "IT",
    "ES": "ES",
    "UA": "UA",
    "KZ": "KZ",
    "LV": "LV",
    "LT": "LT",
    "EE": "EE",
    "NO": "NO",
    "DK": "DK",
    "AT": "AT",
    "BE": "BE",
    "IE": "IE",
    "IL": "IL",
    "TW": "TW",
    "MY": "MY",
    "TH": "TH",
    "VN": "VN",
    "ID": "ID",
    "PH": "PH",
    "MX": "MX",
    "AR": "AR",
    "CL": "CL",
    "CO": "CO",
    "PT": "PT",
    "RO": "RO",
    "HU": "HU",
    "GR": "GR",
    "BG": "BG",
    "RS": "RS",
    "HR": "HR",
    "SK": "SK",
    "SI": "SI",
    "LU": "LU",
    "IS": "IS",
    "NZ": "NZ",
    "ZA": "ZA",
    "EG": "EG",
    "SA": "SA",
    "QA": "QA",
    "KW": "KW",
    "PK": "PK",
    "BD": "BD",
    "IR": "IR",
    "IQ": "IQ",
    "CN": "CN",
}

NAME_KEYWORD_COUNTRY: dict[str, str] = {
    "美国": "US",
    "美國": "US",
    "香港": "HK",
    "台湾": "TW",
    "台灣": "TW",
    "日本": "JP",
    "韩国": "KR",
    "韓國": "KR",
    "新加坡": "SG",
    "英国": "GB",
    "英國": "GB",
    "德国": "DE",
    "德國": "DE",
    "法国": "FR",
    "法國": "FR",
    "荷兰": "NL",
    "荷蘭": "NL",
    "俄罗斯": "RU",
    "俄羅斯": "RU",
    "加拿大": "CA",
    "澳大利亚": "AU",
    "澳洲": "AU",
    "印度": "IN",
    "土耳其": "TR",
    "巴西": "BR",
    "意大利": "IT",
    "義大利": "IT",
    "西班牙": "ES",
    "乌克兰": "UA",
    "烏克蘭": "UA",
    "波兰": "PL",
    "波蘭": "PL",
    "芬兰": "FI",
    "芬蘭": "FI",
    "瑞典": "SE",
    "瑞士": "CH",
    "泰国": "TH",
    "泰國": "TH",
    "越南": "VN",
    "马来西亚": "MY",
    "馬來西亞": "MY",
    "印尼": "ID",
    "印度尼西亚": "ID",
    "菲律宾": "PH",
    "菲律賓": "PH",
    "中国": "CN",
    "中國": "CN",
}

REGION_COUNTRIES: dict[str, frozenset[str]] = {
    "EU": frozenset(
        {
            "DE", "FR", "NL", "GB", "FI", "SE", "PL", "IT", "ES", "CZ", "AT", "BE",
            "DK", "NO", "IE", "PT", "RO", "HU", "GR", "BG", "SK", "SI", "HR", "RS",
            "LU", "LV", "LT", "EE", "IS", "CH", "UA",
        }
    ),
    "US": frozenset({"US", "CA"}),
    "ASIA": frozenset({"JP", "SG", "HK", "KR", "TW", "TH", "VN", "MY", "ID", "PH", "IN"}),
    "ME": frozenset({"AE", "TR", "IL", "SA", "QA", "KW", "IR", "IQ"}),
    "OTHER": frozenset(),
}

REGIONAL_PAIR = re.compile(r"[\U0001F1E6-\U0001F1FF]{2}")


def resolve_country_code(name: str) -> str | None:
    """Best-effort ISO country code from a subscription node name."""
    if not name:
        return None

    pair = REGIONAL_PAIR.search(name)
    if pair:
        raw = pair.group(0)
        letters = "".join(chr(ord(c) - 0x1F1E6 + ord("A")) for c in raw)
        return letters if len(letters) == 2 else None

    for keyword, code in NAME_KEYWORD_COUNTRY.items():
        if keyword in name:
            return code

    upper = name.upper()
    for token in sorted(FLAG_CODES, key=len, reverse=True):
        pattern = rf"(?:^|[\s|｜\[\(\-–—_/]){re.escape(token)}(?:[\s|｜\]\)\-–—_/]|$)"
        if re.search(pattern, upper) or upper.startswith(f"{token} ") or upper.startswith(f"{token}-"):
            return FLAG_CODES[token]

    return None


def normalize_country_codes(codes: list[str]) -> list[str]:
    """Expand region tokens (EU, ASIA, …) embedded in a country list."""
    allowed: set[str] = set()
    for raw in codes:
        key = raw.strip().upper()
        if not key:
            continue
        if key in REGION_COUNTRIES and key != "OTHER":
            allowed.update(REGION_COUNTRIES[key])
        else:
            allowed.add(FLAG_CODES.get(key, key))
    return sorted(allowed)


def expand_regions(regions: list[str], explicit_countries: list[str]) -> frozenset[str]:
    allowed: set[str] = set()
    for region in regions:
        key = region.strip().upper()
        if key in REGION_COUNTRIES:
            allowed.update(REGION_COUNTRIES[key])
    for code in explicit_countries:
        normalized = code.strip().upper()
        if normalized:
            allowed.add(FLAG_CODES.get(normalized, normalized))
    return frozenset(allowed)
