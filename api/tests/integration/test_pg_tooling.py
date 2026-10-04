from typing import Any

import pytest


@pytest.mark.integration
def test_temporary_postgres_starts(pg: Any) -> None:
    cur = pg.cursor()
    cur.execute("select 1")
    assert cur.fetchone() == (1,)
