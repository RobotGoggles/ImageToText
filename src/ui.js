// Small UI helpers: toast notifications and the export file-name dialog.

const toastDurationMs = 3200;
let toastTimer = 0;

/**
 * Shows a toast that screen readers announce. Errors use role="alert" so they
 * interrupt; everything else uses role="status".
 */
export function showToast(message, isError = false) {
  document.querySelector(".toast")?.remove();
  window.clearTimeout(toastTimer);

  const toast = document.createElement("div");
  toast.className = `toast${isError ? " error" : ""}`;
  toast.setAttribute("role", isError ? "alert" : "status");
  toast.setAttribute("aria-live", isError ? "assertive" : "polite");
  toast.textContent = message;
  document.body.append(toast);

  toastTimer = window.setTimeout(() => toast.remove(), toastDurationMs);
}

/**
 * Asks for an export file name using the <dialog id="saveDialog"> in index.html.
 * Resolves with the entered name, or null if the user cancels.
 */
export function askForFileName(defaultName) {
  const dialog = document.querySelector("#saveDialog");
  const input = document.querySelector("#saveFileName");
  if (!dialog || !input || typeof dialog.showModal !== "function") {
    return Promise.resolve(window.prompt("Save CxAlloy export as:", defaultName));
  }

  return new Promise((resolve) => {
    input.value = defaultName;

    const cancelButton = document.querySelector("#saveDialogCancel");
    const handleCancel = () => dialog.close("cancel");
    const handleClose = () => {
      dialog.removeEventListener("close", handleClose);
      cancelButton?.removeEventListener("click", handleCancel);
      resolve(dialog.returnValue === "save" ? input.value : null);
    };

    dialog.returnValue = "";
    dialog.addEventListener("close", handleClose);
    cancelButton?.addEventListener("click", handleCancel);
    dialog.showModal();

    const baseNameLength = defaultName.replace(/\.xlsx$/i, "").length;
    input.focus();
    input.setSelectionRange(0, baseNameLength);
  });
}
