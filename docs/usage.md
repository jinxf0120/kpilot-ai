# kpilot-ai User Guide

## Overview

kpilot-ai lets you operate Kubernetes clusters using natural language. Type what you want to know — "show pods in production", "why is my deployment failing?" — and the AI generates the right `kubectl` command for you. Nothing runs without your explicit confirmation.

---

## Quick Start

### Option A: Docker Compose (recommended)

```bash
cp .env.example .env          # edit .env with your API keys and proxy settings
make up                       # or: docker compose up -d
```

The backend will be available at `http://localhost:8000`.

### Option B: Local Development

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Option C: Kubernetes (Helm)

```bash
# Build and push the image to your registry first
make build IMAGE=your-registry/kpilot-ai-backend TAG=v1.0.0
make push IMAGE=your-registry/kpilot-ai-backend TAG=v1.0.0

# Install with Helm
helm install kpilot-ai helm/kpilot-ai \
  --set image.repository=your-registry/kpilot-ai-backend \
  --set image.tag=v1.0.0 \
  --set llm.provider=openai \
  --set llm.model=gpt-4o \
  --set secrets.openaiApiKey=YOUR_KEY \
  --namespace kpilot-ai --create-namespace
```

### Option D: Offline / Air-Gapped

For environments without internet access, pre-download all dependencies and build offline:

```bash
# Step 1: On a machine with internet, prepare offline assets
make offline-prep

# Step 2: Transfer the entire repo (including backend/offline/) to the air-gapped machine

# Step 3: Build fully offline
make build-offline
```

You can also mix online and offline for individual components:

```bash
# Offline pip packages only (kubectl + kubectl-ai still fetched from internet)
make build-semi-offline

# Or use docker build directly with granular control:
docker build \
  --build-arg KUBECTL_SOURCE=offline \
  --build-arg KUBECTL_AI_SOURCE=online \
  --build-arg PIP_SOURCE=offline \
  -t kpilot-ai-backend ./backend
```

**Build arguments:**

| ARG | Values | Default | Description |
|-----|--------|---------|-------------|
| `KUBECTL_SOURCE` | `online`, `offline` | `online` | `offline` reads from `backend/offline/kubectl` |
| `KUBECTL_AI_SOURCE` | `online`, `offline` | `online` | `offline` reads from `backend/offline/kubectl-ai` |
| `PIP_SOURCE` | `online`, `offline` | `online` | `offline` reads from `backend/offline/pip/` |

**Preparing offline assets** (`make offline-prep` downloads):

| Asset | Location | Source |
|-------|----------|--------|
| kubectl binary | `backend/offline/kubectl` | `https://dl.k8s.io/release/v1.32.0/bin/linux/amd64/kubectl` |
| kubectl-ai binary | `backend/offline/kubectl-ai` | Installed via official install script, then copied |
| Python wheels | `backend/offline/pip/` | `pip download -r requirements.txt` |

Verify the service is running at `http://localhost:8000/docs` (or your Ingress URL).

## Browser Extension 
### Before Installing the Browser Extension 
1. Modify API_BASE in `extension/config.js` to the **backend URL**

### Install the Browser Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable **Developer mode**
### Install the Browser Extension

1. Open Chrome/Edge and navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension/` directory
4. The kpilot-ai icon appears in your browser toolbar

### Configure Your Settings

1. Click the kpilot-ai icon in the toolbar
2. Switch to the **Settings** tab
3. Fill in your LLM and cluster configuration (see below)
4. Click **Save Settings**

### Query Your Cluster

1. Switch to the **Query** tab (or open the fullscreen view)
2. Select a **Cluster** and **Namespace**
3. Type your question, e.g. `show pods` or `get events sorted by time`
4. Click **Generate / Preview** — the AI proposes a kubectl command
5. Review the proposed command and explanation
6. Click **Confirm Execution** to run, or **Cancel** to discard

---

## Deployment

### Docker Compose

The easiest way to run kpilot-ai. All dependencies (kubectl, kubectl-ai, Python) are bundled in the container.

1. Copy and edit the environment file:

   ```bash
   cp .env.example .env
   ```

   Key variables in `.env`:

   | Variable | Required | Description |
   |----------|----------|-------------|
   | `LLM_PROVIDER` | Yes | `openai`, `gemini`, `ollama`, `grok`, `bedrock`, `azopenai` |
   | `LLM_MODEL` | Yes | Model name, e.g. `gpt-4o` |
   | `OPENAI_API_KEY` | Provider-dependent | API key for OpenAI / Azure OpenAI |
   | `GEMINI_API_KEY` | Provider-dependent | API key for Gemini |
   | `XAI_API_KEY` | Provider-dependent | API key for Grok |
   | `KUBECONFIG_PATH` | Yes | Path to kubeconfig on the host (mounted read-only) |
   | `HTTP_PROXY` | No | HTTP proxy URL (if behind corporate firewall) |
   | `HTTPS_PROXY` | No | HTTPS proxy URL |
   | `KPILOT_PORT` | No | Host port (default: `8000`) |

2. Start the service:

   ```bash
   docker compose up -d
   # or: make up
   ```

3. View logs:

   ```bash
   docker compose logs -f
   # or: make logs
   ```

4. Stop:

   ```bash
   docker compose down
   # or: make down
   ```

### Docker (standalone)

```bash
# Build
docker build -t kpilot-ai-backend ./backend
# or: make build

# Run
docker run --rm -p 8000:8000 \
  --env-file .env \
  -v ~/.kube/config:/home/appuser/.kube/config:ro \
  kpilot-ai-backend
# or: make run
```

### Kubernetes (Helm)

The Helm chart deploys the backend as a Deployment + Service (+ optional Ingress) in your cluster.

#### Prerequisites

- A running Kubernetes cluster
- `helm` v3+
- The container image pushed to a registry accessible from the cluster

#### Install

```bash
# Build and push image
make build IMAGE=your-registry/kpilot-ai-backend TAG=v1.0.0
make push IMAGE=your-registry/kpilot-ai-backend TAG=v1.0.0

# Install
helm install kpilot-ai helm/kpilot-ai \
  --set image.repository=your-registry/kpilot-ai-backend \
  --set image.tag=v1.0.0 \
  --set llm.provider=openai \
  --set llm.model=gpt-4o \
  --set secrets.openaiApiKey=YOUR_KEY \
  --namespace kpilot-ai --create-namespace
# or: make helm-install
```

#### Kubeconfig in Cluster

When running inside the cluster, the backend can use a ServiceAccount instead of a kubeconfig file. To use an explicit kubeconfig stored as a Secret:

```bash
# Create a secret from your kubeconfig
kubectl create secret generic my-kubeconfig \
  --from-file=kubeconfig=$HOME/.kube/config \
  -n kpilot-ai

# Install with kubeconfig reference
helm install kpilot-ai helm/kpilot-ai \
  --set kubeconfig.enabled=true \
  --set kubeconfig.secretName=my-kubeconfig \
  --set kubeconfig.secretKey=kubeconfig \
  --namespace kpilot-ai
```

#### Expose via Ingress

```bash
helm install kpilot-ai helm/kpilot-ai \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set 'ingress.hosts[0].host=kpilot-ai.example.com' \
  --set 'ingress.hosts[0].paths[0].path=/' \
  --set 'ingress.hosts[0].paths[0].pathType=Prefix' \
  --namespace kpilot-ai
```

#### Configuration Reference

| Helm Value | Default | Description |
|------------|---------|-------------|
| `replicaCount` | `1` | Number of backend replicas |
| `image.repository` | `kpilot-ai-backend` | Container image repository |
| `image.tag` | `latest` | Container image tag |
| `image.pullPolicy` | `IfNotPresent` | Image pull policy |
| `service.type` | `ClusterIP` | Service type |
| `service.port` | `8000` | Service port |
| `ingress.enabled` | `false` | Enable Ingress |
| `llm.provider` | `openai` | LLM provider |
| `llm.model` | `gpt-4o` | LLM model name |
| `secrets.openaiApiKey` | `""` | OpenAI API key |
| `secrets.openaiEndpoint` | `""` | OpenAI custom endpoint |
| `secrets.geminiApiKey` | `""` | Gemini API key |
| `secrets.xaiApiKey` | `""` | Grok API key |
| `kubeconfig.enabled` | `false` | Mount kubeconfig from Secret |
| `kubeconfig.secretName` | `""` | Secret containing kubeconfig |
| `kubeconfig.secretKey` | `kubeconfig` | Key in the Secret |
| `proxy.httpProxy` | `""` | HTTP proxy |
| `proxy.httpsProxy` | `""` | HTTPS proxy |
| `proxy.noProxy` | `""` | No-proxy list |
| `resources.limits.cpu` | `500m` | CPU limit |
| `resources.limits.memory` | `512Mi` | Memory limit |
| `resources.requests.cpu` | `100m` | CPU request |
| `resources.requests.memory` | `128Mi` | Memory request |
| `autoscaling.enabled` | `false` | Enable HPA |
| `extraEnv` | `[]` | Additional environment variables |

#### Upgrade / Uninstall

```bash
# Upgrade (e.g. after changing values)
helm upgrade kpilot-ai helm/kpilot-ai --namespace kpilot-ai
# or: make helm-upgrade

# Uninstall
helm uninstall kpilot-ai --namespace kpilot-ai
# or: make helm-uninstall
```

### Makefile Quick Reference

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make build` | Build the backend Docker image |
| `make run` | Build and run the backend container |
| `make up` | Start services with docker-compose |
| `make down` | Stop docker-compose services |
| `make logs` | Tail docker-compose logs |
| `make dev` | Run backend locally without Docker |
| `make helm-lint` | Lint the Helm chart |
| `make helm-template` | Render Helm templates locally |
| `make helm-install` | Install the Helm chart |
| `make helm-upgrade` | Upgrade the Helm release |
| `make helm-uninstall` | Uninstall the Helm release |
| `make lint` | Run Python linting |
| `make test` | Run tests |

---

## Settings Configuration

### LLM Configuration

| Field | Description |
|-------|-------------|
| **Provider** | LLM provider: OpenAI, Gemini, Ollama, Grok, Bedrock, or Azure OpenAI |
| **Model** | Model name, e.g. `gpt-4o`, `gemini-2.5-pro` |
| **API Key** | Your API key for the selected provider |
| **API Endpoint** | *(optional)* Custom endpoint URL, e.g. for self-hosted or proxy setups |

Provider-to-environment mapping (handled automatically by the backend):

| Provider | Environment Variable |
|----------|---------------------|
| OpenAI / Azure OpenAI | `OPENAI_API_KEY` (+ `OPENAI_ENDPOINT` if custom) |
| Gemini | `GEMINI_API_KEY` |
| Grok | `XAI_API_KEY` |

### Kubernetes Configuration

| Field | Description |
|-------|-------------|
| **Kubeconfig** | Paste the full content of your kubeconfig YAML file |

The kubeconfig is stored server-side only and never sent to the browser or exposed to the AI.

### Managing Settings

- **Save** — Click **Save Settings** to persist your configuration. Empty API Key / Kubeconfig fields preserve existing values, so you only need to fill in fields you want to change.
- **Clear** — Click **Clear Settings** and confirm to remove all stored data (API keys, kubeconfig, LLM config). Backend temp files are also deleted.

---

## Using the Fullscreen View

The fullscreen page provides a richer interface with a sidebar for input and a main area for scrollable result history.

1. Click the fullscreen button (&#x26F6;) in the popup, or open `fullscreen.html` directly
2. The left sidebar contains: cluster/namespace selectors, query input, preview, and confirm/cancel buttons
3. The right main area shows result cards — newest on top, with full scrollable history
4. Click the gear icon (&#9881;) in the sidebar header to open the Settings modal
5. Toggle dark/light theme with the sun/moon button

---

## API Reference

All endpoints require the `X-User-ID` header for multi-tenant isolation. The browser extension generates and manages this ID automatically.

### Settings

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Get current configuration (sensitive fields masked) |
| `PUT` | `/api/settings` | Save configuration (merge — empty fields preserve existing) |
| `DELETE` | `/api/settings` | Clear all configuration and temp files |

### Cluster Discovery

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/clusters` | List available clusters from kubeconfig |
| `GET` | `/api/namespaces?cluster=<name>` | List namespaces in a cluster |

### Command Execution

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/command/preview` | Generate a proposed kubectl command (no execution) |
| `POST` | `/api/command/execute` | Execute a confirmed command |

#### POST /api/command/preview

Request:

```json
{
  "user_input": "show pods in default namespace",
  "cluster": "my-cluster",
  "namespace": "default"
}
```

Response:

```json
{
  "command_id": "a1b2c3d4-...",
  "proposed_command": "kubectl get pods -n default",
  "explanation": "Lists resources in the specified namespace."
}
```

#### POST /api/command/execute

Request:

```json
{
  "command_id": "a1b2c3d4-...",
  "user_confirmation": true
}
```

Response:

```json
{
  "command_id": "a1b2c3d4-...",
  "executed_command": "kubectl get pods -n default",
  "output": "NAME                     READY   STATUS    RESTARTS   AGE\nmy-app-abc123            1/1     Running   0          5d\n..."
}
```

---

## Security Model

### Two-Phase Execution

kpilot-ai enforces a strict **Preview → Confirm → Execute** flow. No command is ever executed automatically.

1. **Preview** — The AI generates a proposed kubectl command. The command is **not** executed.
2. **Confirm** — The user must explicitly click **Confirm Execution**.
3. **Execute** — The backend re-validates the command against the policy before running it.

### Allowed Commands (Read-Only Only)

| Command | Description |
|---------|-------------|
| `get` | List resources |
| `describe` | Show detailed resource info |
| `logs` | Retrieve pod logs |
| `events` | List cluster events |
| `top` | Show resource usage metrics |

### Forbidden Commands

The following commands are **blocked** by policy and will never be generated or executed:

`delete`, `apply`, `patch`, `scale`, `rollout`, `exec`, `port-forward`

### Data Protection

- **Kubeconfig** — Stored only in the backend filesystem, never sent to the browser or AI
- **API Keys** — Stored in backend memory only, never returned in API responses
- **User Isolation** — Each user's settings and credentials are fully isolated by `X-User-ID`
- **Policy Enforcement** — `rules.yaml` is the canonical policy source; the backend validates both at preview and execution time

---

## Connecting to a Remote Backend

By default, the extension connects to `http://localhost:8000/api`. To use a remote backend:

1. Edit `API_BASE` in `extension/popup.js` and `extension/fullscreen.js`:

   ```js
   const API_BASE = "http://your-server:8000/api";
   ```

2. Add the host to `extension/manifest.json` under `host_permissions`:

   ```json
   "host_permissions": [
     "http://your-server:8000/*"
   ]
   ```

3. Reload the extension in `chrome://extensions/`

---

## Multi-Tenancy

kpilot-ai supports multiple users on a shared backend. Each user is identified by a UUID stored in `chrome.storage.local`. The backend isolates all data per user:

- LLM provider, model, API key, and endpoint
- Kubeconfig content and temp file path
- Command records

Users on different browsers (or different profiles) have completely separate configurations and credentials.

---

## Troubleshooting

| Symptom | Cause | Solution |
|---------|-------|----------|
| "kubectl binary not found" | Backend can't locate kubectl | Ensure `kubectl` is in the system `PATH` accessible to the backend process |
| "kubectl-ai binary not found" | Missing command generation engine | Install kubectl-ai: `curl -sSL https://raw.githubusercontent.com/GoogleCloudPlatform/kubectl-ai/main/install.sh \| bash` |
| 401 error from API | Missing `X-User-ID` header | Ensure the extension has `storage` permission in `manifest.json` |
| Cluster/namespace dropdowns empty | Kubeconfig not configured | Go to Settings and paste your kubeconfig |
| "Generated command violates policy" | AI attempted a forbidden operation | This is expected safety behavior — only read-only commands are allowed |
| Proxy errors reaching LLM API | Backend needs proxy to reach external APIs | Set `HTTP_PROXY`/`HTTPS_PROXY` environment variables before starting the backend |
