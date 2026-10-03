from __future__ import annotations

from pathlib import Path

import pytest
from tools.mysql_dump import DumpParseError, iter_table_rows, parse_values


def test_parses_ints_floats_null_and_strings() -> None:
    rows = parse_values(b"(1,'a b',NULL,2.5),(2,'it''s',NULL,-3)")
    assert rows == [(1, "a b", None, 2.5), (2, "it's", None, -3)]


def test_handles_backslash_escapes_in_text() -> None:
    rows = parse_values(rb"(1,'line\nbreak \'q\' back\\slash \0 x')")
    assert rows == [(1, "line\nbreak 'q' back\\slash \x00 x")]


def test_binary_literal_returns_bytes() -> None:
    rows = parse_values(rb"(1,_binary 'AB\0\r\n\Z\'C')")
    assert rows == [(1, b"AB\x00\r\n\x1a'C")]


def test_hex_literal_returns_bytes() -> None:
    assert parse_values(b"(1,0xFFD8FFE0)") == [(1, b"\xff\xd8\xff\xe0")]


def test_text_keeps_unicode_and_commas_parens() -> None:
    rows = parse_values("(1,'pH 6.0\u20136.8, (loamy)')".encode())
    assert rows == [(1, "pH 6.0\u20136.8, (loamy)")]


def test_malformed_input_raises() -> None:
    with pytest.raises(DumpParseError):
        parse_values(b"(1,'unterminated)")


def test_iter_table_rows_streams_only_requested_tables(tmp_path: Path) -> None:
    dump = tmp_path / "d.sql"
    dump.write_bytes(
        b"-- header\r\nINSERT INTO `a` VALUES (1,'x'),(2,'y');\r\n"
        b"INSERT INTO `b` VALUES (9,NULL);\r\nINSERT INTO `a` VALUES (3,'z');\r\n"
    )
    rows = list(iter_table_rows(dump, {"a"}))
    assert rows == [("a", (1, "x")), ("a", (2, "y")), ("a", (3, "z"))]
