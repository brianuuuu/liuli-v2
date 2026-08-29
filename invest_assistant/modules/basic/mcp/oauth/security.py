import base64
import hashlib
import hmac
import os
import secrets
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken


class OAuthConfigurationError(RuntimeError):
    pass


def generate_credential(byte_length: int = 32) -> str:
    return secrets.token_urlsafe(byte_length)


def hash_credential(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def pkce_s256_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def verify_pkce_s256(verifier: str, challenge: str) -> bool:
    try:
        actual = pkce_s256_challenge(verifier)
    except (UnicodeEncodeError, ValueError):
        return False
    return hmac.compare_digest(actual, challenge)


def load_or_create_master_key(path: Path, *, create: bool) -> bytes:
    key_path = Path(path)
    if not key_path.exists():
        if not create:
            raise OAuthConfigurationError(f"OAuth master key does not exist: {key_path}")
        key_path.parent.mkdir(parents=True, exist_ok=True)
        key = Fernet.generate_key()
        try:
            descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            key = key_path.read_bytes().strip()
        else:
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(key + b"\n")
            if os.name != "nt":
                os.chmod(key_path, 0o600)
    else:
        key = key_path.read_bytes().strip()

    if os.name != "nt" and key_path.stat().st_mode & 0o777 != 0o600:
        raise OAuthConfigurationError(f"OAuth master key permissions must be 0600: {key_path}")
    try:
        Fernet(key)
    except (TypeError, ValueError) as exc:
        raise OAuthConfigurationError(f"OAuth master key is invalid: {key_path}") from exc
    return key


def encrypt_client_secret(secret: str, key: bytes) -> str:
    return Fernet(key).encrypt(secret.encode("utf-8")).decode("ascii")


def decrypt_client_secret(ciphertext: str, key: bytes) -> str:
    try:
        return Fernet(key).decrypt(ciphertext.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeDecodeError, UnicodeEncodeError) as exc:
        raise OAuthConfigurationError("OAuth client secret cannot be decrypted") from exc
