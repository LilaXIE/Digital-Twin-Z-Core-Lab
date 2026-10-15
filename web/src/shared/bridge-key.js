// Access key for control commands on a protected (public) bridge.
// The key is kept for this browser tab session only and sent with each command.
const STORAGE_KEY = "zb202-bridge-key";
let pendingPrompt = null;

function storedKey() {
  try { return sessionStorage.getItem(STORAGE_KEY) || ""; } catch { return ""; }
}

export const hasBridgeKey = () => Boolean(storedKey());

export function forgetBridgeKey() {
  try { sessionStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

function promptForKey(message, labels = {}) {
  const dialog = document.createElement("dialog");
  dialog.className = "zb-key-dialog";
  dialog.innerHTML = `
    <form method="dialog">
      <h2></h2>
      <p></p>
      <input type="password" name="key" autocomplete="current-password" required>
      <menu><button type="button" data-cancel></button><button value="ok"></button></menu>
    </form>`;
  dialog.querySelector("h2").textContent = labels.title || "Control access key";
  dialog.querySelector("p").textContent = message;
  dialog.querySelector("input").setAttribute("aria-label", labels.field || "Access key");
  dialog.querySelector("[data-cancel]").textContent = labels.cancel || "Cancel";
  dialog.querySelector('[value="ok"]').textContent = labels.unlock || "Unlock";
  if (!document.getElementById("zb-key-dialog-style")) {
    const style = document.createElement("style");
    style.id = "zb-key-dialog-style";
    style.textContent = `
      .zb-key-dialog { border: 1px solid var(--line, #d0d7e2); border-radius: 14px; padding: 20px; width: min(360px, calc(100vw - 32px));
        background: var(--surface, Canvas); color: var(--text, CanvasText); box-shadow: 0 20px 52px rgba(0, 0, 0, 0.25); font: inherit; }
      .zb-key-dialog::backdrop { background: rgba(8, 10, 13, 0.4); }
      .zb-key-dialog h2 { margin: 0 0 6px; font-size: 1.05rem; }
      .zb-key-dialog p { margin: 0 0 14px; color: var(--muted, GrayText); font-size: 0.9rem; }
      .zb-key-dialog input { box-sizing: border-box; width: 100%; padding: 9px 11px; border: 1px solid var(--line, #d0d7e2); border-radius: 9px;
        background: transparent; color: inherit; font: inherit; }
      .zb-key-dialog menu { display: flex; justify-content: flex-end; gap: 8px; margin: 16px 0 0; padding: 0; }
      .zb-key-dialog button { padding: 7px 14px; border-radius: 9px; border: 1px solid var(--line, #d0d7e2); background: transparent; color: inherit; font: inherit; cursor: pointer; }
      .zb-key-dialog button[value="ok"] { background: var(--accent, #2f7cf6); border-color: transparent; color: #fff; }`;
    document.head.append(style);
  }
  // A plain button, so Enter in the field submits "Unlock" rather than the first button.
  dialog.querySelector("[data-cancel]").addEventListener("click", () => dialog.close("cancel"));
  document.body.append(dialog);
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      const key = dialog.returnValue === "ok" ? dialog.querySelector("input").value.trim() : "";
      dialog.remove();
      resolve(key);
    }, { once: true });
    dialog.showModal();
  });
}

// Resolves to the key to send ("" when the bridge needs none), or null if the user cancels.
// Concurrent callers (e.g. the all-sockets switch) share one prompt.
export async function bridgeKey(writeProtected, message = "Enter the access key to control the lab from this page.", labels = {}) {
  if (!writeProtected) return "";
  const key = storedKey();
  if (key) return key;
  pendingPrompt ||= promptForKey(message, labels).finally(() => { pendingPrompt = null; });
  const entered = await pendingPrompt;
  if (!entered) return null;
  try { sessionStorage.setItem(STORAGE_KEY, entered); } catch { /* storage unavailable */ }
  return entered;
}
