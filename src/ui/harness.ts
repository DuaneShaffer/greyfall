import "./styles.css";
import { el, replaceChildren } from "./dom.js";
import { IntentCall, recordingIntents } from "./intents.js";
import {
  MOCK_OBJECTIVE,
  mockActionMenuView,
  mockBattleLog,
  mockCursorView,
  mockDeploymentView,
  mockDialogue,
  mockEnemyView,
  mockEquipmentView,
  mockFieldView,
  mockForecastView,
  mockJobsView,
  mockLearningView,
  mockOpposition,
  mockPartyView,
  mockPowerRegisterView,
  mockTargetingView,
  mockTurnOrderView,
  mockUnitSheetView,
  mockUnitView,
} from "./mock.js";
import { BattleHud } from "./battle/hud.js";
import { DeploymentScreen } from "./screens/deployment.js";
import { EquipmentScreen } from "./screens/equipment.js";
import { JobScreen } from "./screens/jobs.js";
import { LearningScreen } from "./screens/learning.js";
import { RosterScreen } from "./screens/roster.js";
import { UnitSheetScreen } from "./screens/unitSheet.js";
import type { BattleHudView, DeploymentView, EquipmentView, LearningView } from "./state.js";

// Development harness — mounts the battle HUD and the between-battle screens
// against mock state (src/ui/mock.ts) so the layouts and copy can be eyeballed
// without playing a battle. Built as its own entry, ui-harness.html.

type ScreenId = "battle" | "roster" | "sheet" | "abilities" | "equipment" | "jobs" | "formation";

interface Screen {
  label: string;
  el: HTMLElement;
  handleKey?: (event: KeyboardEvent) => void;
  tick?: (deltaMs: number) => void;
}

const log: IntentCall[] = [];
const logList = el("ol");
const { intents } = recordingIntents((call) => {
  log.unshift(call);
  log.length = Math.min(log.length, 40);
  replaceChildren(
    logList,
    log.map((entry) =>
      el("li", {
        children: [
          el("span", { class: "gf-log-name", text: entry.name }),
          ` ${entry.args.map((arg) => JSON.stringify(arg)).join(", ")}`,
        ],
      }),
    ),
  );
});

// --- battle -----------------------------------------------------------------

const battleView: BattleHudView = {
  action: mockActionMenuView(),
  inspected: mockUnitView(),
  turnOrder: mockTurnOrderView(),
  forecast: null,
  dialogue: mockDialogue,
  power: mockPowerRegisterView(),
  // The rest of the seam §14 carries. Without it the harness drew the panels
  // this phase added as empty frames and nobody could eyeball them.
  activeUnitId: "rowen",
  log: mockBattleLog(),
  objective: MOCK_OBJECTIVE,
  cursor: mockCursorView(),
  targeting: mockTargetingView(),
  field: mockFieldView(),
};

const hud = new BattleHud({
  intents: {
    ...intents,
    inspectUnit: (unitId) => {
      intents.inspectUnit(unitId);
      battleView.inspected = unitId === "provocateur-a" ? mockEnemyView() : mockUnitView();
      hud.status.update(battleView.inspected);
    },
    selectAbility: (unitId, abilityId) => {
      intents.selectAbility(unitId, abilityId);
      hud.forecast.update(previewFor(abilityId));
    },
  },
  onAbilityPreview: (abilityId) => hud.forecast.update(abilityId === null ? null : previewFor(abilityId)),
});

function previewFor(abilityId: string) {
  if (abilityId === "overload-cell") {
    return mockForecastView({
      abilityId,
      abilityName: "Overload Cell",
      chargeCost: 5,
      castSpeed: 25,
      targets: [
        {
          unitId: "yard-cell",
          name: "Yard Cell",
          hitChancePercent: 100,
          damage: { kind: "damage", min: 38, max: 46, damageType: "arc" },
          statuses: [],
          effects: ["Power off"],
          attackAngle: null,
          heightAdvantage: 0,
        },
      ],
      aimedAt: { kind: "object", objectId: "yard-cell" },
    });
  }
  return mockForecastView();
}

hud.update(battleView);
hud.setMode("orders", battleView.action.unit.name);
hud.notify("North Bus cut. 4 machines dark. Splice it or take the tie, gallery.", "machine");

// --- between-battle screens --------------------------------------------------

const roster = new RosterScreen({ intents });
roster.update(mockPartyView());

const sheet = new UnitSheetScreen();
sheet.update(mockUnitSheetView());

let learningView: LearningView = mockLearningView({ standing: 320 });
const learning = new LearningScreen({
  intents: {
    ...intents,
    learnAbility: (unitId, abilityId) => {
      intents.learnAbility(unitId, abilityId);
      const entry = learningView.entries.find((e) => e.abilityId === abilityId);
      if (!entry || entry.learned || entry.standingCost > learningView.standing) return;
      learningView = {
        ...learningView,
        standing: learningView.standing - entry.standingCost,
        entries: learningView.entries.map((e) => (e.abilityId === abilityId ? { ...e, learned: true } : e)),
      };
      learning.update(learningView);
    },
  },
});
learning.update(learningView);

let equipmentView: EquipmentView = mockEquipmentView();
const equipment = new EquipmentScreen({
  intents: {
    ...intents,
    equipItem: (unitId, slot, itemId) => {
      intents.equipItem(unitId, slot, itemId);
      const option = equipmentView.options[slot]?.find((o) => o.itemId === itemId);
      equipmentView = {
        ...equipmentView,
        slots: equipmentView.slots.map((s) =>
          s.slot === slot
            ? { ...s, itemId, itemName: option?.name ?? null, summary: option?.summary ?? "Empty" }
            : s,
        ),
        options: {
          ...equipmentView.options,
          [slot]: (equipmentView.options[slot] ?? []).map((o) => ({ ...o, equipped: o.itemId === itemId })),
        },
      };
      equipment.update(equipmentView);
    },
  },
});
equipment.update(equipmentView);

const jobs = new JobScreen({ intents });
jobs.update(mockJobsView());

let formationView: DeploymentView = mockDeploymentView();
const formation = new DeploymentScreen({
  intents: {
    ...intents,
    toggleDeployment: (unitId) => {
      intents.toggleDeployment(unitId);
      const slots = formationView.slots.map((slot) => ({ ...slot }));
      const at = slots.findIndex((slot) => slot.unitId === unitId);
      const candidate = formationView.candidates.find((entry) => entry.unitId === unitId);
      if (at !== -1) {
        slots[at] = { ...slots[at]!, unitId: null, unitName: null };
      } else {
        const free = slots.findIndex((slot) => slot.unitId === null);
        if (free === -1 || !candidate) return;
        slots[free] = { ...slots[free]!, unitId, unitName: candidate.name };
      }
      const assigned = new Set(slots.map((slot) => slot.unitId));
      formationView = {
        ...formationView,
        slots,
        candidates: formationView.candidates.map((entry) => ({
          ...entry,
          assigned: assigned.has(entry.unitId),
        })),
        canConfirm: slots.some((slot) => slot.unitId !== null),
      };
      formation.update(formationView);
    },
  },
});
formation.setOpposition(mockOpposition());
formation.update(formationView);

// --- shell -------------------------------------------------------------------

const screens: Record<ScreenId, Screen> = {
  battle: {
    label: "Battle HUD",
    el: hud.el,
    handleKey: (event) => {
      if (hud.dialogue.isOpen && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        hud.dialogue.advance();
        return;
      }
      if (hud.actionMenu.menus.handleKey(event)) event.preventDefault();
    },
    tick: (delta) => hud.tick(delta),
  },
  roster: { label: "Roster", el: roster.el, handleKey: (event) => void roster.menus.handleKey(event) },
  sheet: { label: "Unit Sheet", el: sheet.el },
  abilities: { label: "Abilities", el: learning.el, handleKey: (event) => void learning.menus.handleKey(event) },
  equipment: { label: "Equipment", el: equipment.el, handleKey: (event) => void equipment.menus.handleKey(event) },
  jobs: { label: "Jobs", el: jobs.el, handleKey: (event) => void jobs.menus.handleKey(event) },
  formation: { label: "Formation", el: formation.el, handleKey: (event) => void formation.menus.handleKey(event) },
};

const stage = el("div", { class: "gf-harness-canvas gf-root" });
const tabs = el("div", { class: "gf-harness-bar", children: [el("span", { class: "gf-harness-brand", text: "Greyfall UI" })] });
let current: ScreenId = "battle";

function show(id: ScreenId): void {
  current = id;
  replaceChildren(stage, [screens[id].el]);
  for (const button of tabs.querySelectorAll("button")) {
    button.classList.toggle("is-active", button.dataset["screen"] === id);
  }
}

for (const [id, screen] of Object.entries(screens) as [ScreenId, Screen][]) {
  const button = el("button", {
    class: "gf-harness-tab",
    text: screen.label,
    data: { screen: id },
    attrs: { type: "button" },
  });
  button.addEventListener("click", () => show(id));
  tabs.appendChild(button);
}

document.addEventListener("keydown", (event) => screens[current].handleKey?.(event));

const root = el("div", {
  class: "gf-harness",
  children: [
    tabs,
    el("div", {
      class: "gf-harness-stage",
      children: [
        stage,
        el("aside", {
          class: "gf-harness-log",
          children: [el("h2", { text: "Intents" }), logList],
        }),
      ],
    }),
  ],
});

document.body.appendChild(root);
show("battle");

let last = performance.now();
function frame(now: number): void {
  screens[current].tick?.(now - last);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
