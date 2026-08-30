from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_caddy_exposes_public_https_mcp_by_injecting_existing_bearer_token():
    script = read("configure_liuli_mcp_https.sh")

    assert "@liuli_mcp path /mcp /mcp/*" in script
    assert "reverse_proxy 127.0.0.1:8000" in script
    assert 'header_up Authorization "Bearer $MCP_BEARER_TOKEN"' in script
    assert "/.well-known/oauth" not in script
    assert "MCP_OAUTH" not in script
    assert "serverInfo.name=liuli" in script


def test_server_startup_and_current_docs_do_not_enable_oauth():
    start_script = read("start_ubuntu_pg.sh")
    document = read("docs/liuli_mcp_design.md")

    assert "MCP_OAUTH" not in start_script
    assert "MCP OAuth" not in document
    assert "身份验证：无" in document
    assert "https://115-29-176-240.sslip.io/mcp/" in document
    assert "http://115.29.176.240:8000/mcp/" in document


def test_removed_oauth_operational_artifacts_stay_absent():
    assert not (ROOT / "init_liuli_mcp_oauth.sh").exists()
    assert not (ROOT / "tools/db/pgsql/20260829_mcp_oauth.sql").exists()
    assert not (ROOT / "invest_assistant/modules/basic/mcp/oauth/__init__.py").exists()
    assert not (ROOT / "invest_assistant/modules/basic/mcp/oauth/provider.py").exists()
