"""Public handbook API over the real seed data."""

from collections.abc import Iterator
from contextlib import contextmanager

import httpx
import pytest
from app.db.models import Disease, DiseaseImage, Plant
from app.seeds.loader import load_bundle, seed_database
from fastapi import FastAPI
from sqlalchemy import event, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

pytestmark = pytest.mark.integration

Factory = async_sessionmaker[AsyncSession]


@pytest.fixture
async def seeded(session_factory: Factory) -> None:
    await seed_database(session_factory, load_bundle())


@contextmanager
def count_statements(app: FastAPI) -> Iterator[list[str]]:
    statements: list[str] = []

    def record(_conn: object, _cursor: object, statement: str, *_: object) -> None:
        statements.append(statement)

    engine = app.state.engine.sync_engine
    event.listen(engine, "before_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(engine, "before_cursor_execute", record)


async def test_list_plants_returns_all_thirteen_sorted_by_name(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants")
    assert response.status_code == 200
    items = response.json()["data"]["items"]
    names = [item["name"] for item in items]
    assert len(items) == 13
    assert names == sorted(names)
    by_slug = {item["slug"]: item for item in items}
    assert by_slug["blueberry"]["disease_count"] == 0
    assert by_slug["soybean"]["disease_count"] == 0
    assert by_slug["tomato"]["disease_count"] > 0
    assert (
        by_slug["tomato"]["image_url"]
        == "http://storage.test/leafy-catalog/plant_photos/tomato.jpg"
    )


async def test_catalog_is_public_and_wrapped_in_the_envelope(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants")
    body = response.json()
    assert body["success"] is True and body["error"] is None
    assert "x-request-id" in response.headers


async def test_plant_search_matches_common_and_scientific_names_case_insensitively(
    client: httpx.AsyncClient, seeded: None
) -> None:
    by_common = await client.get("/api/v1/plants", params={"q": "  TOMA "})
    assert [i["slug"] for i in by_common.json()["data"]["items"]] == ["tomato"]
    by_scientific = await client.get("/api/v1/plants", params={"q": "malus"})
    assert [i["slug"] for i in by_scientific.json()["data"]["items"]] == ["apple"]


@pytest.mark.parametrize("term", ["%", "_", "\\", "' OR 1=1 --", "zzzz"])
async def test_search_treats_wildcards_and_sql_as_plain_text(
    client: httpx.AsyncClient, seeded: None, term: str
) -> None:
    response = await client.get("/api/v1/plants", params={"q": term})
    assert response.status_code == 200
    assert response.json()["data"]["items"] == []


async def test_search_term_longer_than_100_characters_is_rejected(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants", params={"q": "a" * 101})
    assert response.status_code == 422


async def test_plant_detail_lists_its_diseases_and_growth_fields(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants/tomato")
    assert response.status_code == 200
    plant = response.json()["data"]
    assert plant["name"] == "Tomato"
    assert plant["light"] and plant["soil_type"] and plant["water_needs"]
    slugs = {d["slug"] for d in plant["diseases"]}
    assert {"early-blight", "late-blight"} <= slugs
    assert all(d["plant_slug"] == "tomato" for d in plant["diseases"])
    assert plant["disease_count"] == len(plant["diseases"])


async def test_plant_without_diseases_returns_an_empty_list(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants/blueberry")
    assert response.status_code == 200
    assert response.json()["data"]["diseases"] == []


async def test_unknown_plant_is_404_with_the_error_envelope(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants/dragonfruit")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
    assert response.json()["data"] is None


async def test_disease_detail_groups_entries_by_kind_in_order(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants/tomato/diseases/early-blight")
    assert response.status_code == 200
    disease = response.json()["data"]
    assert disease["plant"] == {"slug": "tomato", "name": "Tomato"}
    assert disease["name"] and disease["display_name"]
    assert disease["symptoms"] and disease["treatments"] and disease["preventions"]
    assert disease["cause"]
    assert disease["affected_species"]
    assert disease["images"] == []
    assert len(set(disease["symptoms"])) == len(disease["symptoms"])


async def test_disease_slugs_are_unique_per_plant_not_globally(
    client: httpx.AsyncClient, seeded: None
) -> None:
    apple = await client.get("/api/v1/plants/apple/diseases/black-rot")
    grape = await client.get("/api/v1/plants/grape/diseases/black-rot")
    assert apple.status_code == grape.status_code == 200
    assert apple.json()["data"]["plant"]["slug"] == "apple"
    assert grape.json()["data"]["plant"]["slug"] == "grape"
    assert apple.json()["data"]["symptoms"] != grape.json()["data"]["symptoms"]


async def test_a_disease_under_the_wrong_plant_is_404(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants/potato/diseases/leaf-scorch")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_disease_images_are_returned_with_public_urls(
    client: httpx.AsyncClient, seeded: None, session_factory: Factory
) -> None:
    async with session_factory() as session:
        disease_id = (
            await session.execute(
                select(Disease.id)
                .join(Plant)
                .where(Plant.slug == "tomato", Disease.slug == "early-blight")
            )
        ).scalar_one()
        session.add(
            DiseaseImage(
                disease_id=disease_id,
                storage_key="images/tomato/early-blight/abc.jpg",
                sha256="a" * 64,
                alt_text="Tomato leaf with early blight",
                position=1,
            )
        )
        await session.commit()
    tomato = (await client.get("/api/v1/plants/tomato/diseases/early-blight")).json()["data"]
    potato = (await client.get("/api/v1/plants/potato/diseases/early-blight")).json()["data"]
    assert tomato["images"] == [
        {
            "url": "http://storage.test/leafy-catalog/images/tomato/early-blight/abc.jpg",
            "alt_text": "Tomato leaf with early blight",
        }
    ]
    assert potato["images"] == []


async def test_list_diseases_returns_all_27_with_plant_names(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/diseases")
    items = response.json()["data"]["items"]
    assert len(items) == 27
    assert all(item["plant_name"] and item["display_name"] for item in items)


async def test_diseases_filter_by_plant_and_query(client: httpx.AsyncClient, seeded: None) -> None:
    apple = await client.get("/api/v1/diseases", params={"plant": "apple"})
    assert {i["slug"] for i in apple.json()["data"]["items"]} == {
        "apple-scab",
        "black-rot",
        "cedar-apple-rust",
    }
    blight = await client.get("/api/v1/diseases", params={"q": "blight"})
    assert blight.json()["data"]["items"]
    assert all(
        "blight" in (i["name"] + i["display_name"]).lower() for i in blight.json()["data"]["items"]
    )
    narrowed = await client.get("/api/v1/diseases", params={"q": "blight", "plant": "potato"})
    assert {i["plant_slug"] for i in narrowed.json()["data"]["items"]} == {"potato"}
    nothing = await client.get("/api/v1/diseases", params={"plant": "dragonfruit"})
    assert nothing.json()["data"]["items"] == []


async def test_responses_carry_cache_headers_and_an_etag(
    client: httpx.AsyncClient, seeded: None
) -> None:
    for path in (
        "/api/v1/plants",
        "/api/v1/plants/tomato",
        "/api/v1/plants/tomato/diseases/early-blight",
        "/api/v1/diseases",
    ):
        response = await client.get(path)
        assert (
            response.headers["cache-control"] == "public, max-age=300, stale-while-revalidate=3600"
        )
        assert response.headers["etag"].startswith('W/"')


async def test_if_none_match_returns_304_without_a_body(
    client: httpx.AsyncClient, seeded: None
) -> None:
    first = await client.get("/api/v1/plants/tomato")
    etag = first.headers["etag"]
    cached = await client.get("/api/v1/plants/tomato", headers={"If-None-Match": etag})
    assert cached.status_code == 304
    assert cached.content == b""
    assert cached.headers["etag"] == etag
    assert "cache-control" in cached.headers
    strong = await client.get(
        "/api/v1/plants/tomato", headers={"If-None-Match": etag.removeprefix("W/")}
    )
    assert strong.status_code == 304
    several = await client.get(
        "/api/v1/plants/tomato", headers={"If-None-Match": f'"other", {etag}'}
    )
    assert several.status_code == 304
    star = await client.get("/api/v1/plants/tomato", headers={"If-None-Match": "*"})
    assert star.status_code == 304


async def test_a_stale_etag_returns_the_full_body(client: httpx.AsyncClient, seeded: None) -> None:
    response = await client.get("/api/v1/plants/tomato", headers={"If-None-Match": 'W/"stale"'})
    assert response.status_code == 200
    assert response.json()["data"]["slug"] == "tomato"


async def test_the_etag_changes_when_the_content_changes(
    client: httpx.AsyncClient, seeded: None, session_factory: Factory
) -> None:
    before = (await client.get("/api/v1/plants/tomato")).headers["etag"]
    async with session_factory() as session:
        await session.execute(update(Plant).where(Plant.slug == "tomato").values(light="Shade"))
        await session.commit()
    changed = await client.get("/api/v1/plants/tomato", headers={"If-None-Match": before})
    assert changed.status_code == 200
    assert changed.headers["etag"] != before


async def test_not_found_responses_are_not_cacheable(
    client: httpx.AsyncClient, seeded: None
) -> None:
    response = await client.get("/api/v1/plants/dragonfruit")
    assert "etag" not in response.headers


async def test_no_n_plus_one_queries(app: FastAPI, client: httpx.AsyncClient, seeded: None) -> None:
    with count_statements(app) as plants:
        await client.get("/api/v1/plants")
    with count_statements(app) as diseases:
        await client.get("/api/v1/diseases")
    with count_statements(app) as plant:
        await client.get("/api/v1/plants/tomato")
    with count_statements(app) as disease:
        await client.get("/api/v1/plants/tomato/diseases/early-blight")
    assert len(plants) == 1
    assert len(diseases) == 1
    assert len(plant) == 2
    assert len(disease) == 4
