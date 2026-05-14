Implementation rules:

- The browser extension is a thin UI only
- All Kubernetes access is backend-only
- kubectl-ai runs only in the backend
- kubeconfig exists only in the backend

Command execution:
- Commands must NEVER auto-execute
- User confirmation is mandatory
- Backend must re-validate before execution

Allowed kubectl commands:
get, describe, logs, events, top

Do not introduce extra architecture or features.
