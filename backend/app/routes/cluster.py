from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from kubernetes import client, config

from app.services.settings_store import store

router = APIRouter()


def _load_config(kubeconfig_path: str = ""):
    if kubeconfig_path:
        config.load_kube_config(config_file=kubeconfig_path)
    else:
        try:
            config.load_kube_config()
        except Exception:
            config.load_incluster_config()
    conf = client.Configuration.get_default_copy()
    conf.proxy = ""
    client.Configuration.set_default(conf)


def _get_user_id(x_user_id: Optional[str]) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required.")
    return x_user_id


@router.get("/clusters")
def list_clusters(x_user_id: Optional[str] = Header(None)):
    user_id = _get_user_id(x_user_id)
    kubeconfig_path = store.get_kubeconfig_path(user_id)
    try:
        _load_config(kubeconfig_path)
        contexts, active = config.list_kube_config_contexts(config_file=kubeconfig_path)
        clusters = []
        seen = set()
        for ctx in contexts:
            name = ctx.get("name", "")
            cluster = ctx.get("context", {}).get("cluster", name)
            if cluster not in seen:
                seen.add(cluster)
                clusters.append({"name": cluster})
        if not clusters:
            clusters = [{"name": "default"}]
        return {"clusters": clusters}
    except Exception:
        return {"clusters": [{"name": "default"}]}


@router.get("/namespaces")
def list_namespaces(cluster: str = "default", x_user_id: Optional[str] = Header(None)):
    user_id = _get_user_id(x_user_id)
    kubeconfig_path = store.get_kubeconfig_path(user_id)
    try:
        _load_config(kubeconfig_path)
        core = client.CoreV1Api()
        ns_list = core.list_namespace()
        namespaces = [{"name": ns.metadata.name} for ns in ns_list.items]
        if not namespaces:
            namespaces = [{"name": "default"}]
        return {"namespaces": namespaces}
    except Exception:
        return {"namespaces": [{"name": "default"}]}
