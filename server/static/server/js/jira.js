/**
 * jira.js — Jira export modal, shared across three product types.
 *
 * Registers three ProviderRegistry entries:
 *   "jira_software", "jira_service_desk", "jira_business"
 *
 * Namespace: window.JiraExport
 */

(function () {
  "use strict";

  var _state = {};

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  function _headers() {
    return {
      "X-App-Secret-Key": _state.secretKey,
      "X-CSRFToken": _state.csrfToken,
      "Content-Type": "application/json",
    };
  }

  function _api(method, path, body) {
    var opts = { method: method, headers: _headers() };
    if (body) opts.body = JSON.stringify(body);
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || "Request failed");
        return d;
      });
    });
  }

  function _esc(s) {
    var div = document.createElement("div");
    div.textContent = s || "";
    return div.innerHTML;
  }

  function _setStatus(msg) {
    var el = document.getElementById("jira-modal-status");
    if (el) el.textContent = msg || "";
  }

  function _jiraTypeName(typeName) {
    var labels = {
      software: "Jira Software",
      service_desk: "Jira Service Desk",
      business: "Jira Business",
    };
    return labels[typeName] || typeName;
  }

  // ---------------------------------------------------------------------------
  // Reference pane (right side — raw discussion markdown)
  // ---------------------------------------------------------------------------

  function _defaultReferenceMarkdown() {
    return "No agent discussion content available for this reference panel.";
  }

  function _renderReferenceMarkdown(markdown) {
    var el = document.getElementById("jira-reference-markdown");
    if (!el) return;
    if (window.MarkdownViewer && typeof window.MarkdownViewer.render === "function") {
      el.innerHTML = window.MarkdownViewer.render(markdown || "");
      return;
    }
    // Minimal fallback
    var div = document.createElement("div");
    div.textContent = markdown || "";
    el.innerHTML = div.innerHTML.replace(/\n/g, "<br>");
  }

  function _loadDiscussionReference() {
    if (!_state.discussionId) {
      _state.referenceMarkdown = _defaultReferenceMarkdown();
      _renderReferenceMarkdown(_state.referenceMarkdown);
      return;
    }
    _api("GET", "/jira/" + _state.sessionId + "/reference/" + encodeURIComponent(_state.discussionId) + "/")
      .then(function (data) {
        _state.referenceMarkdown = (data && data.markdown) ? String(data.markdown) : _defaultReferenceMarkdown();
        _renderReferenceMarkdown(_state.referenceMarkdown);
      })
      .catch(function () {
        _state.referenceMarkdown = _defaultReferenceMarkdown();
        _renderReferenceMarkdown(_state.referenceMarkdown);
      });
  }

  // ---------------------------------------------------------------------------
  // Type-specific field schemas
  // ---------------------------------------------------------------------------

  var _SCHEMAS = {
    software: ["summary", "description", "issue_type", "priority", "labels", "story_points", "components", "acceptance_criteria", "confidence_score"],
    service_desk: ["summary", "description", "request_type", "priority", "labels", "impact", "urgency", "confidence_score"],
    business: ["summary", "description", "issue_type", "priority", "labels", "due_date", "category", "confidence_score"],
  };

  var _FIELD_LABELS = {
    summary: "Summary",
    description: "Description",
    issue_type: "Issue Type",
    request_type: "Request Type",
    priority: "Priority",
    labels: "Labels",
    story_points: "Story Points",
    components: "Components",
    acceptance_criteria: "Acceptance Criteria",
    confidence_score: "Confidence Score",
    impact: "Impact",
    urgency: "Urgency",
    due_date: "Due Date",
    category: "Category",
  };

  var _TEXTAREA_FIELDS = new Set(["description", "acceptance_criteria", "impact"]);
  var _ARRAY_FIELDS = new Set(["labels", "components"]);

  function _emptyIssue(typeName) {
    var issue = {};
    (_SCHEMAS[typeName] || _SCHEMAS.software).forEach(function (f) {
      if (_ARRAY_FIELDS.has(f)) { issue[f] = []; }
      else if (f === "confidence_score") { issue[f] = 0.0; }
      else if (f === "story_points") { issue[f] = null; }
      else { issue[f] = ""; }
    });
    return issue;
  }

  // ---------------------------------------------------------------------------
  // Issue editor rendering
  // ---------------------------------------------------------------------------

  function _collectIssuesFromEditor() {
    var editorEl = document.getElementById("jira-editor-issues");
    if (!editorEl) return _state.issues.slice();

    var schema = _SCHEMAS[_state.typeName] || _SCHEMAS.software;
    var cards = editorEl.querySelectorAll(".jira-issue-card");
    var result = [];

    cards.forEach(function (card, idx) {
      var issue = {};
      schema.forEach(function (field) {
        if (_ARRAY_FIELDS.has(field)) {
          var raw = (card.querySelector("[data-field='" + field + "']") || {}).value || "";
          issue[field] = raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
        } else if (field === "confidence_score") {
          var valEl = card.querySelector("[data-field='confidence_score']");
          issue[field] = valEl ? parseFloat(valEl.value) || 0.0 : 0.0;
        } else if (field === "story_points") {
          var spEl = card.querySelector("[data-field='story_points']");
          var spVal = spEl ? spEl.value.trim() : "";
          issue[field] = spVal === "" ? null : (parseInt(spVal, 10) || null);
        } else {
          var el = card.querySelector("[data-field='" + field + "']");
          issue[field] = el ? (el.value || "").trim() : "";
        }
      });
      result.push(issue);
    });

    return result;
  }

  function _renderEditorIssues() {
    var editorEl = document.getElementById("jira-editor-issues");
    if (!editorEl) return;

    var schema = _SCHEMAS[_state.typeName] || _SCHEMAS.software;
    var issues = _state.issues;
    var html = "";

    issues.forEach(function (issue, idx) {
      html += '<div class="jira-issue-card" data-issue-index="' + idx + '">';
      html += '<div class="jira-issue-card__header">';
      html += '<span class="jira-issue-card__title">Issue ' + (idx + 1) + '</span>';
      if (!_state.exported) {
        html += '<button type="button" class="btn btn--sm btn--danger js-delete-issue" data-issue-index="' + idx + '">&times;</button>';
      }
      html += '</div>';

      schema.forEach(function (field) {
        var label = _FIELD_LABELS[field] || field;
        var value = issue[field];

        html += '<div class="jira-issue-card__field">';
        html += '<label>' + _esc(label) + '</label>';

        if (_TEXTAREA_FIELDS.has(field)) {
          html += '<textarea class="input input--sm input--textarea" data-field="' + field + '" rows="3"'
            + (_state.exported ? ' disabled' : '') + '>'
            + _esc(String(value || "")) + '</textarea>';
        } else if (_ARRAY_FIELDS.has(field)) {
          var csvVal = Array.isArray(value) ? value.join(", ") : (value || "");
          html += '<input type="text" class="input input--sm" data-field="' + field + '" value="' + _esc(csvVal) + '"'
            + (_state.exported ? ' disabled' : '') + ' placeholder="comma-separated">';
        } else if (field === "confidence_score") {
          html += '<input type="number" class="input input--sm" data-field="' + field + '" value="' + (value || 0) + '"'
            + (_state.exported ? ' disabled' : '') + ' step="0.05" min="0" max="1">';
        } else if (field === "story_points") {
          html += '<input type="number" class="input input--sm" data-field="' + field + '" value="' + (value !== null && value !== undefined ? value : "") + '"'
            + (_state.exported ? ' disabled' : '') + ' placeholder="e.g. 5">';
        } else {
          html += '<input type="text" class="input input--sm" data-field="' + field + '" value="' + _esc(String(value || "")) + '"'
            + (_state.exported ? ' disabled' : '') + '>';
        }
        html += '</div>';
      });

      html += '</div>'; // .jira-issue-card
    });

    editorEl.innerHTML = html;
    _updateIssueCount();
  }

  function _updateIssueCount() {
    var el = document.getElementById("jira-issue-count");
    if (el) el.textContent = (_state.issues || []).length;
  }

  // ---------------------------------------------------------------------------
  // Project (space) dropdown
  // ---------------------------------------------------------------------------

  function _loadSpaces() {
    var sel = document.getElementById("jira-project-select");
    if (!sel) return;

    sel.innerHTML = '<option value="">Loading...</option>';
    var defaultKey = (_state.defaults && _state.defaults.default_project_key) || "";

    _api("GET", "/jira/" + _state.sessionId + "/spaces/" + _state.typeName + "/")
      .then(function (list) {
        var html = '<option value="">— Select project —</option>';
        (Array.isArray(list) ? list : []).forEach(function (p) {
          var selected = (p.key === defaultKey) ? ' selected' : '';
          html += '<option value="' + _esc(p.key) + '" data-name="' + _esc(p.name) + '"' + selected + '>'
            + _esc(p.name || p.key) + '</option>';
        });
        sel.innerHTML = html;
        _syncFooter();
      })
      .catch(function (err) {
        sel.innerHTML = '<option value="">Error loading projects</option>';
        _setStatus(err.message);
      });
  }

  // ---------------------------------------------------------------------------
  // Session status check
  // ---------------------------------------------------------------------------

  function _checkStatus() {
    var statusEl = document.getElementById("jira-modal-token-status");
    _api("GET", "/jira/" + _state.sessionId + "/token-status/" + _state.typeName + "/")
      .then(function (d) {
        if (d.configured) {
          if (statusEl) {
            statusEl.innerHTML = '<span class="export-modal__token-status export-modal__token-status--valid">'
              + _esc(_jiraTypeName(_state.typeName)) + ' Configured</span>';
          }
          if (d.defaults) _state.defaults = d.defaults;
          document.getElementById("jira-destination-section").hidden = false;
          _loadSpaces();
        } else {
          if (statusEl) {
            statusEl.textContent = _jiraTypeName(_state.typeName) + " credentials not configured. "
              + "Enable and save credentials in Project Settings first.";
          }
        }
      })
      .catch(function (err) {
        if (statusEl) statusEl.textContent = "Error: " + err.message;
      });
  }

  // ---------------------------------------------------------------------------
  // Extraction
  // ---------------------------------------------------------------------------

  function _extract() {
    if (!_state.sessionId || !_state.discussionId) {
      _setStatus("No discussion selected for extraction.");
      return;
    }
    _setStatus("Extracting issues...");
    var extractBtn = document.getElementById("jira-extract-btn");
    if (extractBtn) { extractBtn.disabled = true; }

    _api("POST", "/jira/" + _state.sessionId + "/extract/" + encodeURIComponent(_state.discussionId) + "/" + _state.typeName + "/")
      .then(function (data) {
        _state.exported = false;
        _state.issues = Array.isArray(data.items) ? data.items : [_emptyIssue(_state.typeName)];
        if (!_state.issues.length) _state.issues = [_emptyIssue(_state.typeName)];
        _renderEditorIssues();
        _setStatus("Extracted " + _state.issues.length + " issue(s). Review and save.");
        _syncFooter();
        if (extractBtn) { extractBtn.disabled = false; }
      })
      .catch(function (err) {
        _setStatus("Extraction failed: " + err.message);
        if (extractBtn) { extractBtn.disabled = false; }
      });
  }

  // ---------------------------------------------------------------------------
  // Save / Push
  // ---------------------------------------------------------------------------

  function _saveExport() {
    if (!_state.sessionId || !_state.discussionId) {
      _setStatus("No discussion selected.");
      return;
    }
    _state.issues = _collectIssuesFromEditor();
    _setStatus("Saving...");

    _api("POST", "/jira/" + _state.sessionId + "/export/" + encodeURIComponent(_state.discussionId) + "/" + _state.typeName + "/", {
      items: _state.issues,
      source: "manual",
    })
      .then(function (data) {
        if (data && data.export) {
          _state.exported = data.export.exported || false;
        }
        _setStatus("Saved.");
        _renderEditorIssues();
        _syncFooter();
      })
      .catch(function (err) { _setStatus("Save failed: " + err.message); });
  }

  function _push() {
    var sel = document.getElementById("jira-project-select");
    var projectKey = sel ? sel.value.trim() : "";
    if (!projectKey) {
      _setStatus("Select a destination project first.");
      return;
    }
    _state.issues = _collectIssuesFromEditor();

    _setStatus("Exporting to " + _jiraTypeName(_state.typeName) + "...");
    var pushBtn = document.getElementById("jira-push-btn");
    if (pushBtn) pushBtn.disabled = true;

    _api("POST", "/jira/" + _state.sessionId + "/push/" + _state.typeName + "/", {
      project_key: projectKey,
      discussion_id: _state.discussionId,
      items: _state.issues,
    })
      .then(function (data) {
        var results = (data && Array.isArray(data.result)) ? data.result : [];
        var pushed = results.filter(function (r) { return r.issue_key; }).length;
        _state.exported = true;
        _renderEditorIssues();
        _syncFooter();
        _setStatus("Exported " + pushed + " issue(s) to " + _jiraTypeName(_state.typeName) + ".");
        if (pushBtn) pushBtn.disabled = false;
      })
      .catch(function (err) {
        _setStatus("Export failed: " + err.message);
        if (pushBtn) pushBtn.disabled = false;
      });
  }

  // ---------------------------------------------------------------------------
  // Footer state
  // ---------------------------------------------------------------------------

  function _syncFooter() {
    var sel = document.getElementById("jira-project-select");
    var projectKey = sel ? sel.value.trim() : "";
    var hasIssues = (_state.issues || []).length > 0;
    var hasDiscussion = !!_state.discussionId;

    var extractBtn = document.getElementById("jira-extract-btn");
    var saveBtn = document.getElementById("jira-save-btn");
    var pushBtn = document.getElementById("jira-push-btn");

    if (extractBtn) {
      extractBtn.hidden = !hasDiscussion;
      extractBtn.disabled = !hasDiscussion;
    }
    if (saveBtn) {
      saveBtn.disabled = !hasIssues;
    }
    if (pushBtn) {
      pushBtn.hidden = !hasIssues;
      pushBtn.disabled = !hasIssues || !projectKey;
    }
  }

  // ---------------------------------------------------------------------------
  // Modal DOM
  // ---------------------------------------------------------------------------

  function _createModal() {
    var overlay = document.createElement("div");
    overlay.className = "export-modal-overlay";
    overlay.id = "jira-export-overlay";
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });

    overlay.innerHTML =
      '<div class="export-modal export-modal--wide">'
      + '<div class="export-modal__header">'
      + '<h3 id="jira-modal-title">Export to Jira</h3>'
      + '<button type="button" class="export-modal__close" id="jira-modal-close">&times;</button>'
      + '</div>'
      + '<div class="export-modal__body">'
      + '<div class="trello-workbench">'
      // Left pane — editor
      + '<div class="trello-workbench__pane trello-workbench__pane--editor">'
      // Auth status
      + '<div class="export-modal__section" id="jira-token-section">'
      + '<h4>Connection</h4>'
      + '<div id="jira-modal-token-status">Checking...</div>'
      + '</div>'
      // Destination (project select)
      + '<div class="export-modal__section" id="jira-destination-section" hidden>'
      + '<h4>Destination Project</h4>'
      + '<div class="cascade-select">'
      + '<div class="cascade-select__group">'
      + '<label>Project</label>'
      + '<select id="jira-project-select" class="input input--sm"><option value="">Loading...</option></select>'
      + '</div>'
      + '</div>'
      + '</div>'
      // Issue editor
      + '<div class="export-modal__section">'
      + '<div class="trello-editor__section-head">'
      + '<h4>Issues (<span id="jira-issue-count">0</span>)</h4>'
      + '<button type="button" class="btn btn--sm btn--primary" id="jira-add-issue-btn">Add Issue</button>'
      + '</div>'
      + '<div class="trello-editor__section-divider"></div>'
      + '<div id="jira-editor-issues" class="trello-editor__cards"></div>'
      + '</div>'
      + '</div>'
      // Right pane — reference
      + '<div class="trello-workbench__pane trello-workbench__pane--reference">'
      + '<div class="trello-reference">'
      + '<h4>Agent Raw Output (Reference)</h4>'
      + '<div id="jira-reference-markdown" class="trello-reference__markdown"></div>'
      + '</div>'
      + '</div>'
      + '</div>'
      + '</div>'
      // Footer
      + '<div class="export-modal__footer export-modal__footer--wrap">'
      + '<button type="button" class="btn btn--secondary btn--sm" id="jira-extract-btn" hidden>Extract Items</button>'
      + '<button type="button" class="btn btn--success btn--sm" id="jira-save-btn">Save</button>'
      + '<button type="button" class="btn btn--primary btn--sm" id="jira-push-btn" hidden>Export to Jira</button>'
      + '<button type="button" class="btn btn--secondary btn--sm" id="jira-cancel-btn">Cancel</button>'
      + '<span id="jira-modal-status" class="form-hint"></span>'
      + '</div>'
      + '</div>';

    document.body.appendChild(overlay);
    _bindModalEvents(overlay);
    return overlay;
  }

  function _bindModalEvents(overlay) {
    overlay.querySelector("#jira-modal-close").addEventListener("click", closeModal);
    overlay.querySelector("#jira-cancel-btn").addEventListener("click", closeModal);

    overlay.querySelector("#jira-project-select").addEventListener("change", function () {
      _syncFooter();
    });

    overlay.querySelector("#jira-add-issue-btn").addEventListener("click", function () {
      if (_state.exported) {
        _setStatus("Export is locked. Click Extract Items to start fresh.");
        return;
      }
      _state.issues = _collectIssuesFromEditor();
      _state.issues.push(_emptyIssue(_state.typeName));
      _renderEditorIssues();
      _syncFooter();
    });

    overlay.querySelector("#jira-extract-btn").addEventListener("click", _extract);
    overlay.querySelector("#jira-save-btn").addEventListener("click", _saveExport);
    overlay.querySelector("#jira-push-btn").addEventListener("click", _push);

    overlay.querySelector("#jira-editor-issues").addEventListener("click", function (e) {
      if (_state.exported) {
        _setStatus("Export is locked. Click Extract Items to start fresh.");
        return;
      }
      var btn = e.target.closest("button.js-delete-issue");
      if (!btn) return;
      var idx = parseInt(btn.getAttribute("data-issue-index") || "-1", 10);
      if (idx < 0) return;
      _state.issues = _collectIssuesFromEditor();
      _state.issues.splice(idx, 1);
      if (!_state.issues.length) _state.issues.push(_emptyIssue(_state.typeName));
      _renderEditorIssues();
      _syncFooter();
    });

    overlay.querySelector("#jira-editor-issues").addEventListener("input", function () {
      _syncFooter();
    });
  }

  // ---------------------------------------------------------------------------
  // Public interface
  // ---------------------------------------------------------------------------

  function openModal(ctx, typeName) {
    _state = {
      sessionId: ctx.sessionId || "",
      discussionId: ctx.discussionId || "",
      secretKey: ctx.secretKey || "",
      csrfToken: ctx.csrfToken || "",
      typeName: typeName || "software",
      issues: [],
      exported: false,
      defaults: {},
      referenceMarkdown: "",
    };

    var existing = document.getElementById("jira-export-overlay");
    if (existing) existing.remove();

    var overlay = _createModal();

    // Update title
    var titleEl = document.getElementById("jira-modal-title");
    if (titleEl) titleEl.textContent = "Export to " + _jiraTypeName(typeName);

    _checkStatus();
    _loadDiscussionReference();

    // Load saved export if exists
    if (_state.discussionId) {
      _api("GET", "/jira/" + _state.sessionId + "/export/" + encodeURIComponent(_state.discussionId) + "/" + _state.typeName + "/")
        .then(function (data) {
          if (data && data.export && Array.isArray(data.export.issues) && data.export.issues.length) {
            _state.issues = data.export.issues;
            _state.exported = !!data.export.exported;
          } else {
            _state.issues = [];
          }
          _renderEditorIssues();
          _syncFooter();
        })
        .catch(function () {
          _state.issues = [];
          _renderEditorIssues();
          _syncFooter();
        });
    } else {
      _renderEditorIssues();
      _syncFooter();
    }
  }

  function closeModal() {
    var overlay = document.getElementById("jira-export-overlay");
    if (overlay) overlay.remove();
  }

  // Expose globally
  window.JiraExport = { openModal: openModal, closeModal: closeModal };

  // ---------------------------------------------------------------------------
  // ProviderRegistry registrations
  // ---------------------------------------------------------------------------

  function _registerType(typeName) {
    if (!window.ProviderRegistry) return;
    window.ProviderRegistry.register("jira_" + typeName, {
      openExportModal: function (ctx) {
        openModal(ctx, typeName);
      },
    });
  }

  function _init() {
    _registerType("software");
    _registerType("service_desk");
    _registerType("business");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _init);
  } else {
    _init();
  }

})();
