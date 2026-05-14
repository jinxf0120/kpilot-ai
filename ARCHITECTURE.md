# ARCHITECTURE.md

## System Overview

This project is a **Browser Extension + Backend Service** system for
operating Kubernetes clusters using natural language.

The browser extension is a **thin, untrusted UI client**.
All Kubernetes access and AI logic MUST run in the backend service.

Local admin permissions are NOT available on user machines.

---

## High-Level Architecture
---

## Browser Extension Responsibilities

The browser extension MUST ONLY:

- Provide UI for:
  - Natural language input
  - Cluster and namespace selection
  - Command preview
  - User confirmation
  - Result display

The extension MUST NOT:

- Access Kubernetes APIs directly
- Execute kubectl locally
- Store or handle kubeconfig
- Perform authorization decisions
- Require admin privileges

The extension is considered **untrusted**.

---

## Backend Responsibilities

The backend service is the **only trusted execution environment**.

It MUST:

- Hold kubeconfig or ServiceAccount credentials
- Enforce RBAC and namespace isolation
- Validate all AI-generated commands
- Execute kubectl or Kubernetes API calls
- Require explicit user confirmation before execution
- Record full audit logs

---

## Command Execution Model (Mandatory)

All Kubernetes commands follow a strict two-phase model:

### Phase 1: Generate (Preview Only)
- AI generates a proposed kubectl command
- The command is NOT executed
- The command is returned to the UI for review

### Phase 2: Confirm & Execute
- The user explicitly confirms execution in the UI
- The backend re-validates the command
- Only then is the command executed

Automatic execution is **strictly forbidden**
