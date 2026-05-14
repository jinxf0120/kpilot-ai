import logging
import os
import shlex
import subprocess

logger = logging.getLogger(__name__)


def execute_command(command: str, namespace: str, kubeconfig_path: str = "") -> str:
    command = command.strip()
    if not command:
        return "Error: empty command"

    if not command.startswith("kubectl"):
        command = "kubectl " + command

    has_pipe = "|" in command

    has_ns = any(
        p in command
        for p in [" -n ", " --namespace ", " -n=", " --namespace="]
    )

    if not has_ns and namespace:
        if has_pipe:
            kubectl_part, rest = command.split("|", 1)
            kubectl_part = kubectl_part.rstrip() + f" --namespace {namespace}"
            command = kubectl_part + " |" + rest
        else:
            command += f" --namespace {namespace}"

    env = os.environ.copy()
    if kubeconfig_path:
        env["KUBECONFIG"] = kubeconfig_path

    logger.info("Executing: %s", command)

    try:
        result = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=env,
            shell=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired:
        return "Error: command timed out after 30 seconds."

    stdout = result.stdout.decode("utf-8", errors="replace")
    stderr = result.stderr.decode("utf-8", errors="replace")

    if result.returncode != 0 and not stdout:
        return stderr or f"Error: kubectl exited with code {result.returncode}"

    output = stdout
    if stderr:
        output = stdout + "\n" + stderr if stdout else stderr

    return output
