import uuid
from typing import Optional

from fastapi import APIRouter, Header, HTTPException

from app.models.command import DirectExecuteRequest, ExecuteRequest, ExecuteResponse, PreviewRequest, PreviewResponse
from app.services.executor import execute_command
from app.services.preview import (
    ForbiddenIntentError,
    generate_preview,
    validate_command,
)
from app.services.settings_store import store
from app.services.store import CommandRecord, store as cmd_store

router = APIRouter()


def _get_user_id(x_user_id: Optional[str]) -> str:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="X-User-ID header is required.")
    return x_user_id


@router.post("/preview", response_model=PreviewResponse)
def preview(req: PreviewRequest, x_user_id: Optional[str] = Header(None)) -> PreviewResponse:
    user_id = _get_user_id(x_user_id)
    settings = store.get(user_id)
    kubeconfig_path = store.get_kubeconfig_path(user_id) or ""

    command_id = str(uuid.uuid4())

    try:
        proposed, explanation = generate_preview(
            user_input=req.user_input,
            cluster=req.cluster,
            namespace=req.namespace,
            llm_provider=settings.llm_provider,
            llm_model=settings.llm_model,
            api_key=settings.api_key,
            api_endpoint=settings.api_endpoint,
            kubeconfig_path=kubeconfig_path,
        )
    except ForbiddenIntentError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not validate_command(proposed):
        return PreviewResponse(
            command_id=command_id,
            proposed_command=proposed,
            explanation="This command violates the security policy and cannot be executed. Only read-only operations (get, describe, logs, events, top) are allowed.",
            blocked=True,
        )

    cmd_store.put(CommandRecord(
        command_id=command_id,
        proposed_command=proposed,
        namespace=req.namespace,
    ))

    return PreviewResponse(
        command_id=command_id,
        proposed_command=proposed,
        explanation=explanation,
    )


@router.post("/execute", response_model=ExecuteResponse)
def execute(req: ExecuteRequest, x_user_id: Optional[str] = Header(None)) -> ExecuteResponse:
    user_id = _get_user_id(x_user_id)
    kubeconfig_path = store.get_kubeconfig_path(user_id) or ""

    if not req.user_confirmation:
        raise HTTPException(status_code=400, detail="User confirmation is required.")

    record = cmd_store.get(req.command_id)
    if record is None:
        raise HTTPException(status_code=404, detail="command_id not found or already executed.")

    command_to_execute = req.command.strip() if req.command else record.proposed_command

    if not validate_command(command_to_execute):
        cmd_store.remove(req.command_id)
        raise HTTPException(
            status_code=400,
            detail=f"Command violates current policy and was rejected: {command_to_execute}",
        )

    output = execute_command(command_to_execute, record.namespace, kubeconfig_path)

    executed_command = command_to_execute
    cmd_store.remove(req.command_id)

    return ExecuteResponse(
        command_id=req.command_id,
        executed_command=executed_command,
        output=output,
    )


@router.post("/execute-direct", response_model=ExecuteResponse)
def execute_direct(req: DirectExecuteRequest, x_user_id: Optional[str] = Header(None)) -> ExecuteResponse:
    user_id = _get_user_id(x_user_id)
    kubeconfig_path = store.get_kubeconfig_path(user_id) or ""

    if not req.user_confirmation:
        raise HTTPException(status_code=400, detail="User confirmation is required.")

    command = req.command.strip()
    if not command:
        raise HTTPException(status_code=400, detail="Command is required.")

    if not validate_command(command):
        raise HTTPException(
            status_code=400,
            detail=f"Command violates security policy and was rejected: {command}. Only read-only operations (get, describe, logs, events, top) are allowed.",
        )

    output = execute_command(command, req.namespace, kubeconfig_path)

    return ExecuteResponse(
        command_id="direct-" + str(uuid.uuid4())[:8],
        executed_command=command,
        output=output,
    )
