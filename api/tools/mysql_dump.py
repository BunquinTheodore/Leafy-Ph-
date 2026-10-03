"""Streaming parser for the INSERT statements of a mysqldump file.

The dump is far too large to load as text, and no MySQL server is available, so
this reads it line by line (mysqldump writes one INSERT per line) and decodes
only the tables the caller asks for. Text columns come back as ``str``,
``_binary`` and hex literals as ``bytes``.
"""

from __future__ import annotations

import re
from collections.abc import Iterator
from pathlib import Path

Value = int | float | str | bytes | None
Row = tuple[Value, ...]

_INSERT_RE = re.compile(
    rb"(?:INSERT(?:\s+IGNORE)?|REPLACE)\s+INTO\s+`([^`]+)`\s*(\([^)]*\))?\s*VALUES\s*"
)
_NUMBER_RE = re.compile(rb"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")
_HEX_RE = re.compile(rb"0x([0-9A-Fa-f]*)")
_ESCAPES = {
    ord("0"): b"\x00",
    ord("b"): b"\x08",
    ord("n"): b"\n",
    ord("r"): b"\r",
    ord("t"): b"\t",
    ord("Z"): b"\x1a",
}
_STRING_STOP = re.compile(rb"[\\']")


class DumpParseError(ValueError):
    """Raised when a VALUES list is not well formed."""


def as_int(value: Value) -> int:
    """Narrow a parsed column to ``int`` or fail loudly."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise DumpParseError(f"expected an integer column, got {type(value).__name__}")
    return value


def _read_quoted(data: bytes, pos: int) -> tuple[bytes, int]:
    """Read a quoted string starting after the opening quote; return raw bytes and end."""
    out = bytearray()
    while True:
        match = _STRING_STOP.search(data, pos)
        if match is None:
            raise DumpParseError("unterminated string literal")
        out += data[pos : match.start()]
        idx = match.start()
        if data[idx] == 0x27:  # quote
            if data[idx + 1 : idx + 2] == b"'":
                out += b"'"
                pos = idx + 2
                continue
            return bytes(out), idx + 1
        escaped = data[idx + 1 : idx + 2]
        if not escaped:
            raise DumpParseError("dangling backslash")
        out += _ESCAPES.get(escaped[0], escaped)
        pos = idx + 2


def _read_value(data: bytes, pos: int) -> tuple[Value, int]:
    head = data[pos : pos + 1]
    if head == b"'":
        raw, end = _read_quoted(data, pos + 1)
        return raw.decode("utf-8", errors="replace"), end
    if data.startswith(b"_binary '", pos):
        raw, end = _read_quoted(data, pos + 9)
        return raw, end
    if data.startswith(b"NULL", pos):
        return None, pos + 4
    hex_match = _HEX_RE.match(data, pos)
    if hex_match:
        return bytes.fromhex(hex_match.group(1).decode()), hex_match.end()
    num = _NUMBER_RE.match(data, pos)
    if num:
        text = num.group(0)
        is_float = b"." in text or b"e" in text.lower()
        return (float(text) if is_float else int(text)), num.end()
    raise DumpParseError(f"unexpected token at offset {pos}")


def parse_values(data: bytes) -> list[Row]:
    """Parse ``(..),(..)`` (optionally ending in ``;``) into row tuples."""
    rows: list[Row] = []
    pos, size = 0, len(data)
    while pos < size:
        if data[pos : pos + 1] in (b",", b" ", b"\r", b"\n"):
            pos += 1
            continue
        if data[pos : pos + 1] == b";":
            break
        if data[pos : pos + 1] != b"(":
            raise DumpParseError(f"expected '(' at offset {pos}")
        pos += 1
        values: list[Value] = []
        while True:
            value, pos = _read_value(data, pos)
            values.append(value)
            sep = data[pos : pos + 1]
            pos += 1
            if sep == b")":
                break
            if sep != b",":
                raise DumpParseError(f"expected ',' or ')' at offset {pos - 1}")
        rows.append(tuple(values))
    return rows


def iter_table_rows(path: Path, tables: set[str]) -> Iterator[tuple[str, Row]]:
    """Yield ``(table, row)`` for INSERTs into the wanted tables, one line in memory."""
    with path.open("rb") as handle:
        for line in handle:
            match = _INSERT_RE.match(line)
            if match is None:
                continue
            table = match.group(1).decode()
            if table not in tables:
                continue
            if match.group(2) is not None:
                raise DumpParseError(
                    f"INSERT into `{table}` has a column list; re-export without "
                    "--complete-insert so the column order is known"
                )
            for row in parse_values(line[match.end() :].rstrip()):
                yield table, row
