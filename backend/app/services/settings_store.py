import json
import os
import tempfile
from pathlib import Path
from typing import Dict, Optional

from pydantic import BaseModel

from .crypto import encrypt, decrypt


DATA_DIR = Path(os.environ.get("KPILOT_DATA_DIR", os.path.join(tempfile.gettempdir(), "kpilot-ai")))
KUBECONFIG_DIR = DATA_DIR / "kubeconfig"
SETTINGS_DIR = DATA_DIR / "settings"


class UserSettings(BaseModel):
    llm_provider: str = "openai"
    llm_model: str = "gpt-4o"
    api_key: str = ""
    api_endpoint: str = ""
    kubeconfig: str = ""


class _UserSettingsStore:
    def __init__(self):
        self._data: Dict[str, UserSettings] = {}
        KUBECONFIG_DIR.mkdir(parents=True, exist_ok=True)
        SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
        self._load_all()

    def _settings_path(self, user_id: str) -> Path:
        safe_id = user_id.replace("/", "_").replace("..", "_")
        return SETTINGS_DIR / f"{safe_id}.json"

    def _load_all(self) -> None:
        if not SETTINGS_DIR.exists():
            return
        for f in SETTINGS_DIR.iterdir():
            if f.suffix == ".json":
                try:
                    data = json.loads(f.read_text())
                    data["api_key"] = decrypt(data.get("api_key", ""))
                    data["kubeconfig"] = decrypt(data.get("kubeconfig", ""))
                    s = UserSettings(**data)
                    user_id = f.stem
                    self._data[user_id] = s
                except Exception:
                    pass

    def _persist(self, user_id: str, settings: UserSettings) -> None:
        data = json.loads(settings.json())
        data["api_key"] = encrypt(data.get("api_key", ""))
        data["kubeconfig"] = encrypt(data.get("kubeconfig", ""))
        path = self._settings_path(user_id)
        path.write_text(json.dumps(data, ensure_ascii=False))

    def get(self, user_id: str) -> UserSettings:
        return self._data.get(user_id, UserSettings())

    def put(self, user_id: str, settings: UserSettings) -> None:
        existing = self._data.get(user_id)
        if existing:
            if not settings.api_key:
                settings.api_key = existing.api_key
            if not settings.kubeconfig:
                settings.kubeconfig = existing.kubeconfig
        self._data[user_id] = settings
        self._persist(user_id, settings)

    def delete(self, user_id: str) -> None:
        self._data.pop(user_id, None)
        path = self._settings_path(user_id)
        if path.exists():
            path.unlink()
        user_dir = KUBECONFIG_DIR / user_id
        if user_dir.exists():
            for f in user_dir.iterdir():
                f.unlink()
            user_dir.rmdir()

    def get_kubeconfig_path(self, user_id: str) -> Optional[str]:
        settings = self._data.get(user_id)
        if not settings or not settings.kubeconfig:
            return None
        user_dir = KUBECONFIG_DIR / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        path = user_dir / "config"
        path.write_text(settings.kubeconfig)
        return str(path)


store = _UserSettingsStore()
