from pathlib import Path

from fastapi.testclient import TestClient

from invest_assistant.bootstrap.app import create_app
from invest_assistant.bootstrap.database import Base, SessionLocal, engine
from invest_assistant.modules.basic.disclosure_library.repository import upsert_disclosure
from invest_assistant.modules.basic.disclosure_library.schemas import CompanyDisclosureCreate
from invest_assistant.modules.basic.job_center.dispatcher import execute_job


def reset_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def login_headers(client: TestClient) -> dict[str, str]:
    token = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"}).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_disclosure_repository_upserts_by_source_url():
    reset_db()
    db = SessionLocal()
    try:
        first = upsert_disclosure(
            db,
            CompanyDisclosureCreate(
                source="cninfo",
                disclosure_type="announcement",
                title="第一次标题",
                source_url="https://example.com/a.pdf",
                parse_status="pending",
            ),
        )
        second = upsert_disclosure(
            db,
            CompanyDisclosureCreate(
                source="cninfo",
                disclosure_type="announcement",
                title="更新标题",
                source_url="https://example.com/a.pdf",
                parse_status="pending",
            ),
        )
        assert first.id == second.id
        assert second.title == "更新标题"
    finally:
        db.close()


def test_disclosure_download_parse_and_to_source_item(tmp_path):
    reset_db()
    client = TestClient(create_app())
    headers = login_headers(client)
    source_file = tmp_path / "announcement.txt"
    source_file.write_text("重大公告内容：AI算力业务增长。", encoding="utf-8")

    disclosure = client.post(
        "/api/disclosures",
        json={
            "source": "cninfo",
            "disclosure_type": "announcement",
            "title": "重大公告",
            "source_url": source_file.as_uri(),
            "parse_status": "pending",
        },
        headers=headers,
    ).json()

    downloaded = client.post(f"/api/disclosures/{disclosure['id']}/download", headers=headers)
    assert downloaded.status_code == 200
    assert downloaded.json()["file_path"].startswith("raw/disclosures/")

    parsed = client.post(f"/api/disclosures/{disclosure['id']}/parse", headers=headers)
    assert parsed.status_code == 200
    assert parsed.json()["parse_status"] == "parsed"
    assert parsed.json()["parsed_text_path"].startswith("processed/disclosures/text/")
    assert Path("var", parsed.json()["parsed_text_path"]).exists()

    source_item = client.post(f"/api/disclosures/{disclosure['id']}/to-source-item", headers=headers)
    assert source_item.status_code == 200
    assert source_item.json()["source_type"] == "announcement"
    assert "重大公告" in source_item.json()["title"]


def test_disclosure_jobs_download_parse_and_market_radar(tmp_path):
    reset_db()
    source_file = tmp_path / "report.txt"
    source_file.write_text("财报内容：利润增长。", encoding="utf-8")
    db = SessionLocal()
    try:
        item = upsert_disclosure(
            db,
            CompanyDisclosureCreate(
                source="cninfo",
                disclosure_type="annual_report",
                title="年度报告",
                source_url=source_file.as_uri(),
                parse_status="pending",
            ),
        )
        assert execute_job(db, "disclosure_library.download_file", {"disclosure_id": item.id}).success is True
        assert execute_job(db, "disclosure_library.parse_pdf", {"disclosure_id": item.id}).success is True
    finally:
        db.close()
