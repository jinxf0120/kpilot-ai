import logging

from fastapi import APIRouter, Header, HTTPException
from typing import Optional

from app.services.settings_store import UserSettings, store

logger = logging.getLogger(__name__)

router = APIRouter()


def _get_user_id(x_user_id: Optional[str]) -> str:
    logger.info("Received X-User-ID header: %r", x_user_id)
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required.")
    return x_user_id


@router.get("/settings")
def get_settings(x_user_id: Optional[str] = Header(None)):
    user_id = _get_user_id(x_user_id)
    settings = store.get(user_id)
    return {
        "llm_provider": settings.llm_provider,
        "llm_model": settings.llm_model,
        "api_key_set": bool(settings.api_key),
        "api_endpoint": settings.api_endpoint,
        "kubeconfig_set": bool(settings.kubeconfig),
    }


@router.put("/settings")
def put_settings(body: UserSettings, x_user_id: Optional[str] = Header(None)):
    user_id = _get_user_id(x_user_id)
    store.put(user_id, body)
    return {"status": "ok"}


@router.delete("/settings")
def delete_settings(x_user_id: Optional[str] = Header(None)):
    user_id = _get_user_id(x_user_id)
    store.delete(user_id)
    return {"status": "deleted"}
