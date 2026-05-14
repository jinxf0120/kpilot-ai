import logging
import os
import re
import subprocess
from pathlib import Path
from typing import List, Optional, Tuple

import yaml

from app.config import KUBECTL_AI_BIN

logger = logging.getLogger(__name__)

def _find_repo_root() -> Path:
    p = Path(__file__).resolve().parent
    while p != p.parent:
        if (p / "rules.yaml").exists():
            return p
        p = p.parent
    return Path(__file__).resolve().parent.parent.parent

REPO_ROOT = _find_repo_root()

ALLOWED_COMMANDS: List[str] = []
FORBIDDEN_COMMANDS: List[str] = []


def _load_rules() -> None:
    rules_path = REPO_ROOT / "rules.yaml"
    with open(rules_path, "r") as f:
        rules = yaml.safe_load(f)
    global ALLOWED_COMMANDS, FORBIDDEN_COMMANDS
    ALLOWED_COMMANDS = rules.get("allowed_kubectl_commands", [])
    FORBIDDEN_COMMANDS = rules.get("forbidden_kubectl_commands", [])


_load_rules()


def _extract_kubectl_verb(command: str) -> str:
    kubectl_part = command.split("|")[0].strip()
    parts = kubectl_part.split()
    for i, p in enumerate(parts):
        if p == "kubectl" and i + 1 < len(parts):
            return parts[i + 1]
    return ""


def validate_command(command: str) -> bool:
    verb = _extract_kubectl_verb(command)
    if not verb:
        return False
    if verb in FORBIDDEN_COMMANDS:
        return False
    if verb not in ALLOWED_COMMANDS:
        return False
    return True


_FORBIDDEN_INTENT_KEYWORDS: List[str] = [
    "delete", "remove", "destroy", "kill", "terminate",
    "apply", "patch", "scale", "rollout", "exec", "port-forward",
    "restart", "create", "update", "replace",
    "删除", "移除", "杀掉", "终止", "重启", "创建", "更新", "替换", "扩缩容",
]

_FORBIDDEN_INTENT_PHRASES: List[str] = [
    r"需要删除", r"需要移除", r"想要删除", r"想要移除",
    r"删掉", r"删了", r"移除掉", r"清掉", r"清理掉",
    r"delete\s+completed", r"delete\s+pod", r"remove\s+pod",
    r"clean\s+up", r"clean\s+completed",
]


class ForbiddenIntentError(Exception):
    pass


def _check_forbidden_intent(user_input: str) -> None:
    lower = user_input.lower()
    for kw in _FORBIDDEN_INTENT_KEYWORDS:
        if kw in lower:
            raise ForbiddenIntentError(
                f"Your request involves a forbidden operation ('{kw}'). "
                f"Only read-only operations (get, describe, logs, events, top) are allowed. "
                f"Destructive actions like delete, apply, patch are not permitted."
            )
    for phrase in _FORBIDDEN_INTENT_PHRASES:
        if re.search(phrase, lower):
            raise ForbiddenIntentError(
                f"Your request involves a destructive operation. "
                f"Only read-only operations (get, describe, logs, events, top) are allowed."
            )


_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")


def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


def _parse_kubectl_ai_output(raw: str, stderr: str = "") -> Tuple[str, str]:
    command = ""
    clean = _strip_ansi(raw)
    lines = clean.strip().split("\n")

    patterns = [
        re.compile(r"^\$\s*(kubectl\s+.+)$"),
        re.compile(r"^⚡?\s*Running:\s*(kubectl\s+.+)$", re.IGNORECASE),
        re.compile(r"^⚡?\s*Running:\s*(get|describe|logs|top|events)\s+(.+)$", re.IGNORECASE),
        re.compile(r"^Executing:\s*(kubectl\s+.+)$", re.IGNORECASE),
        re.compile(r"^Executing:\s*(get|describe|logs|top|events)\s+(.+)$", re.IGNORECASE),
        re.compile(r"^Command:\s*(kubectl\s+.+)$", re.IGNORECASE),
        re.compile(r"^(kubectl\s+(?:get|describe|logs|top|events)\s+.+)$"),
    ]

    for line in lines:
        stripped = line.strip()
        for pat in patterns:
            m = pat.match(stripped)
            if m:
                groups = m.groups()
                if len(groups) == 1:
                    command = groups[0].strip()
                else:
                    command = f"kubectl {groups[0]} {groups[1]}".strip()
                if not command.startswith("kubectl"):
                    command = f"kubectl {command}"
                break
        if command:
            break

    if not command:
        code_match = re.search(r"```(?:bash)?\s*\n?(kubectl.*?)\n?```", clean, re.DOTALL)
        if code_match:
            command = code_match.group(1).strip()

    if not command:
        any_kubectl = re.search(r"(kubectl\s+\S+.*)", clean)
        if any_kubectl:
            candidate = any_kubectl.group(1).strip().split("\n")[0]
            if _extract_kubectl_verb(candidate) in ALLOWED_COMMANDS:
                command = candidate

    if not command and stderr:
        clean_stderr = _strip_ansi(stderr)
        cmd_match = re.search(r'commands=\["([^"]+)"\]', clean_stderr)
        if cmd_match:
            raw_cmd = cmd_match.group(1)
            verb = raw_cmd.split()[0] if raw_cmd else ""
            if verb in ALLOWED_COMMANDS:
                command = f"kubectl {raw_cmd}"

    explanation = _infer_explanation(command) if command else ""
    return command, explanation


def _infer_explanation(command: str) -> str:
    verb = _extract_kubectl_verb(command)
    explanations = {
        "get": "Lists resources in the specified namespace.",
        "describe": "Shows detailed information about a specific resource.",
        "logs": "Retrieves logs from a pod.",
        "events": "Lists recent events sorted by timestamp.",
        "top": "Shows resource usage metrics.",
    }
    return explanations.get(verb, "Read-only kubectl command.")


def _call_kubectl_ai(
    user_input: str,
    namespace: str,
    llm_provider: str,
    llm_model: str,
    api_key: str,
    api_endpoint: str,
    kubeconfig_path: str,
) -> Tuple[str, str]:
    env = os.environ.copy()
    env["KUBECONFIG"] = kubeconfig_path

    if api_key:
        if llm_provider == "openai" or llm_provider == "azopenai":
            env["OPENAI_API_KEY"] = api_key
            if api_endpoint:
                env["OPENAI_ENDPOINT"] = api_endpoint
        elif llm_provider == "gemini":
            env["GEMINI_API_KEY"] = api_key
        elif llm_provider == "grok":
            env["XAI_API_KEY"] = api_key

    cmd = [
        KUBECTL_AI_BIN,
        "--quiet",
        "--skip-permissions",
        "--llm-provider", llm_provider,
        "--model", llm_model,
        "--max-iterations", "3",
        "--remove-workdir",
        "--kubeconfig", kubeconfig_path,
    ]

    rules_prefix = (
        "IMPORTANT POLICY CONSTRAINTS (you MUST follow these):\n"
        "- Only generate READ-ONLY kubectl commands: get, describe, logs, events, top\n"
        "- NEVER generate these commands (they are FORBIDDEN): delete, apply, patch, scale, rollout, exec, port-forward\n"
        "- If the user requests a destructive action (delete, remove, apply, patch, scale, etc.), "
        "respond that the operation is not allowed, and suggest a read-only alternative if possible.\n"
        "- Do NOT generate commands that are pre-steps for destructive actions (e.g., listing pods to delete them).\n"
        "- You may use pipes (|) with grep, awk, sort, etc. to filter output.\n"
        "- Use field selectors and sort-by flags for precise results.\n\n"
    )

    query = rules_prefix + user_input
    if namespace:
        query = rules_prefix + f"{user_input} (in namespace: {namespace})"
    else:
        query = rules_prefix + f"{user_input} (across all namespaces, use -A flag)"

    cmd.append(query)

    logger.info("Calling kubectl-ai: %s", " ".join(cmd))

    try:
        result = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            timeout=60,
        )
    except subprocess.TimeoutExpired:
        raise ForbiddenIntentError("kubectl-ai timed out generating command.")
    except FileNotFoundError:
        raise ForbiddenIntentError(f"kubectl-ai binary not found at: {KUBECTL_AI_BIN}")

    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")

    logger.info("kubectl-ai exit=%d stdout=%r stderr=%r", result.returncode, stdout[:500], stderr[:500])

    return stdout, stderr


def generate_preview(
    user_input: str,
    cluster: str,
    namespace: str,
    llm_provider: str = "openai",
    llm_model: str = "gpt-4o",
    api_key: str = "",
    api_endpoint: str = "",
    kubeconfig_path: str = "",
) -> Tuple[str, str]:
    logger.info("generate_preview input=%r cluster=%r namespace=%r", user_input, cluster, namespace)
    _check_forbidden_intent(user_input)
    stdout, stderr = _call_kubectl_ai(
        user_input=user_input,
        namespace=namespace,
        llm_provider=llm_provider,
        llm_model=llm_model,
        api_key=api_key,
        api_endpoint=api_endpoint,
        kubeconfig_path=kubeconfig_path,
    )
    command, explanation = _parse_kubectl_ai_output(stdout, stderr)
    logger.info("parsed command=%r explanation=%r", command, explanation)
    if not command:
        raise ForbiddenIntentError("kubectl-ai did not generate a valid kubectl command.")
    return command, explanation
