# AGENTS.md

## Repo Purpose

Specification and step-by-step implementation guide for a **Browser Extension + Backend Service** that operates Kubernetes clusters via natural language. No application code exists yet — the repo contains design docs, prompts, and implementation steps.

## Key Files (Sources of Truth)

| File | Role |
|---|---|
| `ARCHITECTURE.md` | System architecture and trust boundaries |
| `rules.yaml` | Machine-readable policy (allowed/forbidden commands, execution policy) |
| `API_CONTRACT.md` | API contract and prompt references |
| `PROMPTS/system.md` | System prompt for the AI assistant |
| `PROMPTS/developer.md` | Implementation constraints for the AI assistant |
| `PROMPTS/runtime.md` | Runtime prompt template (inject `{user_input}`, `{cluster}`, `{namespace}`) |
| `step/step1.md` → `step3.md` | Implementation steps, must be done in order |

## Implementation Order

Steps are sequential and **must not be skipped or reordered**:

1. **Step 1** — Backend service scaffold + `POST /api/command/preview`
2. **Step 2** — Preview logic: load `PROMPTS/runtime.md`, inject context, generate command
3. **Step 3** — `POST /api/command/execute`: re-validate against `rules.yaml`, require confirmation

Follow `start.md` as the entry point. Do not implement features outside the current step.

## Critical Architecture Constraints (Non-Negotiable)

Violating any of these is a security issue, not a style preference:

- **Browser extension is thin, untrusted UI only.** It must never access Kubernetes APIs, execute kubectl, or handle kubeconfig.
- **All Kubernetes access is backend-only.** kubectl-ai runs only in the backend.
- **Two-phase execution model mandatory:**
  1. **Preview** — AI generates a command; it is NOT executed
  2. **Confirm & Execute** — User confirms; backend re-validates; only then execute
- **Auto-execution is strictly forbidden.** User confirmation is always required.
- **Only read-only kubectl commands allowed:** `get`, `describe`, `logs`, `events`, `top`
- **Forbidden commands:** `delete`, `apply`, `patch`, `scale`, `rollout`, `exec`, `port-forward`
- **kubeconfig exists only in the backend.** Never expose to client or AI.

## API Endpoints

- `POST /api/command/preview` — Generate a proposed kubectl command (no execution)
- `POST /api/command/execute` — Execute a confirmed command (requires `command_id` + `user_confirmation: true`)

Do not create additional endpoints or change request/response fields beyond what `API_CONTRACT.md` specifies.

## Conventions

- Cross-file references (`ARCHITECTURE.md`, `AGENTS.md`, `RULES.md` in `API_CONTRACT.md` and `start.md`) mean these docs are binding — treat them as requirements, not suggestions.
- `rules.yaml` is the canonical policy source. If prose in docs conflicts with `rules.yaml`, trust `rules.yaml`.
- Do not introduce extra architecture, endpoints, or features not specified in the step files.
