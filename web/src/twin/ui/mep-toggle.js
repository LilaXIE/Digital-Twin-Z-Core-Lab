// Toolbar button for the building services (ducts, pipes, AHU): faded → shown → hidden. Faded is the
// default so the room leads (section B4); "shown" helps when explaining the ventilation, "hidden"
// clears the view for the table, seats and sensors. The choice lasts for this visit.
import { t } from "../i18n.js";
import { on } from "../state.js";
import { mepDisplay, setMepMode } from "../scene/index.js";
import { toast } from "./dom.js";

const NEXT = { faded: "shown", shown: "hidden", hidden: "faded" };
const LABEL = { faded: "mepFaded", shown: "mepShown", hidden: "mepHidden" };

function render(state = mepDisplay()) {
  const button = document.getElementById("mep-btn");
  button.dataset.state = state;
  const label = `${t("mepButton")} · ${t(LABEL[state])}`;
  button.setAttribute("aria-label", label);
  button.title = `${label}\n${t("mepButtonHint")}`;
}

export function initMepToggle() {
  const button = document.getElementById("mep-btn");
  button.addEventListener("click", () => {
    const next = NEXT[mepDisplay()] || "shown";
    setMepMode(next);
    toast(`${t("mepButton")} · ${t(LABEL[next])}`, { icon: "ph-pipe" });
  });
  on("mep", (state) => render(state));
  on("settings", () => render());
  render();
}
