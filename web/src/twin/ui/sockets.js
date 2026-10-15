// Socket control shared by the Energy panel and the Overview sockets card. Switches really switch lab
// sockets over MQTT, so every switch asks for confirmation first; the state changes only when the
// device itself reports it (queued → sent → applied, or the failure).
import { t } from "../i18n.js";
import { data, provider } from "../data/store.js";
import { escapeHtml, openAsPopover, closePopover } from "./dom.js";

export function controlAvailability() {
  const dataset = data();
  if (dataset.kind === "live" && dataset.control.readOnly) return { ok: false, reason: t("reasonReadOnly") };
  if (dataset.kind === "live" && !dataset.connection.connected && dataset.connection.known) return { ok: false, reason: t("reasonBridge") };
  if (!dataset.control.connected) return { ok: false, reason: t("reasonMqtt") };
  return { ok: true };
}

export const pendingSocketIds = () => new Set([...data().pendingControls.values()].map((item) => item.deviceId));

// The status line under a socket list: unavailable reason, the latest control phase, or the demo note.
export function controlStatus(element) {
  if (!element) return;
  const availability = controlAvailability();
  const message = data().controlMessage;
  if (!availability.ok) { element.className = "tw-caption"; element.textContent = `${t("controlUnavailable")} · ${availability.reason}`; }
  else if (message && Date.now() - message.at < 120000) { element.className = `tw-caption is-${message.level}`; element.textContent = t(message.key, message.vars); }
  else { element.className = "tw-caption"; element.textContent = data().kind === "demo" ? t("demoControl") : ""; }
}

// The confirmation grows out of the switch that was pressed.
export function confirmSwitch(trigger, ids, desired, question, { status, onClose } = {}) {
  if (!ids.length) return;
  const popover = document.getElementById("confirm-popover");
  popover.innerHTML = `<p>${escapeHtml(question)}</p><div class="tw-confirm-actions"><button type="button" class="tw-button" data-action="cancel">${escapeHtml(t("cancel"))}</button><button type="button" class="tw-button tw-button-primary" data-action="confirm">${escapeHtml(t("confirm"))}</button></div>`;
  if (status) { status.className = "tw-caption is-pending"; status.textContent = t("phaseConfirm"); }
  openAsPopover(popover, trigger, { align: "end", onClose });
  popover.querySelector('[data-action="cancel"]').addEventListener("click", () => closePopover());
  popover.querySelector('[data-action="confirm"]').addEventListener("click", async () => {
    closePopover();
    for (const id of ids) await provider().socketControl(id, desired);
  });
  popover.querySelector('[data-action="confirm"]').focus();
}

export const confirmOpen = () => !document.getElementById("confirm-popover").hidden;
