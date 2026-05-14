const API_BASE = KPilotConfig.API_BASE;

const $ = (id) => document.getElementById(id);

const clusterSelect = $("cluster");
const namespaceSelect = $("namespace");
const userInput = $("user-input");
const previewBtn = $("preview-btn");
const previewArea = $("preview-area");
const proposedCommand = $("proposed-command");
const explanation = $("explanation");
const confirmArea = $("confirm-area");
const confirmBtn = $("confirm-btn");
const cancelBtn = $("cancel-btn");
const resultArea = $("result-area");
const executedCommand = $("executed-command");
const output = $("output");
const errorArea = $("error-area");
const errorMessage = $("error-message");

const llmProvider = $("llm-provider");
const llmModel = $("llm-model");
const apiKey = $("api-key");
const apiEndpoint = $("api-endpoint");
const kubeconfig = $("kubeconfig");
const saveSettingsBtn = $("save-settings-btn");
const clearSettingsBtn = $("clear-settings-btn");
const settingsStatus = $("settings-status");

const directCommand = $("direct-command");
const directExecuteBtn = $("direct-execute-btn");
const reExecBtn = $("re-exec-btn");

let currentCommandId = null;
let lastExecutedCommand = "";
let lastNamespace = "";
let userId = "";

async function ensureUserId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["user_id"], (result) => {
      if (result.user_id) {
        userId = result.user_id;
        resolve(userId);
      } else {
        userId = "user-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
        chrome.storage.local.set({ user_id: userId }, () => resolve(userId));
      }
    });
  });
}

function apiHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-User-ID": userId,
    ...extra,
  };
}

function hideAll() {
  previewArea.classList.add("hidden");
  confirmArea.classList.add("hidden");
  resultArea.classList.add("hidden");
  errorArea.classList.add("hidden");
}

function showQueryForm() {
  $("query-form").classList.remove("hidden");
  $("query-input").classList.remove("hidden");
}

function hideQueryForm() {
  $("query-form").classList.add("hidden");
  $("query-input").classList.add("hidden");
}

function showError(msg) {
  hideAll();
  hideQueryForm();
  errorMessage.textContent = msg;
  errorArea.classList.remove("hidden");
}

function updatePreviewBtn() {
  const clusterOk = clusterSelect.value !== "";
  const inputOk = userInput.value.trim() !== "";
  previewBtn.disabled = !(clusterOk && inputOk);
}

async function loadClusters() {
  try {
    const resp = await fetch(`${API_BASE}/clusters`, { headers: apiHeaders() });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    clusterSelect.innerHTML = '<option value="">-- Select cluster --</option>';
    for (const c of data.clusters) {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      clusterSelect.appendChild(opt);
    }
  } catch (e) {
    showError("Failed to load clusters: " + e.message);
  }
}

async function loadNamespaces(cluster) {
  try {
    const resp = await fetch(`${API_BASE}/namespaces?cluster=${encodeURIComponent(cluster)}`, { headers: apiHeaders() });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    namespaceSelect.innerHTML = '<option value="">-- All namespaces --</option>';
    for (const ns of data.namespaces) {
      const opt = document.createElement("option");
      opt.value = ns.name;
      opt.textContent = ns.name;
      namespaceSelect.appendChild(opt);
    }
    namespaceSelect.disabled = false;
  } catch (e) {
    showError("Failed to load namespaces: " + e.message);
  }
}

async function loadSettings() {
  try {
    const resp = await fetch(`${API_BASE}/settings`, { headers: apiHeaders() });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.llm_provider) llmProvider.value = data.llm_provider;
    if (data.llm_model) llmModel.value = data.llm_model;
    if (data.api_endpoint) apiEndpoint.value = data.api_endpoint;
    apiKey.value = "";
    kubeconfig.value = "";
    if (data.api_key_set) {
      apiKey.placeholder = "●●●●●●●● (already set)";
      $("api-key-status").textContent = "✓ Configured";
      $("api-key-status").className = "field-status configured";
    } else {
      apiKey.placeholder = "Your API key";
      $("api-key-status").textContent = "Not set";
      $("api-key-status").className = "field-status not-configured";
    }
    if (data.kubeconfig_set) {
      kubeconfig.placeholder = "(already set - paste to overwrite)";
      $("kubeconfig-status").textContent = "✓ Configured";
      $("kubeconfig-status").className = "field-status configured";
    } else {
      kubeconfig.placeholder = "Paste your kubeconfig YAML here...";
      $("kubeconfig-status").textContent = "Not set";
      $("kubeconfig-status").className = "field-status not-configured";
    }
  } catch (e) {}
}

async function saveSettings() {
  const body = {
    llm_provider: llmProvider.value,
    llm_model: llmModel.value,
    api_key: apiKey.value,
    api_endpoint: apiEndpoint.value,
    kubeconfig: kubeconfig.value,
  };
  console.log("saveSettings userId=", userId, "headers=", apiHeaders());
  try {
    const resp = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    settingsStatus.textContent = "Settings saved!";
    settingsStatus.className = "status-ok";
    settingsStatus.classList.remove("hidden");
    apiKey.value = "";
    kubeconfig.value = "";
    loadSettings();
    loadClusters();
  } catch (e) {
    settingsStatus.textContent = "Failed: " + e.message;
    settingsStatus.className = "status-error";
  }
}

async function clearSettings() {
  if (!confirm("Clear all settings? This will remove your API key and kubeconfig.")) return;
  try {
    const resp = await fetch(`${API_BASE}/settings`, {
      method: "DELETE",
      headers: apiHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    llmProvider.value = "openai";
    llmModel.value = "";
    apiKey.value = "";
    apiKey.placeholder = "";
    apiEndpoint.value = "";
    kubeconfig.value = "";
    kubeconfig.placeholder = "Paste your kubeconfig YAML here...";
    settingsStatus.textContent = "Settings cleared!";
    settingsStatus.className = "status-ok";
    clusterSelect.innerHTML = '<option value="">-- Select cluster --</option>';
    namespaceSelect.innerHTML = '<option value="">-- All namespaces --</option>';
    namespaceSelect.disabled = true;
  } catch (e) {
    settingsStatus.textContent = "Failed: " + e.message;
    settingsStatus.className = "status-error";
  }
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.add("hidden"));
    $("tab-" + btn.dataset.tab).classList.remove("hidden");
  });
});

clusterSelect.addEventListener("change", () => {
  namespaceSelect.innerHTML = '<option value="">-- Select namespace --</option>';
  namespaceSelect.disabled = true;
  if (clusterSelect.value) {
    loadNamespaces(clusterSelect.value);
  }
  updatePreviewBtn();
});

namespaceSelect.addEventListener("change", updatePreviewBtn);
userInput.addEventListener("input", updatePreviewBtn);

directCommand.addEventListener("input", () => {
  directExecuteBtn.disabled = !directCommand.value.trim() || !clusterSelect.value;
});

clusterSelect.addEventListener("change", () => {
  directExecuteBtn.disabled = !directCommand.value.trim() || !clusterSelect.value;
});

directExecuteBtn.addEventListener("click", async () => {
  const cmd = directCommand.value.trim();
  if (!cmd || !clusterSelect.value) return;
  const ns = namespaceSelect.value;
  hideAll();
  hideQueryForm();
  directExecuteBtn.disabled = true;
  directExecuteBtn.textContent = "Running...";
  try {
    const resp = await fetch(`${API_BASE}/command/execute-direct`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        command: cmd,
        namespace: ns,
        user_confirmation: true,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      errorMessage.textContent = data.detail || `Execute failed (HTTP ${resp.status})`;
      errorArea.classList.remove("hidden");
    } else {
      executedCommand.textContent = data.executed_command;
      output.textContent = data.output;
      lastExecutedCommand = data.executed_command;
      lastNamespace = ns;
      resultArea.classList.remove("hidden");
    }
  } catch (e) {
    errorMessage.textContent = "Request failed: " + e.message;
    errorArea.classList.remove("hidden");
  } finally {
    directExecuteBtn.disabled = false;
    directExecuteBtn.textContent = "Run Command";
  }
});

previewBtn.addEventListener("click", async () => {
  hideAll();
  const body = {
    user_input: userInput.value.trim(),
    cluster: clusterSelect.value,
    namespace: namespaceSelect.value,
  };
  previewBtn.disabled = true;
  previewBtn.textContent = "Generating...";
  previewBtn.classList.add("loading");
  proposedCommand.readOnly = false;
  proposedCommand.classList.remove("blocked");
  try {
    const resp = await fetch(`${API_BASE}/command/preview`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) {
      showError(data.detail || `Preview failed (HTTP ${resp.status})`);
      return;
    }
    currentCommandId = data.command_id;
    proposedCommand.value = data.proposed_command;
    explanation.textContent = data.explanation;
    if (data.blocked) {
      proposedCommand.readOnly = true;
      proposedCommand.classList.add("blocked");
      $("cmd-edit-hint").classList.add("hidden");
      $("policy-warning").classList.remove("hidden");
      confirmBtn.disabled = true;
    } else {
      proposedCommand.readOnly = false;
      proposedCommand.classList.remove("blocked");
      $("cmd-edit-hint").classList.remove("hidden");
      $("policy-warning").classList.add("hidden");
      confirmBtn.disabled = false;
    }
    previewArea.classList.remove("hidden");
    confirmArea.classList.remove("hidden");
  } catch (e) {
    showError("Preview request failed: " + e.message);
  } finally {
    previewBtn.textContent = "Generate / Preview";
    previewBtn.classList.remove("loading");
    updatePreviewBtn();
  }
});

confirmBtn.addEventListener("click", async () => {
  if (!currentCommandId) return;
  hideAll();
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Executing...";
  confirmBtn.classList.add("loading");
  cancelBtn.disabled = true;
  try {
    const resp = await fetch(`${API_BASE}/command/execute`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        command_id: currentCommandId,
        user_confirmation: true,
        command: proposedCommand.value,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      showError(data.detail || `Execute failed (HTTP ${resp.status})`);
      return;
    }
    executedCommand.textContent = data.executed_command;
    output.textContent = data.output;
    lastExecutedCommand = data.executed_command;
    lastNamespace = namespaceSelect.value;
    hideQueryForm();
    resultArea.classList.remove("hidden");
    currentCommandId = null;
  } catch (e) {
    showError("Execute request failed: " + e.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Execute";
    confirmBtn.classList.remove("loading");
    cancelBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", () => {
  currentCommandId = null;
  hideAll();
  showQueryForm();
});

$("new-query-btn").addEventListener("click", () => {
  hideAll();
  userInput.value = "";
  showQueryForm();
  updatePreviewBtn();
});

reExecBtn.addEventListener("click", async () => {
  if (!lastExecutedCommand) return;
  reExecBtn.disabled = true;
  reExecBtn.textContent = "Running...";
  try {
    const resp = await fetch(`${API_BASE}/command/execute-direct`, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify({
        command: lastExecutedCommand,
        namespace: lastNamespace,
        user_confirmation: true,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      errorMessage.textContent = data.detail || `Re-execute failed (HTTP ${resp.status})`;
      hideAll();
      errorArea.classList.remove("hidden");
    } else {
      executedCommand.textContent = data.executed_command;
      output.textContent = data.output;
    }
  } catch (e) {
    errorMessage.textContent = "Re-execute failed: " + e.message;
    hideAll();
    errorArea.classList.remove("hidden");
  } finally {
    reExecBtn.disabled = false;
    reExecBtn.textContent = "Re-execute";
  }
});

$("error-back-btn").addEventListener("click", () => {
  hideAll();
  showQueryForm();
});

saveSettingsBtn.addEventListener("click", saveSettings);
clearSettingsBtn.addEventListener("click", clearSettings);

$("fullscreen-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("fullscreen.html") });
});

document.addEventListener("DOMContentLoaded", async () => {
  await ensureUserId();
  loadSettings();
  loadClusters();
});
