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

    document.querySelectorAll(".config-form button[type='submit']").forEach(function (button) {
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

  function syncFormState() {
    syncHumanGateFields();
    syncMaxIterationsLimit();
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
    if (e.target.id !== "human-gate-enabled") return;
    syncHumanGateFields();
    syncMaxIterationsLimit();
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

  var chatMessages = document.getElementById("chat-messages");
  var chatInput = document.getElementById("chat-input");
  var chatSendBtn = document.getElementById("chat-send-btn");
  var resetChatBtn = document.getElementById("reset-chat-btn");
  var chatProjectBtn = document.getElementById("chat-project-btn");

  // Only wire up when chat elements exist (home page only)
  if (!chatMessages || !chatInput) return;

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  function scrollChatToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function removeWelcome() {
    var welcome = chatMessages.querySelector(".chat-welcome");
    if (welcome) welcome.remove();
  }

  function appendMessage(sender, text, type) {
    // type: "human" | "agent" | "system"
    var msg = document.createElement("div");
    msg.className = "chat-message chat-message--" + type;

    if (type !== "system") {
      var senderEl = document.createElement("div");
      senderEl.className = "chat-message__sender";
      senderEl.textContent = sender;
      msg.appendChild(senderEl);
    }

    var bubble = document.createElement("div");
    bubble.className = "chat-message__bubble";
    bubble.textContent = text;
    msg.appendChild(bubble);

    chatMessages.appendChild(msg);
    scrollChatToBottom();
  }

  // -----------------------------------------------------------------------
  // Auto-resize textarea
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
      if (chatSendBtn) chatSendBtn.click();
    }
  });

  // -----------------------------------------------------------------------
  // Send button — append human bubble (UI only)
  // -----------------------------------------------------------------------
  if (chatSendBtn) {
    chatSendBtn.addEventListener("click", function () {
      var text = chatInput.value.trim();
      if (!text) return;

      removeWelcome();
      appendMessage("You", text, "human");

      // Clear + reset height
      chatInput.value = "";
      chatInput.style.height = "auto";
      chatInput.focus();
    });
  }

  // -----------------------------------------------------------------------
  // Reset chat
  // -----------------------------------------------------------------------
  if (resetChatBtn) {
    resetChatBtn.addEventListener("click", function () {
      chatMessages.innerHTML = "";

      // Restore welcome screen
      var welcome = document.createElement("div");
      welcome.className = "chat-welcome";
      welcome.innerHTML = [
        '<div class="chat-welcome__icon">\uD83E\uDD16</div>',
        '<h2 class="chat-welcome__title">Product Discovery</h2>',
        '<p class="chat-welcome__subtitle">Select a project and start a conversation with your AI agents.</p>'
      ].join("");
      chatMessages.appendChild(welcome);

      // Reset project button label
      if (chatProjectBtn) {
        chatProjectBtn.textContent = "Projects \u25BE";
        chatProjectBtn.dataset.activeProject = "";
      }
    });
  }

  // -----------------------------------------------------------------------
  // Project selection from chat panel dropdown
  // -----------------------------------------------------------------------
  document.body.addEventListener("click", function (e) {
    var item = e.target.closest(".chat-project-item");
    if (!item) return;

    e.preventDefault();
    var projectName = item.dataset.project;
    if (!projectName) return;

    // Update button label
    if (chatProjectBtn) {
      chatProjectBtn.textContent = projectName + " \u25BE";
      chatProjectBtn.dataset.activeProject = projectName;
    }

    // Show system notice in chat
    removeWelcome();
    appendMessage(null, "Project \u201C" + projectName + "\u201D selected.", "system");
    chatInput.focus();
  });

});
