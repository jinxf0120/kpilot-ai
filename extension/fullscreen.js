const API_BASE = KPilotConfig.API_BASE;

const $ = (id) => document.getElementById(id);

const clusterSelect = $("cluster");
const namespaceSelect = $("namespace");
const userInput = $("user-input");
const previewBtn = $("preview-btn");
const previewArea = $("preview-area");
const proposedCommand = $("proposed-command");
const explanationEl = $("explanation");
const confirmBtn = $("confirm-btn");
const cancelBtn = $("cancel-btn");
const sidebarError = $("sidebar-error");
const sidebarErrorMsg = $("sidebar-error-msg");
const resultsList = $("results-list");
const emptyState = $("empty-state");
const themeBtn = $("theme-btn");

const settingsBtn = $("settings-btn");
const settingsOverlay = $("settings-overlay");
const settingsCloseBtn = $("settings-close-btn");
const fsLlmProvider = $("fs-llm-provider");
const fsLlmModel = $("fs-llm-model");
const fsApiKey = $("fs-api-key");
const fsApiEndpoint = $("fs-api-endpoint");
const fsKubeconfig = $("fs-kubeconfig");
const fsSaveBtn = $("fs-save-btn");
const fsClearBtn = $("fs-clear-btn");
const fsSettingsStatus = $("fs-settings-status");

const directCommand = $("direct-command");
const directExecuteBtn = $("direct-execute-btn");

let currentCommandId = null;
let userId = "";

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("k8s-ai-theme", theme);
}

function initTheme() {
  const saved = localStorage.getItem("k8s-ai-theme");
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
}

themeBtn.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

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

function updatePreviewBtn() {
  const clusterOk = clusterSelect.value !== "";
  const inputOk = userInput.value.trim() !== "";
  previewBtn.disabled = !(clusterOk && inputOk);
}

function hidePreview() {
  previewArea.classList.add("hidden");
  sidebarError.classList.add("hidden");
}

function showSidebarError(msg) {
  sidebarErrorMsg.textContent = msg;
  sidebarError.classList.remove("hidden");
}

function addResultCard(query, namespace, command, outputText, isError) {
  emptyState.classList.add("hidden");
  const card = document.createElement("div");
  card.className = "result-card" + (isError ? " error-card" : "");

  const now = new Date();
  const timeStr = now.getHours().toString().padStart(2, "0") + ":" +
    now.getMinutes().toString().padStart(2, "0") + ":" +
    now.getSeconds().toString().padStart(2, "0");

  const nsTag = namespace ? '<span class="result-ns">' + namespace + "</span>" : "";

  const escapedCmd = command
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const escapedOutput = outputText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const label = isError ? "Error" : "Output";

  const reExecBtn = (!isError && command)
    ? '<button class="re-exec-btn" data-cmd="' + escapedCmd + '" data-ns="' + namespace + '">Re-execute</button>'
    : "";

  card.innerHTML =
    '<div class="result-meta">' +
      '<span class="result-query">' + query.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") + "</span>" +
      nsTag +
      '<span class="result-time">' + timeStr + "</span>" +
    "</div>" +
    (command ? '<div class="result-cmd"><div class="result-cmd-label">Command</div><code>' + escapedCmd + "</code>" + reExecBtn + "</div>" : "") +
    '<div class="result-output-label">' + label + "</div>" +
    "<pre>" + escapedOutput + "</pre>";

  resultsList.appendChild(card);

  const reBtn = card.querySelector(".re-exec-btn");
  if (reBtn) {
    reBtn.addEventListener("click", async () => {
      const cmd = reBtn.getAttribute("data-cmd");
      const ns = reBtn.getAttribute("data-ns") || namespaceSelect.value;
      reBtn.disabled = true;
      reBtn.textContent = "Running...";
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
          addResultCard("Re-execute: " + cmd, ns, cmd, data.detail || `Execute failed (HTTP ${resp.status})`, true);
        } else {
          addResultCard("Re-execute: " + cmd, ns, data.executed_command, data.output, false);
        }
      } catch (e) {
        addResultCard("Re-execute: " + cmd, ns, cmd, "Request failed: " + e.message, true);
      } finally {
        reBtn.disabled = false;
        reBtn.textContent = "Re-execute";
      }
    });
  }

  requestAnimationFrame(() => {
    card.scrollIntoView({ behavior: "smooth", block: "end" });
  });
}

async function loadClusters() {
  try {
    const resp = await fetch(`${API_BASE}/clusters`, { headers: apiHeaders() });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    clusterSelect.innerHTML = '<option value="">-- Select --</option>';
    for (const c of data.clusters) {
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      clusterSelect.appendChild(opt);
    }
  } catch (e) {
    showSidebarError("Failed to load clusters: " + e.message);
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
    showSidebarError("Failed to load namespaces: " + e.message);
  }
}

clusterSelect.addEventListener("change", () => {
  namespaceSelect.innerHTML = '<option value="">-- All namespaces --</option>';
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
  directExecuteBtn.disabled = true;
  directExecuteBtn.textContent = "Running...";
  directExecuteBtn.classList.add("loading");
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
      addResultCard(cmd, ns, cmd, data.detail || `Execute failed (HTTP ${resp.status})`, true);
    } else {
      addResultCard(cmd, ns, data.executed_command, data.output, false);
      directCommand.value = "";
    }
  } catch (e) {
    addResultCard(cmd, ns, cmd, "Request failed: " + e.message, true);
  } finally {
    directExecuteBtn.disabled = false;
    directExecuteBtn.textContent = "Run Command";
    directExecuteBtn.classList.remove("loading");
  }
});

previewBtn.addEventListener("click", async () => {
  hidePreview();
  const query = userInput.value.trim();
  const body = {
    user_input: query,
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
      showSidebarError(data.detail || `Preview failed (HTTP ${resp.status})`);
      return;
    }
    currentCommandId = data.command_id;
    proposedCommand.value = data.proposed_command;
    explanationEl.textContent = data.explanation;
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
  } catch (e) {
    showSidebarError("Preview request failed: " + e.message);
  } finally {
    previewBtn.textContent = "Generate / Preview";
    previewBtn.classList.remove("loading");
    updatePreviewBtn();
  }
});

confirmBtn.addEventListener("click", async () => {
  if (!currentCommandId) return;
  const query = userInput.value.trim();
  const ns = namespaceSelect.value;
  const cmd = proposedCommand.value;
  hidePreview();
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
        command: cmd,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      addResultCard(query, ns, cmd, data.detail || `Execute failed (HTTP ${resp.status})`, true);
      currentCommandId = null;
      return;
    }
    addResultCard(query, ns, data.executed_command, data.output, false);
    currentCommandId = null;
    userInput.value = "";
    updatePreviewBtn();
  } catch (e) {
    addResultCard(query, ns, cmd, "Execute request failed: " + e.message, true);
    currentCommandId = null;
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = "Execute";
    confirmBtn.classList.remove("loading");
    cancelBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", () => {
  currentCommandId = null;
  hidePreview();
});

settingsBtn.addEventListener("click", () => {
  settingsOverlay.classList.remove("hidden");
  loadFsSettings();
});

settingsCloseBtn.addEventListener("click", () => {
  settingsOverlay.classList.add("hidden");
});

settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) {
    settingsOverlay.classList.add("hidden");
  }
});

async function loadFsSettings() {
  fsApiKey.value = "";
  fsKubeconfig.value = "";
  try {
    const resp = await fetch(`${API_BASE}/settings`, { headers: apiHeaders() });
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.llm_provider) fsLlmProvider.value = data.llm_provider;
    if (data.llm_model) fsLlmModel.value = data.llm_model;
    if (data.api_endpoint) fsApiEndpoint.value = data.api_endpoint;
    if (data.api_key_set) {
      fsApiKey.placeholder = "●●●●●●●● (already set)";
      $("fs-api-key-status").textContent = "Configured";
      $("fs-api-key-status").className = "field-status configured";
    } else {
      fsApiKey.placeholder = "Your API key";
      $("fs-api-key-status").textContent = "Not set";
      $("fs-api-key-status").className = "field-status not-configured";
    }
    if (data.kubeconfig_set) {
      fsKubeconfig.placeholder = "(already set - paste to overwrite)";
      $("fs-kubeconfig-status").textContent = "Configured";
      $("fs-kubeconfig-status").className = "field-status configured";
    } else {
      fsKubeconfig.placeholder = "Paste your kubeconfig YAML here...";
      $("fs-kubeconfig-status").textContent = "Not set";
      $("fs-kubeconfig-status").className = "field-status not-configured";
    }
  } catch (e) {}
}

fsSaveBtn.addEventListener("click", async () => {
  const body = {
    llm_provider: fsLlmProvider.value,
    llm_model: fsLlmModel.value,
    api_key: fsApiKey.value,
    api_endpoint: fsApiEndpoint.value,
    kubeconfig: fsKubeconfig.value,
  };
  try {
    const resp = await fetch(`${API_BASE}/settings`, {
      method: "PUT",
      headers: apiHeaders(),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    fsSettingsStatus.textContent = "Settings saved!";
    fsSettingsStatus.className = "modal-status status-ok";
    fsSettingsStatus.classList.remove("hidden");
    loadFsSettings();
    loadClusters();
  } catch (e) {
    fsSettingsStatus.textContent = "Failed: " + e.message;
    fsSettingsStatus.className = "modal-status status-error";
    fsSettingsStatus.classList.remove("hidden");
  }
});

fsClearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all settings? This will remove your API key and kubeconfig.")) return;
  try {
    const resp = await fetch(`${API_BASE}/settings`, {
      method: "DELETE",
      headers: apiHeaders(),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    fsLlmProvider.value = "openai";
    fsLlmModel.value = "";
    fsApiKey.value = "";
    fsApiEndpoint.value = "";
    fsKubeconfig.value = "";
    fsSettingsStatus.textContent = "Settings cleared!";
    fsSettingsStatus.className = "modal-status status-ok";
    fsSettingsStatus.classList.remove("hidden");
    loadFsSettings();
    clusterSelect.innerHTML = '<option value="">-- Select --</option>';
    namespaceSelect.innerHTML = '<option value="">-- All namespaces --</option>';
    namespaceSelect.disabled = true;
  } catch (e) {
    fsSettingsStatus.textContent = "Failed: " + e.message;
    fsSettingsStatus.className = "modal-status status-error";
    fsSettingsStatus.classList.remove("hidden");
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  await ensureUserId();
  loadClusters();
});
