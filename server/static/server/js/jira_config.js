/**
 * jira_config.js — Jira configuration interactions for the project config form.
 *
 * Scope:
 *   - Config page only (create/edit project form)
 *   - Per-type: Test Connection, spaces cascade dropdown, hidden field sync
 *   - Show/hide sub-sections based on enabled checkboxes
 */

(function () {
  "use strict";

  var JIRA_TYPES = ["software", "service_desk", "business"];

  function getSecretKey() {
    var input = document.getElementById("global-secret-key");
    return input ? input.value.trim() : "";
  }

  function getProjectId() {
    var el = document.getElementById("config-project-id");
    return el ? el.value.trim() : "";
  }

  function isConfigPage() {
    return !!document.querySelector("form.config-form");
  }

  function isCreateMode() {
    return !!document.getElementById("config-form-create");
  }

  function headersJson() {
    var csrfInput = document.querySelector("[name=csrfmiddlewaretoken]");
    return {
      "Content-Type": "application/json",
      "X-App-Secret-Key": getSecretKey(),
      "X-CSRFToken": csrfInput ? csrfInput.value : "",
    };
  }

  // ---------------------------------------------------------------------------
  // Top-level Jira enable/disable
  // ---------------------------------------------------------------------------

  function syncJiraTopLevelFields() {
    var integrationsEnabled = document.getElementById("integrations-enabled");
    var jiraEnabled = document.getElementById("integrations-jira-enabled");
    var jiraFields = document.getElementById("integrations-jira-fields");
    if (!jiraFields) return;

    var integrationsOn = !integrationsEnabled || integrationsEnabled.checked;
    var jiraOn = integrationsOn && !!(jiraEnabled && jiraEnabled.checked);

    jiraFields.hidden = !jiraOn;
    jiraFields.querySelectorAll("input, select, textarea").forEach(function (field) {
      field.disabled = !jiraOn;
    });
  }

  // ---------------------------------------------------------------------------
  // Per-type show/hide
  // ---------------------------------------------------------------------------

  function syncJiraTypeFields(typeName) {
    var typeId = typeName.replace("_", "-");
    var typeEnabled = document.getElementById("jira-" + typeId + "-enabled");
    var typeFields = document.getElementById("jira-" + typeId + "-fields");

    var integrationsEnabled = document.getElementById("integrations-enabled");
    var jiraEnabled = document.getElementById("integrations-jira-enabled");
    var integrationsOn = !integrationsEnabled || integrationsEnabled.checked;
    var jiraOn = integrationsOn && !!(jiraEnabled && jiraEnabled.checked);
    var typeOn = jiraOn && !!(typeEnabled && typeEnabled.checked);

    if (typeFields) {
      typeFields.hidden = !typeOn;
      typeFields.querySelectorAll("input, select, textarea").forEach(function (field) {
        field.disabled = !typeOn;
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Test Connection
  // ---------------------------------------------------------------------------

  function setupVerifyButton(typeName) {
    var typeId = typeName.replace("_", "-");
    var btn = document.querySelector(".js-jira-verify[data-jira-type='" + typeName + "']");
    if (!btn) return;

    btn.addEventListener("click", function () {
      var projectId = getProjectId();
      if (!projectId || isCreateMode()) {
        setVerifyStatus(typeName, "Save the project first before testing the connection.", false);
        return;
      }

      btn.disabled = true;
      setVerifyStatus(typeName, "Testing...", null);

      fetch("/jira/project/" + encodeURIComponent(projectId) + "/verify/" + typeName + "/", {
        headers: { "X-App-Secret-Key": getSecretKey() },
      })
        .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (res.ok && res.data.ok) {
            var label = res.data.user ? (" (" + res.data.user + ")") : "";
            setVerifyStatus(typeName, "Connected" + label, true);
            loadSpaces(typeName, projectId);
          } else {
            setVerifyStatus(typeName, "Failed: " + (res.data.error || "Unknown error"), false);
          }
        })
        .catch(function (err) {
          btn.disabled = false;
          setVerifyStatus(typeName, "Error: " + err.message, false);
        });
    });
  }

  function setVerifyStatus(typeName, msg, ok) {
    var typeId = typeName.replace("_", "-");
    var statusEl = document.getElementById("jira-" + typeId + "-verify-status");
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.className = "jira-verify-status"
      + (ok === true ? " jira-verify-status--ok" : ok === false ? " jira-verify-status--err" : "");
  }

  // ---------------------------------------------------------------------------
  // Spaces (project) dropdown
  // ---------------------------------------------------------------------------

  function loadSpaces(typeName, projectId) {
    var typeId = typeName.replace("_", "-");
    var selectEl = document.getElementById("jira-" + typeId + "-project-select");
    if (!selectEl) return;

    projectId = projectId || getProjectId();
    if (!projectId) return;

    selectEl.innerHTML = "<option value=''>Loading...</option>";

    var savedKey = (document.getElementById("jira-" + typeId + "-default-project-key") || {}).value || "";

    fetch("/jira/project/" + encodeURIComponent(projectId) + "/spaces/" + typeName + "/", {
      headers: { "X-App-Secret-Key": getSecretKey() },
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        if (!res.ok || res.data.error) {
          selectEl.innerHTML = "<option value=''>— Unable to load —</option>";
          return;
        }

        var spaces = Array.isArray(res.data) ? res.data : [];
        var html = "<option value=''>— Select project —</option>";
        spaces.forEach(function (p) {
          var sel = (p.key === savedKey) ? " selected" : "";
          html += '<option value="' + _esc(p.key) + '" data-name="' + _esc(p.name) + '"' + sel + '>'
            + _esc(p.name || p.key) + "</option>";
        });
        selectEl.innerHTML = html;
        selectEl.dataset.loadedForProjectId = projectId;

        // Sync hidden fields if pre-selected
        if (savedKey) syncSpaceHiddenFields(typeName, selectEl);
      })
      .catch(function () {
        selectEl.innerHTML = "<option value=''>— Error loading —</option>";
      });
  }

  function _esc(s) {
    var div = document.createElement("div");
    div.textContent = String(s || "");
    return div.innerHTML;
  }

  function syncSpaceHiddenFields(typeName, selectEl) {
    var typeId = typeName.replace("_", "-");
    var opt = selectEl.options[selectEl.selectedIndex];
    var key = opt ? opt.value : "";
    var name = opt ? (opt.getAttribute("data-name") || opt.textContent.trim()) : "";

    var keyEl = document.getElementById("jira-" + typeId + "-default-project-key");
    var nameEl = document.getElementById("jira-" + typeId + "-default-project-name");
    if (keyEl) keyEl.value = key;
    if (nameEl) nameEl.value = name;
  }

  // ---------------------------------------------------------------------------
  // Per-type setup
  // ---------------------------------------------------------------------------

  function setupJiraType(typeName) {
    var typeId = typeName.replace("_", "-");

    // Enable checkbox toggle
    var typeEnabledCb = document.getElementById("jira-" + typeId + "-enabled");
    if (typeEnabledCb) {
      typeEnabledCb.addEventListener("change", function () {
        syncJiraTypeFields(typeName);
        // Load spaces on first enable if project exists
        if (this.checked && !isCreateMode()) {
          var selectEl = document.getElementById("jira-" + typeId + "-project-select");
          var loaded = selectEl ? selectEl.dataset.loadedForProjectId : "";
          if (!loaded) loadSpaces(typeName, null);
        }
      });
    }

    // Verify button
    setupVerifyButton(typeName);

    // Spaces dropdown — sync hidden fields on change
    var spacesSelect = document.querySelector(".js-jira-spaces-select[data-jira-type='" + typeName + "']");
    if (spacesSelect) {
      spacesSelect.addEventListener("change", function () {
        syncSpaceHiddenFields(typeName, this);
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Initialise
  // ---------------------------------------------------------------------------

  function init() {
    if (!isConfigPage()) return;

    // Top-level Jira toggle
    var integrationsEnabled = document.getElementById("integrations-enabled");
    if (integrationsEnabled) {
      integrationsEnabled.addEventListener("change", function () {
        syncJiraTopLevelFields();
        JIRA_TYPES.forEach(syncJiraTypeFields);
      });
    }

    var jiraEnabled = document.getElementById("integrations-jira-enabled");
    if (jiraEnabled) {
      jiraEnabled.addEventListener("change", function () {
        syncJiraTopLevelFields();
        JIRA_TYPES.forEach(syncJiraTypeFields);
      });
    }

    // Per-type setup
    JIRA_TYPES.forEach(function (typeName) {
      setupJiraType(typeName);
      syncJiraTypeFields(typeName);
    });

    syncJiraTopLevelFields();

    // If edit mode and types enabled, load spaces eagerly
    if (!isCreateMode()) {
      JIRA_TYPES.forEach(function (typeName) {
        var typeId = typeName.replace("_", "-");
        var typeEnabledEl = document.getElementById("jira-" + typeId + "-enabled");
        if (typeEnabledEl && typeEnabledEl.checked) {
          loadSpaces(typeName, null);
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Re-init when HTMX swaps in new content (config form reload)
  document.addEventListener("htmx:afterSwap", function () {
    if (isConfigPage()) init();
  });

})();
