/**
 * app.js - Shared cross-page behavior only.
 *
 * Scope:
 *   - Secret key helpers exposed via window.AppCommon
 *   - HTMX secret header injection
 *   - Shared toast auto-dismiss
 */

document.addEventListener("DOMContentLoaded", function () {
  function getSecretKeyInput() {
    return document.getElementById("global-secret-key");
  }

  function getSecretKey() {
    var input = getSecretKeyInput();
    return input ? input.value.trim() : "";
  }

  function hasSecretKey() {
    return !!getSecretKey();
  }

  window.AppCommon = {
    getSecretKeyInput: getSecretKeyInput,
    getSecretKey: getSecretKey,
    hasSecretKey: hasSecretKey,
  };

  document.body.addEventListener("htmx:configRequest", function (e) {
    var secretKey = getSecretKey();
    if (secretKey) {
      e.detail.headers["X-App-Secret-Key"] = secretKey;
    }
  });

  document.body.addEventListener("htmx:afterSwap", function () {
    var toast = document.getElementById("toast");
    if (!toast) return;

    setTimeout(function () {
      toast.style.transition = "opacity 0.3s";
      toast.style.opacity = "0";
      setTimeout(function () { toast.remove(); }, 300);
    }, 4000);
  });
});
