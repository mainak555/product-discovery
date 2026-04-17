/**
 * app.js — Minimal client-side helpers for the agent configuration SPA.
 *
 * Handles:
 *   - Adding / removing agent cards dynamically
 *   - Updating the form action URL when creating a new project
 *   - Injecting the Secret Key into HTMX requests
 *   - Toggling human gate controls and iteration limits
 *   - Auto-dismissing toast alerts
 */

document.addEventListener("DOMContentLoaded", function () {
  function getSecretKeyInput() {
    return document.getElementById("global-secret-key");
  }

  function updateSubmitState() {
    var keyInput = getSecretKeyInput();
    var hasSecret = !!(keyInput && keyInput.value.trim());

    document.querySelectorAll(".config-form button[type='submit'], .config-form .js-requires-secret").forEach(function (button) {
      button.disabled = !hasSecret;
      button.title = hasSecret ? "" : "Enter the Secret Key in the header before saving.";
    });

    // Show/hide delete buttons in the sidebar
    document.querySelectorAll(".sidebar__delete").forEach(function (btn) {
      btn.hidden = !hasSecret;
    });
  }

  function syncHumanGateFields() {
    var enabledInput = document.getElementById("human-gate-enabled");
    var fields = document.getElementById("human-gate-fields");
    if (!fields) return;

    var enabled = !!(enabledInput && enabledInput.checked);
    fields.hidden = !enabled;

    fields.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.disabled = !enabled;
    });
  }

  function syncMaxIterationsLimit() {
    var enabledInput = document.getElementById("human-gate-enabled");
    var maxIterationsInput = document.getElementById("max_iterations");
    if (!maxIterationsInput) return;

    var limit = enabledInput && enabledInput.checked ? 100 : 10;
    maxIterationsInput.max = String(limit);

    var currentValue = parseInt(maxIterationsInput.value || "0", 10);
    if (currentValue > limit) {
      maxIterationsInput.value = String(limit);
    }
  }

  function syncTeamTypeFields() {
    var teamTypeSelect = document.getElementById("team_type");
    var selectorFields = document.getElementById("selector-fields");
    if (!teamTypeSelect || !selectorFields) return;

    var isSelector = teamTypeSelect.value === "selector";
    selectorFields.hidden = !isSelector;

    selectorFields.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.disabled = !isSelector;
    });
  }

  function syncFormState() {
    syncHumanGateFields();
    syncMaxIterationsLimit();
    syncTeamTypeFields();
    updateSubmitState();
  }

  document.body.addEventListener("htmx:configRequest", function (e) {
    var keyInput = getSecretKeyInput();
    var secretKey = keyInput ? keyInput.value.trim() : "";
    if (secretKey) {
      e.detail.headers["X-App-Secret-Key"] = secretKey;
    }
  });

  // -----------------------------------------------------------------------
  // Agent card: Add
  // -----------------------------------------------------------------------
  document.body.addEventListener("click", function (e) {
    if (!e.target.matches("#add-agent-btn")) return;

    var container = document.getElementById("agents-container");
    if (!container) return;

    var template = document.getElementById("agent-card-template");
    if (!template) return;

    // Determine next index
    var cards = container.querySelectorAll(".agent-card");
    var nextIdx = cards.length;

    // Clone template content and replace __IDX__ placeholders
    var clone = template.content.cloneNode(true);
    var html = clone.firstElementChild.outerHTML.replace(/__IDX__/g, nextIdx);

    container.insertAdjacentHTML("beforeend", html);
    syncFormState();
  });

  // -----------------------------------------------------------------------
  // Agent card: Remove
  // -----------------------------------------------------------------------
  document.body.addEventListener("click", function (e) {
    if (!e.target.matches(".remove-agent-btn")) return;

    var card = e.target.closest(".agent-card");
    if (!card) return;

    // Don't remove the last agent
    var container = document.getElementById("agents-container");
    if (container && container.querySelectorAll(".agent-card").length <= 1) {
      alert("At least one agent is required.");
      return;
    }

    card.remove();
    reindexAgents();
  });

  // -----------------------------------------------------------------------
  // Re-index agent card field names after removal
  // -----------------------------------------------------------------------
  function reindexAgents() {
    var container = document.getElementById("agents-container");
    if (!container) return;

    var cards = container.querySelectorAll(".agent-card");
    cards.forEach(function (card, idx) {
      card.setAttribute("data-agent-index", idx);

      // Update the agent number label
      var numEl = card.querySelector(".agent-card__number");
      if (numEl) numEl.textContent = "Agent #" + (idx + 1);

      // Update all input/select/textarea name attributes
      card.querySelectorAll("[name]").forEach(function (el) {
        el.name = el.name.replace(/agents\[\d+\]/, "agents[" + idx + "]");
      });
    });
  }

  document.body.addEventListener("input", function (e) {
    if (e.target.id === "global-secret-key") {
      updateSubmitState();
    }
  });

  document.body.addEventListener("change", function (e) {
    if (e.target.id === "human-gate-enabled") {
      syncHumanGateFields();
      syncMaxIterationsLimit();
    }
    if (e.target.id === "team_type") {
      syncTeamTypeFields();
    }
  });

  // -----------------------------------------------------------------------
  // Auto-dismiss toast alerts after 4 seconds
  // -----------------------------------------------------------------------
  document.body.addEventListener("htmx:afterSwap", function () {
    syncFormState();

    var toast = document.getElementById("toast");
    if (toast) {
      setTimeout(function () {
        toast.style.transition = "opacity 0.3s";
        toast.style.opacity = "0";
        setTimeout(function () { toast.remove(); }, 300);
      }, 4000);
    }
  });

  syncFormState();

  // =========================================================================
  // Chat UI — home page interactions
  // =========================================================================

  // -----------------------------------------------------------------------
  // Agent system-prompt modal
  // -----------------------------------------------------------------------
  var agentPromptModal = document.getElementById("agent-prompt-modal");
  var agentModalTitle  = document.getElementById("agent-modal-title");
  var agentModalBody   = document.getElementById("agent-modal-body");
  var agentModalClose  = document.getElementById("agent-modal-close-btn");
  var agentModalOverlay = document.getElementById("agent-modal-overlay");

  function openAgentModal(name, systemPrompt) {
    if (!agentPromptModal) return;
    if (agentModalTitle) agentModalTitle.textContent = name + " — System Prompt";
    if (agentModalBody) {
      agentModalBody.innerHTML =
        (typeof marked !== "undefined")
          ? marked.parse(systemPrompt)
          : "<pre>" + systemPrompt.replace(/</g, "&lt;") + "</pre>";
    }
    agentPromptModal.hidden = false;
  }

  function closeAgentModal() {
    if (agentPromptModal) agentPromptModal.hidden = true;
  }

  if (agentModalClose)  agentModalClose.addEventListener("click", closeAgentModal);
  if (agentModalOverlay) agentModalOverlay.addEventListener("click", closeAgentModal);

  document.body.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (agentPromptModal && !agentPromptModal.hidden) closeAgentModal();
      if (newSessionModal && !newSessionModal.hidden) closeModal();
    }
  });

  document.body.addEventListener("click", function (e) {
    var card = e.target.closest(".project-ctx__agent-card--clickable");
    if (!card) return;
    var name = card.dataset.agentName || "Agent";
    var prompt = card.dataset.systemPrompt || "";
    openAgentModal(name, prompt);
  });

  document.body.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var card = e.target.closest(".project-ctx__agent-card--clickable");
    if (!card) return;
    e.preventDefault();
    var name = card.dataset.agentName || "Agent";
    var prompt = card.dataset.systemPrompt || "";
    openAgentModal(name, prompt);
  });

  var chatMessages = document.getElementById("chat-messages");
  var chatInput = document.getElementById("chat-input");
  var chatSendBtn = document.getElementById("chat-send-btn");
  var chatStopBtn = document.getElementById("chat-stop-btn");
  var chatProjectBtn = document.getElementById("chat-project-btn");
  var activeProjectIdInput = document.getElementById("active-project-id");
  var activeSessionIdInput = document.getElementById("active-session-id");
  var csrfToken = (document.getElementById("csrf-token-value") || {}).value || "";
  var newChatBtn = document.getElementById("new-chat-btn");
  var newSessionModal = document.getElementById("new-session-modal");
  var modalProjectId = document.getElementById("modal-project-id");
  var sessionDescription = document.getElementById("session-description");
  var descCharCount = document.getElementById("desc-char-count");

  // Only wire up when chat elements exist (home page only)
  if (!chatMessages || !chatInput) return;

  // -----------------------------------------------------------------------
  // Auth state: show/hide chat controls based on secret key
  // -----------------------------------------------------------------------
  function updateChatAuthState() {
    var keyInput = getSecretKeyInput();
    var hasSecret = !!(keyInput && keyInput.value.trim());

    if (newChatBtn) newChatBtn.hidden = !hasSecret;

    document.querySelectorAll(".chat-session-item__delete").forEach(function (btn) {
      btn.hidden = !hasSecret;
    });

    if (chatSendBtn) {
      chatSendBtn.disabled = !hasSecret;
      chatSendBtn.title = hasSecret ? "Send" : "Enter the Secret Key to send messages.";
    }
    if (chatInput) {
      chatInput.disabled = !hasSecret;
      chatInput.placeholder = hasSecret ? "Send a message" : "Enter the Secret Key to send messages.";
    }

    // If key is removed while modal is open, close it to prevent submission
    if (!hasSecret && newSessionModal && !newSessionModal.hidden) {
      closeModal();
    }
  }

  // -----------------------------------------------------------------------
  // Modal open / close
  // -----------------------------------------------------------------------
  function openModal() {
    if (!newSessionModal) return;
    if (modalProjectId) modalProjectId.value = activeProjectIdInput ? activeProjectIdInput.value : "";
    if (sessionDescription) { sessionDescription.value = ""; sessionDescription.focus(); }
    if (descCharCount) descCharCount.textContent = "0";
    newSessionModal.hidden = false;
  }

  function closeModal() {
    if (newSessionModal) newSessionModal.hidden = true;
    _pendingTask = null;
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", function () {
      var keyInput = getSecretKeyInput();
      if (!keyInput || !keyInput.value.trim()) {
        return; // button should be hidden; guard against CSS override
      }
      var projectId = activeProjectIdInput ? activeProjectIdInput.value.trim() : "";
      if (!projectId) {
        alert("Select a project first.");
        return;
      }
      openModal();
    });
  }

  var modalCloseBtn = document.getElementById("modal-close-btn");
  var modalCancelBtn = document.getElementById("modal-cancel-btn");
  var modalOverlay = document.getElementById("modal-overlay");

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeModal);
  if (modalOverlay) modalOverlay.addEventListener("click", closeModal);

  // Close modal when HTMX signals chatSessionCreated — handled in the full
  // chatSessionCreated listener below; this stub is intentionally removed.

  // Allow HTMX to swap 4xx error responses into #new-session-form-feedback
  // (by default HTMX 1.x drops non-2xx responses without swapping)
  document.body.addEventListener("htmx:beforeSwap", function (e) {
    if (e.detail.target && e.detail.target.id === "new-session-form-feedback") {
      if (e.detail.xhr.status === 400 || e.detail.xhr.status === 403) {
        e.detail.shouldSwap = true;
        e.detail.isError = false;
      }
    }
  });

  // -----------------------------------------------------------------------
  // Description char counter
  // -----------------------------------------------------------------------
  if (sessionDescription && descCharCount) {
    sessionDescription.addEventListener("input", function () {
      descCharCount.textContent = sessionDescription.value.length;
    });
  }

  // -----------------------------------------------------------------------
  // Auto-resize chat textarea
  // -----------------------------------------------------------------------
  chatInput.addEventListener("input", function () {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + "px";
  });

  // -----------------------------------------------------------------------
  // Send on Enter (Shift+Enter = newline)
  // -----------------------------------------------------------------------
  chatInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (chatSendBtn && !chatSendBtn.disabled) chatSendBtn.click();
    }
  });

  // -----------------------------------------------------------------------
  // SSE run client
  // -----------------------------------------------------------------------

  var _activeReader = null; // ReadableStreamDefaultReader during a run
  var _pendingTask   = null; // task text queued before a session existed

  function setRunningState(running) {
    if (chatInput)   { chatInput.disabled = running; }
    if (chatSendBtn) { chatSendBtn.hidden = running; }
    if (chatStopBtn) { chatStopBtn.hidden = !running; }
  }

  function appendBubble(html) {
    var msgs = document.getElementById("chat-history-msgs");
    if (!msgs) {
      // First message — replace the welcome block
      chatMessages.innerHTML = '<div class="chat-history" id="chat-history-msgs"></div>';
      msgs = document.getElementById("chat-history-msgs");
    }
    msgs.insertAdjacentHTML("beforeend", html);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendHumanBubble(text) {
    var ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    var contentHtml = (typeof marked !== "undefined")
      ? marked.parse(text)
      : "<p>" + text.replace(/</g, "&lt;") + "</p>";
    appendBubble(
      '<div class="chat-bubble chat-bubble--human">'
      + '<div class="chat-bubble__meta">'
      + '<span class="chat-bubble__name">You</span>'
      + '<span class="chat-bubble__time">' + ts + '</span>'
      + '</div>'
      + '<div class="chat-bubble__content">' + contentHtml + '</div>'
      + '</div>'
    );
  }

  function appendStatusBadge(type) {
    var label = type === "completed" ? "✅ Run completed" : "🛑 Run stopped";
    chatMessages.insertAdjacentHTML(
      "beforeend",
      '<div class="chat-status-badge chat-status-badge--' + type + '">' + label + '</div>'
    );
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function appendGatePanel(data) {
    var sessionId = activeSessionIdInput ? activeSessionIdInput.value : "";
    var modeHtml = data.mode === "feedback"
      ? '<textarea class="input input--textarea human-gate-panel__textarea" rows="3" placeholder="Type your feedback for the agents\u2026"></textarea>'
        + '<div class="human-gate-panel__actions">'
        + '<button class="btn btn--primary human-gate-btn human-gate-btn--feedback">\uD83D\uDCE4 Send Feedback</button>'
        + '<button class="btn btn--danger human-gate-btn human-gate-btn--stop">\uD83D\uDED1 Stop</button>'
        + '</div>'
      : '<div class="human-gate-panel__actions">'
        + '<button class="btn btn--success human-gate-btn human-gate-btn--approve">\u2705 Approve &amp; Continue</button>'
        + '<button class="btn btn--danger human-gate-btn human-gate-btn--stop">\uD83D\uDED1 Stop</button>'
        + '</div>';

    chatMessages.insertAdjacentHTML(
      "beforeend",
      '<div class="human-gate-panel" data-session-id="' + sessionId + '">'
      + '<div class="human-gate-panel__prompt">'
      + '\uD83D\uDC64 <strong>' + (data.human_name || "You") + '</strong>'
      + ' \u2014 Round ' + data.round + ' of ' + data.max_rounds + ' complete. What would you like to do?'
      + '</div>'
      + modeHtml
      + '</div>'
    );
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function startRun(task) {
    var sessionId = activeSessionIdInput ? activeSessionIdInput.value.trim() : "";
    if (!sessionId) { return; }

    var keyInput = getSecretKeyInput();
    var secretKey = keyInput ? keyInput.value.trim() : "";
    if (!secretKey) { alert("Enter the Secret Key first."); return; }

    setRunningState(true);

    var body = new URLSearchParams();
    body.append("task", task || "");

    fetch("/chat/sessions/" + sessionId + "/run/", {
      method: "POST",
      headers: {
        "X-App-Secret-Key": secretKey,
        "X-CSRFToken": csrfToken,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }).then(function (response) {
      if (!response.ok) {
        return response.json().then(function (d) { throw new Error(d.error || "Run failed"); });
      }
      var reader = response.body.getReader();
      _activeReader = reader;
      var decoder = new TextDecoder();
      var buffer = "";

      function pump() {
        reader.read().then(function (result) {
          if (result.done) {
            _activeReader = null;
            setRunningState(false);
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var frames = buffer.split("\n\n");
          buffer = frames.pop(); // keep incomplete last frame
          frames.forEach(function (frame) {
            var eventMatch = frame.match(/^event: (\w+)/m);
            var dataMatch  = frame.match(/^data: (.+)/m);
            if (!eventMatch || !dataMatch) return;
            var eventName = eventMatch[1];
            var data;
            try { data = JSON.parse(dataMatch[1]); } catch (e) { return; }
            handleSSEEvent(eventName, data);
          });
          pump();
        }).catch(function () {
          _activeReader = null;
          setRunningState(false);
        });
      }
      pump();
    }).catch(function (err) {
      setRunningState(false);
      appendBubble('<div class="chat-bubble chat-bubble--error">Error: ' + err.message + '</div>');
    });
  }

  function handleSSEEvent(eventName, data) {
    if (eventName === "message") {
      var ts = data.timestamp || "";
      var initial = (data.agent_name || "A").slice(0, 1).toUpperCase();
      var contentHtml = (typeof marked !== "undefined")
        ? marked.parse(data.content || "")
        : "<p>" + (data.content || "").replace(/</g, "&lt;") + "</p>";
      appendBubble(
        '<div class="chat-bubble chat-bubble--ai">'
        + '<div class="chat-bubble__avatar">' + initial + '</div>'
        + '<div class="chat-bubble__body">'
        + '<div class="chat-bubble__meta">'
        + '<span class="chat-bubble__name">' + (data.agent_name || "Agent") + '</span>'
        + '<span class="chat-bubble__time">' + ts + '</span>'
        + '</div>'
        + '<div class="chat-bubble__content">' + contentHtml + '</div>'
        + '</div></div>'
      );
    } else if (eventName === "gate") {
      setRunningState(false);
      appendGatePanel(data);
    } else if (eventName === "done") {
      setRunningState(false);
      appendStatusBadge("completed");
    } else if (eventName === "stopped") {
      setRunningState(false);
      appendStatusBadge("stopped");
    } else if (eventName === "error") {
      setRunningState(false);
      appendBubble('<div class="chat-bubble chat-bubble--error">\u26A0\uFE0F ' + (data.message || "Unknown error") + '</div>');
    }
  }

  // -----------------------------------------------------------------------
  // Send button
  // -----------------------------------------------------------------------
  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", function () {
      if (chatSendBtn.disabled) return;
      var text = chatInput.value.trim();
      if (!text) return;

      // No active session — open modal and queue the typed text
      var sessionId = activeSessionIdInput ? activeSessionIdInput.value.trim() : "";
      if (!sessionId) {
        var projectId = activeProjectIdInput ? activeProjectIdInput.value.trim() : "";
        if (!projectId) { alert("Select a project first."); return; }
        _pendingTask = text;
        openModal();
        return;
      }

      appendHumanBubble(text);
      chatInput.value = "";
      chatInput.style.height = "auto";
      chatInput.focus();
      startRun(text);
    });
  }

  // -----------------------------------------------------------------------
  // Stop button
  // -----------------------------------------------------------------------
  if (chatStopBtn) {
    chatStopBtn.addEventListener("click", function () {
      var sessionId = activeSessionIdInput ? activeSessionIdInput.value.trim() : "";
      var keyInput = getSecretKeyInput();
      var secretKey = keyInput ? keyInput.value.trim() : "";
      if (!sessionId || !secretKey) return;
      fetch("/chat/sessions/" + sessionId + "/stop/", {
        method: "POST",
        headers: { "X-App-Secret-Key": secretKey, "X-CSRFToken": csrfToken },
      });
      // SSE stream emits 'stopped' event which calls setRunningState(false)
    });
  }

  // -----------------------------------------------------------------------
  // Human gate panel — event delegation
  // -----------------------------------------------------------------------
  document.body.addEventListener("click", function (e) {
    var panel = e.target.closest(".human-gate-panel");
    if (!panel) return;

    var sessionId = panel.dataset.sessionId
      || (activeSessionIdInput ? activeSessionIdInput.value.trim() : "");
    var keyInput = getSecretKeyInput();
    var secretKey = keyInput ? keyInput.value.trim() : "";
    if (!sessionId || !secretKey) return;

    function sendRespond(action, text) {
      var body = new URLSearchParams({ action: action });
      if (text) body.append("text", text);
      return fetch("/chat/sessions/" + sessionId + "/respond/", {
        method: "POST",
        headers: {
          "X-App-Secret-Key": secretKey,
          "X-CSRFToken": csrfToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      }).then(function (r) { return r.json(); });
    }

    if (e.target.closest(".human-gate-btn--approve")) {
      panel.remove();
      sendRespond("approve", "").then(function (d) {
        if (d.status === "ok") startRun("");
      });
    } else if (e.target.closest(".human-gate-btn--feedback")) {
      var ta = panel.querySelector(".human-gate-panel__textarea");
      var text = ta ? ta.value.trim() : "";
      if (!text) { ta && ta.focus(); return; }
      panel.remove();
      var fbTs = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      var fbHtml = (typeof marked !== "undefined") ? marked.parse(text) : "<p>" + text.replace(/</g, "&lt;") + "</p>";
      appendBubble(
        '<div class="chat-bubble chat-bubble--human">'
        + '<div class="chat-bubble__meta">'
        + '<span class="chat-bubble__name">You</span>'
        + '<span class="chat-bubble__time">' + fbTs + '</span>'
        + '</div>'
        + '<div class="chat-bubble__content">' + fbHtml + '</div>'
        + '</div>'
      );
      sendRespond("feedback", text).then(function (d) {
        if (d.status === "ok") startRun(d.task || text);
      });
    } else if (e.target.closest(".human-gate-btn--stop")) {
      panel.remove();
      sendRespond("stop", "").then(function () {
        appendStatusBadge("stopped");
      });
    }
  });

  // -----------------------------------------------------------------------
  // Project selection from chat panel dropdown
  // -----------------------------------------------------------------------
  document.body.addEventListener("click", function (e) {
    var item = e.target.closest(".chat-project-item");
    if (!item) return;

    e.preventDefault();
    var projectName = item.dataset.project;
    var projectId = item.dataset.projectId;
    if (!projectName) return;

    // Update dropdown button label
    if (chatProjectBtn) {
      chatProjectBtn.textContent = projectName + " \u25BE";
      chatProjectBtn.dataset.activeProject = projectName;
      chatProjectBtn.dataset.activeProjectId = projectId;
    }

    // Track active project for modal; clear active session
    if (activeProjectIdInput) activeProjectIdInput.value = projectId || "";
    if (activeSessionIdInput) activeSessionIdInput.value = "";
  });

  // -----------------------------------------------------------------------
  // Session selection — set activeSessionIdInput when an HTMX session link fires
  // -----------------------------------------------------------------------
  document.body.addEventListener("htmx:beforeRequest", function (e) {
    var elt = e.detail && e.detail.elt;
    if (!elt) return;
    var li = elt.closest("li[data-session-id]");
    if (li && activeSessionIdInput) activeSessionIdInput.value = li.dataset.sessionId || "";
  });

  // chatSessionCreated: close modal, then fire any queued pending task.
  // Session ID is already in the DOM via OOB swap of #active-session-id.
  document.body.addEventListener("chatSessionCreated", function () {
    closeModal();
    if (_pendingTask) {
      var task = _pendingTask;
      _pendingTask = null;
      // Replace whatever the OOB swap left in #chat-messages with a clean
      // history container so the first bubble lands in the right element.
      if (chatMessages) {
        chatMessages.innerHTML = '<div class="chat-history" id="chat-history-msgs"></div>';
      }
      appendHumanBubble(task);
      if (chatInput) { chatInput.value = ""; chatInput.style.height = "auto"; }
      startRun(task);
    }
  });

  // Show/hide delete buttons after HTMX swaps new session list items
  document.body.addEventListener("htmx:afterSwap", function () {
    updateChatAuthState();
  });

  // Also update on secret key input
  document.body.addEventListener("input", function (e) {
    if (e.target.id === "global-secret-key") {
      updateChatAuthState();
    }
  });

  updateChatAuthState();

});
