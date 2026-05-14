from pydantic import BaseModel
from typing import Optional


class PreviewRequest(BaseModel):
    user_input: str
    cluster: str
    namespace: str = ""


class PreviewResponse(BaseModel):
    command_id: str
    proposed_command: str
    explanation: str
    blocked: bool = False


class ExecuteRequest(BaseModel):
    command_id: str
    user_confirmation: bool
    command: str = ""


class DirectExecuteRequest(BaseModel):
    command: str
    namespace: str = ""
    user_confirmation: bool


class ExecuteResponse(BaseModel):
    command_id: str
    executed_command: str
    output: str
