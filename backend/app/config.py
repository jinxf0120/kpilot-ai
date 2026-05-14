import os

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "openai")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o")
KUBECTL_AI_BIN = os.getenv("KUBECTL_AI_BIN", "kubectl-ai")
KUBECONFIG_PATH = os.getenv("KUBECONFIG", os.path.expanduser("~/.kube/config"))
