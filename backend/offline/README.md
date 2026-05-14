# Offline Deployment Assets

Place pre-downloaded binaries and packages here for air-gapped environments.

## Required Files

```
offline/
├── kubectl              # kubectl binary for linux/amd64
├── kubectl-ai           # kubectl-ai binary for linux/amd64
└── pip/                 # Python wheel files
    ├── fastapi-0.83.0-py3-none-any.whl
    ├── uvicorn-0.16.0-py3-none-any.whl
    ├── pydantic-1.9.2-py3-none-any.whl
    ├── PyYAML-5.4.1-cp311-cp311-linux_x86_64.whl
    ├── kubernetes-35.0.0-py3-none-any.whl
    └── ...               # all transitive dependencies
```

## How to Download

```bash
# kubectl
curl -LO "https://dl.k8s.io/release/v1.32.0/bin/linux/amd64/kubectl"
chmod +x kubectl && mv kubectl backend/offline/

# kubectl-ai
curl -sSL https://raw.githubusercontent.com/GoogleCloudPlatform/kubectl-ai/main/install.sh | bash
cp $(which kubectl-ai) backend/offline/

# Python packages
pip download -r backend/requirements.txt -d backend/offline/pip
```

## Build with Offline Mode

```bash
# Full offline
docker build \
  --build-arg KUBECTL_SOURCE=offline \
  --build-arg KUBECTL_AI_SOURCE=offline \
  --build-arg PIP_SOURCE=offline \
  -t kpilot-ai-backend ./backend

# Partial offline (e.g. only pip is offline)
docker build \
  --build-arg PIP_SOURCE=offline \
  -t kpilot-ai-backend ./backend
```

See Makefile targets: `make build-offline`, `make build-semi-offline`.
