// Socket control shared by the Energy panel and the Overview sockets card. Switches really switch lab
// sockets over MQTT, so every switch asks for confirmation first; the state changes only when the
// device itself reports it (queued → sent → applied, or the failure).
import { t } from "../i18n.js";
import { data, provider } from "../data/store.js";
import { settings, emit } from "../state.js";
import { escapeHtml, icon, openAsPopover, closePopover } from "./dom.js";

export function controlAvailability() {
  const dataset = data();
  if (dataset.kind === "live" && dataset.control.readOnly) return { ok: false, reason: t("reasonReadOnly") };
  if (dataset.kind === "live" && !dataset.connection.connected && dataset.connection.known) return { ok: false, reason: t("reasonBridge") };
  if (!dataset.control.connected) return { ok: false, reason: t("reasonMqtt") };
  return { ok: true };
}

// Members unlock control with the access key; visitors on a protected bridge only see the states.
export function controlUnlocked() {
  const dataset = data();
  if (dataset.kind === "demo") return true;
  if (dataset.control.readOnly) return false;
  return !dataset.control.writeProtected || Boolean(dataset.member);
}

// Switches appear only when a press can actually do something.
export const switchesInteractive = () => controlAvailability().ok && controlUnlocked();

export async function unlockControl() {
  const ok = await provider().login?.();
  if (ok) emit("data", { kind: "control" });
  return Boolean(ok);
}

// Read-only socket state in place of a switch, from the shared device state (data/derived.js
// deviceState): the same dot colour as in the device list, the sensor sheet and the scene.
export function socketStateHtml(info) {
  const state = info.state;
  if (!state || (state.online && info.on === null)) return "";
  const text = !state.online ? t("statusOffline") : t(info.on ? "socketOn" : "socketOff");
  return `<span class="tw-socket-state" data-on="${state.online ? info.on : "offline"}"><i class="tw-dot" data-level="${state.level}"></i>${escapeHtml(text)}</span>`;
}

export const pendingSocketIds = () => new Set([...data().pendingControls.values()].map((item) => item.deviceId));

// The status line under a socket list: unavailable reason, the latest control phase, or the demo note.
export function controlStatus(element) {
  if (!element) return;
  const availability = controlAvailability();
  const message = data().controlMessage;
  if (!availability.ok) {
    // Customers see that this is a view-only page; the technical reason is for internal mode.
    element.className = "tw-caption";
    element.textContent = settings.internal ? `${t("controlUnavailable")} · ${availability.reason}` : "";
  } else if (!controlUnlocked()) {
    element.className = "tw-caption";
    element.innerHTML = `${escapeHtml(t("controlLocked"))} <button type="button" class="tw-link" data-action="unlock">${icon("ph-lock-key")}${escapeHtml(t("login"))}</button>`;
    element.querySelector('[data-action="unlock"]').addEventListener("click", () => { void unlockControl(); });
  }
  else if (message && Date.now() - message.at < 120000) { element.className = `tw-caption is-${message.level}`; element.textContent = t(message.key, message.vars); }
  else { element.className = "tw-caption"; element.textContent = ""; }
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

// "Turn all on" / "Turn all off" for every socket at once. Always visible with two or more sockets;
// greyed out (with the reason as a tooltip) while control is unavailable. A visitor is asked to log
// in first, and the switch is still confirmed like a single socket.
export function renderBulkButtons(host, infos, { status, onClose } = {}) {
  if (!host) return;
  host.hidden = infos.length < 2;
  if (host.hidden) { host.innerHTML = ""; return; }
  const pending = pendingSocketIds();
  const availability = controlAvailability();
  const reason = availability.ok || !settings.internal ? "" : availability.reason;
  const targets = (desired) => infos.filter(({ info }) => info.on !== desired && info.on !== null).map(({ device }) => device.id);
  host.innerHTML = [true, false].map((desired) => `<button type="button" class="tw-button tw-button-small" data-bulk="${desired ? "on" : "off"}" ${!availability.ok || pending.size || !targets(desired).length ? "disabled" : ""}${reason ? ` title="${escapeHtml(reason)}"` : ""}>${icon(desired ? "ph-power" : "ph-prohibit")}<span>${escapeHtml(t(desired ? "allOn" : "allOff"))}</span></button>`).join("");
  host.querySelectorAll("[data-bulk]").forEach((button) => button.addEventListener("click", async () => {
    if (!controlUnlocked() && !(await unlockControl())) return;
    const desired = button.dataset.bulk === "on";
    const trigger = host.querySelector(`[data-bulk="${button.dataset.bulk}"]`) || button; // logging in redraws the buttons
    confirmSwitch(trigger, targets(desired), desired, t(desired ? "confirmAllOn" : "confirmAllOff"), { status, onClose });
  }));
}
