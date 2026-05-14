ARG KUBECTL_SOURCE=offline
ARG KUBECTL_AI_SOURCE=offline
ARG PIP_SOURCE=offline
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

FROM python:3.11-slim AS base

ARG KUBECTL_SOURCE
ARG KUBECTL_AI_SOURCE
ARG PIP_SOURCE
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY

ENV http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    no_proxy=${NO_PROXY}

WORKDIR /app

# ── kubectl ─────────────────────────────────────────────────────────
COPY backend/offline/ /tmp/offline/

RUN if [ "$KUBECTL_SOURCE" = "offline" ]; then \
      cp /tmp/offline/kubectl /usr/local/bin/kubectl && \
      chmod +x /usr/local/bin/kubectl; \
    else \
      apt-get update && \
      apt-get install -y --no-install-recommends curl ca-certificates && \
      curl -LO "https://dl.k8s.io/release/v1.32.0/bin/linux/amd64/kubectl" && \
      chmod +x kubectl && \
      mv kubectl /usr/local/bin/ && \
      apt-get purge -y curl && \
      apt-get autoremove -y && \
      rm -rf /var/lib/apt/lists/*; \
    fi

# ── kubectl-ai ──────────────────────────────────────────────────────
RUN if [ "$KUBECTL_AI_SOURCE" = "offline" ]; then \
      cp /tmp/offline/kubectl-ai /usr/local/bin/kubectl-ai && \
      chmod +x /usr/local/bin/kubectl-ai; \
    else \
      apt-get update && \
      apt-get install -y --no-install-recommends curl ca-certificates && \
      curl -sSL https://raw.githubusercontent.com/GoogleCloudPlatform/kubectl-ai/main/install.sh | bash && \
      apt-get purge -y curl && \
      apt-get autoremove -y && \
      rm -rf /var/lib/apt/lists/*; \
    fi

# ── Python dependencies ─────────────────────────────────────────────
COPY backend/requirements.txt .
COPY backend/offline/pip /tmp/offline/

RUN if [ "$PIP_SOURCE" = "offline" ]; then \
      pip install --no-cache-dir --no-index --find-links=/tmp/offline/pip -r requirements.txt; \
    else \
      pip install --no-cache-dir -r requirements.txt; \
    fi

# ── Clear build-time proxy (runtime proxy configured via env) ────────
ENV http_proxy="" \
    https_proxy="" \
    no_proxy=""

# ── Application ─────────────────────────────────────────────────────
COPY backend/app/ /app/app/
COPY rules.yaml /app/
COPY PROMPTS/ /app/PROMPTS/

ENV KPILOT_DATA_DIR=/data

VOLUME ["/data"]

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
