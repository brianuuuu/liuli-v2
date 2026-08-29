import os
from pathlib import Path

import pytest


def test_credentials_are_random_and_hashes_are_deterministic():
    from invest_assistant.modules.basic.mcp.oauth.security import generate_credential, hash_credential

    first = generate_credential()
    second = generate_credential()

    assert first != second
    assert len(first) >= 43
    assert hash_credential(first) == hash_credential(first)
    assert first not in hash_credential(first)


def test_client_secret_round_trip_never_contains_plaintext(tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import (
        decrypt_client_secret,
        encrypt_client_secret,
        load_or_create_master_key,
    )

    key_path = tmp_path / "master.key"
    key = load_or_create_master_key(key_path, create=True)
    ciphertext = encrypt_client_secret("chatgpt-secret", key)

    assert "chatgpt-secret" not in ciphertext
    assert decrypt_client_secret(ciphertext, key) == "chatgpt-secret"
    assert load_or_create_master_key(key_path, create=False) == key
    if os.name != "nt":
        assert key_path.stat().st_mode & 0o777 == 0o600


def test_loading_missing_master_key_without_create_fails(tmp_path: Path):
    from invest_assistant.modules.basic.mcp.oauth.security import OAuthConfigurationError, load_or_create_master_key

    with pytest.raises(OAuthConfigurationError, match="does not exist"):
        load_or_create_master_key(tmp_path / "missing.key", create=False)


def test_pkce_accepts_only_matching_s256_verifier():
    from invest_assistant.modules.basic.mcp.oauth.security import pkce_s256_challenge, verify_pkce_s256

    verifier = "a" * 43
    challenge = pkce_s256_challenge(verifier)

    assert verify_pkce_s256(verifier, challenge)
    assert not verify_pkce_s256("b" * 43, challenge)
