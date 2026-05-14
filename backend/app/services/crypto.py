import base64
import hashlib
import os

from cryptography.fernet import Fernet

_KEY_ENV = "KPILOT_ENCRYPTION_KEY"
_KEY_FILE_NAME = ".encryption_key"


def _get_or_create_key() -> bytes:
    key_str = os.environ.get(_KEY_ENV, "").strip()
    if key_str:
        return _derive_fernet_key(key_str)

    key_file = os.path.join(
        os.environ.get("KPILOT_DATA_DIR", "/tmp/kpilot-ai"),
        _KEY_FILE_NAME,
    )
    if os.path.exists(key_file):
        with open(key_file, "r") as f:
            stored = f.read().strip()
        if stored:
            return _derive_fernet_key(stored)

    raw = Fernet.generate_key().decode()
    os.makedirs(os.path.dirname(key_file), exist_ok=True)
    with open(key_file, "w") as f:
        f.write(raw)
    os.chmod(key_file, 0o600)
    return _derive_fernet_key(raw)


def _derive_fernet_key(passphrase: str) -> bytes:
    digest = hashlib.sha256(passphrase.encode()).digest()
    return base64.urlsafe_b64encode(digest)


_fernet: Fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(_get_or_create_key())
    return _fernet


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str) -> str:
    if not ciphertext:
        return ""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except Exception:
        return ciphertext
