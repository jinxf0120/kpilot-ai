IMAGE ?= kpilot-ai-backend
TAG ?= latest
DOCKER ?= docker
KUBECTL ?= kubectl
HELM ?= helm
NAMESPACE ?= default
RELEASE ?= kpilot-ai
HTTP_PROXY ?=
HTTPS_PROXY ?=
NO_PROXY ?=

PROXY_ARGS := $(if $(HTTPS_PROXY),--build-arg HTTPS_PROXY=$(HTTPS_PROXY)) \
              $(if $(HTTP_PROXY),--build-arg HTTP_PROXY=$(HTTP_PROXY)) \
              $(if $(NO_PROXY),--build-arg NO_PROXY=$(NO_PROXY))

.PHONY: help build build-offline build-semi-offline run dev up down push lint test \
        offline-prep helm-install helm-upgrade helm-uninstall helm-template helm-lint \
        deploy undeploy

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Docker ──────────────────────────────────────────────────────────────

build: ## Build the backend Docker image (online, all deps fetched from internet)
	$(DOCKER) build $(PROXY_ARGS) -t $(IMAGE):$(TAG) .

build-offline: ## Build fully offline (binaries + pip from backend/offline/)
	$(DOCKER) build \
		--build-arg KUBECTL_SOURCE=offline \
		--build-arg KUBECTL_AI_SOURCE=offline \
		--build-arg PIP_SOURCE=offline \
		$(PROXY_ARGS) \
		-t $(IMAGE):$(TAG) .

build-semi-offline: ## Build with offline pip only (kubectl + kubectl-ai from internet)
	$(DOCKER) build \
		--build-arg PIP_SOURCE=offline \
		$(PROXY_ARGS) \
		-t $(IMAGE):$(TAG) .

offline-prep: ## Download binaries and pip packages into backend/offline/ for air-gapped build
	@mkdir -p backend/offline/pip
	@echo "==> Downloading kubectl..."
	curl -L -o backend/offline/kubectl "https://dl.k8s.io/release/v1.32.0/bin/linux/amd64/kubectl"
	@echo "==> Downloading kubectl-ai..."
	curl -sSL https://raw.githubusercontent.com/GoogleCloudPlatform/kubectl-ai/main/install.sh | bash
	cp $$(which kubectl-ai) backend/offline/kubectl-ai
	@echo "==> Downloading pip packages (matching python:3.11-slim)..."
	docker run --rm \
		$${HTTP_PROXY:+-e HTTP_PROXY=$$HTTP_PROXY} \
		$${HTTPS_PROXY:+-e HTTPS_PROXY=$$HTTPS_PROXY} \
		-v $$(pwd)/backend/offline/pip:/tmp/pip \
		-v $$(pwd)/backend/requirements.txt:/tmp/requirements.txt \
		python:3.11-slim \
		pip download -r /tmp/requirements.txt -d /tmp/pip
	@echo "==> Done. Run 'make build-offline' to build."

run: build ## Build and run the backend container
	$(DOCKER) run --rm -p 8000:8000 --env-file .env $(IMAGE):$(TAG)

push: ## Push image to a registry (set IMAGE=registry/path/tag)
	$(DOCKER) push $(IMAGE):$(TAG)

# ── Local Development ──────────────────────────────────────────────────

dev: ## Run backend locally with uvicorn (no Docker)
	cd backend && pip install -q -r requirements.txt && \
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# ── Docker Compose ─────────────────────────────────────────────────────

up: ## Start all services with docker-compose
	$(DOCKER) compose up -d

down: ## Stop and remove all docker-compose services
	$(DOCKER) compose down

logs: ## Tail docker-compose logs
	$(DOCKER) compose logs -f

# ── Helm ───────────────────────────────────────────────────────────────

helm-lint: ## Lint the Helm chart
	$(HELM) lint helm/kpilot-ai

helm-template: ## Render Helm templates locally
	$(HELM) template $(RELEASE) helm/kpilot-ai

helm-install: build ## Install the Helm chart (requires image in cluster registry)
	$(HELM) install $(RELEASE) helm/kpilot-ai \
		--namespace $(NAMESPACE) \
		--create-namespace

helm-upgrade: ## Upgrade the Helm release
	$(HELM) upgrade $(RELEASE) helm/kpilot-ai \
		--namespace $(NAMESPACE)

helm-uninstall: ## Uninstall the Helm release
	$(HELM) uninstall $(RELEASE) --namespace $(NAMESPACE)

deploy: ## Apply manual k8s manifests from deploy/
	$(KUBECTL) apply -f deploy/namespace.yaml
	$(KUBECTL) apply -f deploy/secret.yaml
	$(KUBECTL) apply -f deploy/pvc.yaml
	$(KUBECTL) apply -f deploy/deployment.yaml
	$(KUBECTL) apply -f deploy/service.yaml
	$(KUBECTL) apply -f deploy/ingress.yaml

undeploy: ## Delete manual k8s deployment
	$(KUBECTL) delete -f deploy/ingress.yaml --ignore-not-found
	$(KUBECTL) delete -f deploy/service.yaml --ignore-not-found
	$(KUBECTL) delete -f deploy/deployment.yaml --ignore-not-found
	$(KUBECTL) delete -f deploy/pvc.yaml --ignore-not-found
	$(KUBECTL) delete -f deploy/secret.yaml --ignore-not-found
	$(KUBECTL) delete -f deploy/namespace.yaml --ignore-not-found

# ── Quality ────────────────────────────────────────────────────────────

lint: ## Run Python linting
	cd backend && python -m flake8 app/ --max-line-length=120 || true

test: ## Run tests
	cd backend && python -m pytest tests/ -v || true
