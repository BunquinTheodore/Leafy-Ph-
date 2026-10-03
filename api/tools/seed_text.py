"""Text cleaning and parsing helpers for the seed extraction.

The DAHON dump lost every non ASCII character in several text columns (they
arrive as U+FFFD), so cleaning also repairs those from context. Anything that
cannot be repaired with a known rule raises, so bad text never reaches the seed.
"""

from __future__ import annotations

import re
import unicodedata

REPLACEMENT = "\ufffd"
_SOFT_HYPHENS = ("\u00ad", "&shy;", "&#173;")
_INVISIBLES = ("\u200b", "\u200c", "\u200d", "\ufeff")
_HYBRID_GENERA = ("Fragaria", "Citrus", "Prunus", "Musa")
_ABBREVIATIONS = frozenset({"pv", "spp", "sp", "e.g", "i.e", "etc", "vs", "approx", "no", "st"})
_SUSPENDED_OK = ("and", "or", "to")


class UnrepairedTextError(ValueError):
    """Raised when text still contains U+FFFD after every repair rule ran."""


def slugify(value: str) -> str:
    """ASCII, lowercase, hyphen separated slug."""
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def _repair_replacement_chars(text: str) -> str:
    if REPLACEMENT not in text:
        return text
    bad = REPLACEMENT
    text = re.sub(rf"(?<=\d){bad}(?=[FC]\b)", "\u00b0", text)
    text = re.sub(rf"(?<=\d){bad}(?=\d)", " to ", text)
    genera = "|".join(_HYBRID_GENERA)
    text = re.sub(rf"\b({genera}) {bad} (?=[a-z])", "\\1 \u00d7 ", text)
    text = text.replace(f" {bad} ", "; ")
    text = re.sub(rf"(?<!\w){bad}([^{bad}]{{1,40}}?){bad}(?!\w)", "\u201c\\1\u201d", text)
    text = re.sub(rf"(?<=[A-Za-z]){bad}(?=[A-Za-z])", ", ", text)
    if bad in text:
        index = text.index(bad)
        context = text[max(0, index - 30) : index + 30]
        raise UnrepairedTextError(f"unrepairable replacement character near: {context!r}")
    return text


def _normalize_dashes(text: str) -> str:
    """Plain wording instead of dashes: ranges become 'to', separators a semicolon or comma."""
    text = re.sub(r"(?<=\d)\s?[\u2013\u2014]\s?(?=\d)", " to ", text)
    text = re.sub(r"\s[\u2013\u2014]\s", "; ", text)
    return re.sub(r"(?<=[A-Za-z])\u2014(?=[A-Za-z])", ", ", text)


def clean_text(raw: str) -> str:
    """NFC normalize, strip soft hyphens, join broken words, repair, collapse spaces."""
    text = unicodedata.normalize("NFC", raw).replace("\u00a0", " ")
    for token in (*_SOFT_HYPHENS, *_INVISIBLES):
        text = text.replace(token, "")
    text = re.sub(r"(?<=[A-Za-z])-[ \t]*[\r\n]+[ \t]*(?=[a-z])", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    text = _repair_replacement_chars(text)
    text = _normalize_dashes(text)
    text = re.sub(r"(?<![\w'])'([^'\n]{2,60}?)'(?![\w'])", "\u201c\\1\u201d", text)
    return text


def split_items(text: str) -> list[str]:
    """Split cleaned text into short sentence items without trailing periods."""
    items: list[str] = []
    start = 0
    for match in re.finditer(r"[.!?]\s+(?=[A-Z\u201c(])", text):
        words = text[start : match.start()].split()
        last_word = words[-1].lower() if words else ""
        if match.group(0)[0] == "." and last_word in _ABBREVIATIONS:
            continue
        items.append(text[start : match.start() + 1])
        start = match.end()
    items.append(text[start:])
    cleaned = (item.strip().rstrip(".").strip() for item in items)
    return [item for item in cleaned if item]


def _dedupe_key(item: str) -> str:
    return item.strip().rstrip(".").strip().lower()


def dedupe_keep_order(items: list[str]) -> list[str]:
    """Drop repeats (ignoring case and a trailing period), keeping first occurrence."""
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = _dedupe_key(item)
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    return result


_TYPE_WORDS = {
    "fungal complex": "fungal",
    "fungal": "fungal",
    "bacterial": "bacterial",
    "viral": "viral",
    "virus": "viral",
    "pest": "pest",
    "fungus": "fungal",
    "bacterium": "bacterial",
}
_BINOMIAL = r"[A-Z][a-z]+ [a-z-]+(?: pv\. [a-z]+)?"
_PATHOGEN_PATTERNS = (
    re.compile(r"^(?P<kind>Fungal|Bacterial) infection (?:primarily )?by (?P<name>[^,]+)"),
    re.compile(
        r"^(?P<kind>Fungal complex|Fungal|Bacterial|Viral|Virus|Pest)\b[^()]*\((?P<name>[^)]+)\)"
    ),
    re.compile(rf"\boomycete pathogen (?P<name>{_BINOMIAL})"),
    re.compile(
        rf"\bcaused by (?:the )?(?:(?P<kind>fungus|bacterium|virus) )?(?P<name>{_BINOMIAL})"
    ),
    re.compile(rf"^The (?P<kind>bacterium|fungus|virus) (?P<name>{_BINOMIAL})"),
)
_GENUS_TYPE = {"Phytophthora": "oomycete"}


def parse_pathogen(cause: str) -> tuple[str, str]:
    """Return ``(pathogen_type, pathogen_name)`` parsed from the free text cause."""
    for pattern in _PATHOGEN_PATTERNS:
        match = pattern.search(cause)
        if match is None:
            continue
        groups = match.groupdict()
        name = groups["name"].strip().rstrip(".")
        kind_word = (groups.get("kind") or "oomycete").lower()
        kind = _TYPE_WORDS.get(kind_word, kind_word)
        if kind == "pest":
            name = name.split(" or ")[0].strip()
        kind = _GENUS_TYPE.get(name.split(" ")[0], kind)
        if kind == "oomycete" or kind in set(_TYPE_WORDS.values()):
            return kind, name
    msg = f"cannot parse pathogen from cause: {cause[:80]!r}"
    raise ValueError(msg)


_LEVELS = {"low": 1, "mild": 1, "moderate": 2, "high": 3, "severe": 4}
_LEVEL_NAMES = {1: "low", 2: "moderate", 3: "high", 4: "severe"}


def severity_level(severity: str) -> str:
    """Highest severity word in the first clause of the severity text."""
    clause = re.split(r"[;,.]", severity)[0].lower()
    found = [rank for word, rank in _LEVELS.items() if re.search(rf"\b{word}\b", clause)]
    if not found:
        msg = f"no severity level in: {severity[:80]!r}"
        raise ValueError(msg)
    return _LEVEL_NAMES[max(found)]


def find_text_problems(text: str) -> list[str]:
    """Lint a piece of display text for hyphenation artifacts and lost characters."""
    problems: list[str] = []
    if any(token in text for token in _SOFT_HYPHENS):
        problems.append("soft hyphen")
    if re.search(r"[A-Za-z]-[ \t]*[\r\n]+\s*[A-Za-z]", text):
        problems.append("line break hyphen")
    allowed = "|".join(_SUSPENDED_OK)
    if re.search(rf"[a-z]{{2,}}- (?!(?:{allowed})\b)[a-z]", text):
        problems.append("hyphen followed by space and a lowercase word")
    if REPLACEMENT in text:
        problems.append("replacement character")
    return problems
