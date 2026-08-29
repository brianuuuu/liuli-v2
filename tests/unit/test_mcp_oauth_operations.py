from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_caddy_proxies_mcp_and_standard_oauth_metadata_without_static_json():
    script = read("configure_liuli_mcp_https.sh")

    assert "respond \"{\\\"resource\\\"" not in script
    assert "/.well-known/oauth-protected-resource/mcp" in script
    assert "/.well-known/oauth-authorization-server/mcp" in script
    assert "@liuli_mcp path /mcp /mcp/*" in script
    assert "reverse_proxy 127.0.0.1:8000" in script
    assert '"authorization_servers") != [sys.argv[3]]' in script
    assert '"authorization_endpoint"' in script
    assert '"token_endpoint"' in script
    assert '"revocation_endpoint"' in script


def test_start_script_enables_oauth_without_embedding_oauth_secrets():
    script = read("start_ubuntu_pg.sh")

    assert 'export MCP_OAUTH_ENABLED="${MCP_OAUTH_ENABLED:-true}"' in script
    assert 'export MCP_OAUTH_ISSUER_URL="https://115-29-176-240.sslip.io/mcp"' in script
    assert 'export MCP_OAUTH_RESOURCE_URL="https://115-29-176-240.sslip.io/mcp"' in script
    assert 'export MCP_OAUTH_ACCESS_TOKEN_MINUTES="15"' in script
    assert 'export MCP_OAUTH_REFRESH_TOKEN_DAYS="30"' in script
    assert 'export MCP_OAUTH_MASTER_KEY_FILE="/var/lib/liuli-mcp-oauth/master.key"' in script
    assert "MCP_OAUTH_CLIENT_SECRET" not in script


def test_mcp_documentation_explains_chatgpt_oauth_and_legacy_codex():
    document = read("docs/liuli_mcp_design.md")

    assert "https://115-29-176-240.sslip.io/mcp/" in document
    assert "http://115.29.176.240:8000/mcp/" in document
    assert "mcp offline_access" in document
    assert "provision-client" in document
    assert "rotate-secret" in document
    assert "disable-client" in document
    assert "client secret 只显示一次" in document
    assert "/var/lib/liuli-mcp-oauth/master.key" in document


def test_oauth_postgres_sql_creates_expected_tables_and_profile_transactionally():
    script = read("tools/db/pgsql/20260829_mcp_oauth.sql")

    assert script.lstrip().startswith("BEGIN;")
    assert "COMMIT;" in script
    for table_name in (
        "mcp_oauth_client",
        "mcp_oauth_authorization_request",
        "mcp_oauth_authorization_code",
        "mcp_oauth_token",
    ):
        assert f"CREATE TABLE IF NOT EXISTS {table_name}" in script
    assert "jsonb_set" in script
    assert "mcp.clients.chatgpt already exists with different settings" in script
    assert '"auth_modes": ["oauth"]' in script
    assert "market_radar.search_source_items" in script
    assert "knowledge_base.upload_research_feedback" in script


def test_oauth_postgres_sql_is_non_destructive_and_does_not_embed_credentials():
    script = read("tools/db/pgsql/20260829_mcp_oauth.sql")
    upper_script = script.upper()

    assert "DELETE FROM" not in upper_script
    assert "DROP TABLE" not in upper_script
    assert "TRUNCATE" not in upper_script
    assert "CLIENT_SECRET_CIPHERTEXT) VALUES" not in upper_script
    assert "DG9tZM6" not in script
    assert "142857Vps" not in script
