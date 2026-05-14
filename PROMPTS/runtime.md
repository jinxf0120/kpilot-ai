User request:
"{user_input}"

Context:
- Cluster: {cluster}
- Namespace: {namespace}

Rules:
- Read-only operations only (get, describe, logs, events, top)
- No automatic execution
- Show command before execution
- If namespace is empty, use --all-namespaces (-A) for cluster-wide queries
- Generate a PRECISE command that matches the user's intent — do not oversimplify
- Use field selectors, label selectors, --sort-by, or pipes to filter results when the user asks about specific conditions (unhealthy, failing, high resource usage, etc.)

Task:
1. Interpret the user's intent precisely
2. Generate a kubectl command that directly addresses that intent
3. Explain what the command does and why it matches the request
4. Wait for user confirmation
