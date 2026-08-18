/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { TurnOrderStrip } from "../../src/ui/battle/turnOrder.js";
import { UnitStatusPanel } from "../../src/ui/battle/unitStatus.js";
import { recordingIntents } from "../../src/ui/intents.js";
import {
  mockBattleResultsView,
  mockChapterCloseView,
  mockDeploymentView,
  mockEnemyView,
  mockEquipmentView,
  mockPartyView,
  mockTurnOrderView,
  mockUnitSheetView,
  mockUnitView,
} from "../../src/ui/mock.js";
import {
  CampaignSelectScreen,
  type CampaignSelectView,
} from "../../src/ui/screens/campaignSelect.js";
import { DeploymentScreen } from "../../src/ui/screens/deployment.js";
import { EquipmentScreen } from "../../src/ui/screens/equipment.js";
import { BattleResultsScreen, ChapterCloseScreen } from "../../src/ui/screens/results.js";
import { resetVerbHint } from "../../src/ui/screens/firstUse.js";
import { RosterScreen } from "../../src/ui/screens/roster.js";
import { UnitSheetScreen } from "../../src/ui/screens/unitSheet.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

describe("UnitStatusPanel", () => {
  it("shows condition, charge, CT, and the hidden pair", () => {
    const panel = new UnitStatusPanel();
    panel.update(mockUnitView());
    const text = panel.el.textContent ?? "";
    expect(text).toContain("Rowen Corvane");
    expect(text).toContain("41 / 58");
    expect(text).toContain("6 / 14");
    expect(text).toContain("Resolve");
    expect(text).toContain("72");
    expect(text).toContain("Attunement");
    // Two meters, not three: CT is a figure in the gauge strip now, because the
    // queue beside this card already prints the same fact in ticks.
    expect(panel.el.querySelectorAll(".gf-meter").length).toBe(2);
    expect(panel.el.querySelector(".gf-unit-gauges")?.textContent).toContain("CT");
  });

  it("lists statuses with their remaining turns", () => {
    const panel = new UnitStatusPanel();
    panel.update(mockEnemyView());
    expect(panel.el.querySelector(".gf-unit-status.is-debuff")?.textContent).toBe("Stunned (1)");
  });

  it("surfaces timed stat modifiers, which carry no status of their own", () => {
    const panel = new UnitStatusPanel();
    panel.update(
      mockUnitView({
        modifiers: [
          { id: "mod-1", label: "Phys +4 · Speed -1", remainingTurns: 2, direction: "mixed" },
        ],
      }),
    );
    const chip = panel.el.querySelector(".gf-unit-modifier");
    expect(chip?.textContent).toBe("Phys +4 · Speed -1 (2)");
  });

  it("names its role so the acting unit and a hovered one never look alike", () => {
    const acting = new UnitStatusPanel({ role: "acting" });
    acting.update(mockUnitView());
    expect(acting.el.querySelector(".gf-plate")?.textContent).toContain("Acting");
    expect(acting.el.classList.contains("is-live")).toBe(true);

    const inspect = new UnitStatusPanel({ role: "inspect" });
    inspect.update(mockEnemyView());
    expect(inspect.el.querySelector(".gf-plate")?.textContent).toContain("Inspecting");
    expect(inspect.el.classList.contains("is-quiet")).toBe(true);
  });

  it("falls back to an empty state", () => {
    const panel = new UnitStatusPanel();
    panel.update(null);
    expect(panel.el.classList.contains("is-empty")).toBe(true);
  });

  it("says what a unit is charging and when it lands", () => {
    const panel = new UnitStatusPanel({ role: "inspect" });
    panel.update(mockEnemyView());
    const charging = panel.el.querySelector(".gf-unit-charging")?.textContent ?? "";
    expect(charging).toContain("Charging");
    expect(charging).toContain("Overload Cell");
    expect(charging).toContain("Resolves in 18");
  });

  it("prints Resolve and Attunement on the inspect card too, not just the actor's", () => {
    const inspect = new UnitStatusPanel({ role: "inspect" });
    inspect.update(mockEnemyView());
    const pair = inspect.el.querySelector(".gf-unit-gauges")?.textContent ?? "";
    expect(pair).toContain("Resolve");
    expect(pair).toContain("55");
    expect(pair).toContain("Attunement");
    expect(pair).toContain("45");
  });

  it("prints nothing about charging for a unit that is not", () => {
    const panel = new UnitStatusPanel();
    panel.update(mockUnitView());
    expect(panel.el.querySelector(".gf-unit-charging")).toBeNull();
  });
});

describe("TurnOrderStrip", () => {
  it("lists upcoming turns and charging casts", () => {
    const strip = new TurnOrderStrip();
    strip.update(mockTurnOrderView());
    const entries = [...strip.el.querySelectorAll<HTMLElement>(".gf-turn-entry")];
    expect(entries).toHaveLength(6);
    expect(entries[0]?.classList.contains("is-now")).toBe(true);
    expect(entries[0]?.textContent).toContain("Now");
    expect(entries[1]?.textContent).toContain("+12");
    const cast = strip.el.querySelector<HTMLElement>('.gf-turn-entry[data-kind="cast"]');
    expect(cast?.textContent).toContain("Charging · Overload Cell");
  });

  it("names one Now, one Next, and orders the rest of the units tied at the threshold", () => {
    const strip = new TurnOrderStrip();
    const tied = mockTurnOrderView();
    strip.update({
      entries: tied.entries.map((entry, index) => ({ ...entry, ticksUntil: index < 3 ? 0 : 20 })),
    });
    const ticks = [...strip.el.querySelectorAll(".gf-turn-ticks")].map((n) => n.textContent);
    // Only one row can be next; the tie behind it reads THEN (tests/ui/turnOrder).
    expect(ticks.slice(0, 4)).toEqual(["Now", "Next", "Then", "+20"]);
    expect(strip.el.querySelectorAll(".gf-turn-entry.is-now")).toHaveLength(1);
    expect(strip.el.querySelectorAll(".gf-turn-entry.is-next")).toHaveLength(1);
    expect([...strip.el.querySelectorAll(".gf-turn-index")].map((n) => n.textContent)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
    ]);
  });
});

describe("RosterScreen", () => {
  it("marks who is going out and counts them against the limit", () => {
    resetVerbHint();
    const screen = new RosterScreen();
    screen.update(mockPartyView());
    expect(screen.el.querySelector(".gf-screen-note")?.textContent).toBe("3/4 deployed");

    const row = (unitId: string): string =>
      screen.el.querySelector(`.gf-menu-entry[data-entry="${unitId}"]`)?.textContent ?? "";
    expect(row("rowen")).toContain("Deployed");
    expect(row("mott-tarr")).toContain("Downed");
    expect(screen.el.querySelector(".gf-roster-detail .gf-plate-stamp")?.textContent).toBe(
      "DEPLOYED",
    );
  });

  it("says Reserve for a unit who is fit and not staged", () => {
    const party = mockPartyView();
    const screen = new RosterScreen();
    screen.update({
      ...party,
      deployedCount: 2,
      members: party.members.map((member) =>
        member.unitId === "sella-wick" ? { ...member, deployed: false } : member,
      ),
    });
    expect(
      screen.el.querySelector('.gf-menu-entry[data-entry="sella-wick"]')?.textContent,
    ).toContain("Reserve");
    expect(screen.el.querySelector(".gf-screen-note")?.textContent).toBe("2/4 deployed");
  });

  it("counts the staged formation itself when the seam sends no count", () => {
    const party = mockPartyView();
    const screen = new RosterScreen();
    const { deployedCount: _dropped, ...withoutCount } = party;
    screen.update(withoutCount);
    expect(screen.el.querySelector(".gf-screen-note")?.textContent).toBe("3/4 deployed");
  });

  it("lists the party and greys downed members", () => {
    const screen = new RosterScreen();
    screen.update(mockPartyView());
    expect(screen.el.querySelectorAll(".gf-menu-entry")).toHaveLength(4);
    const downed = screen.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="mott-tarr"]');
    expect(downed?.classList.contains("is-disabled")).toBe(true);
    const detail = screen.el.querySelector(".gf-roster-detail")?.textContent ?? "";
    expect(detail).toContain("Standing (Enforcer)");
    expect(detail).toContain("320");
    // Two tracks, named: the row's "Enforcer 1" is the unit's level and the
    // record's 2 is the job's, and neither is the other.
    expect(screen.el.querySelector(".gf-detail-unit-level")?.textContent).toBe("1");
    expect(screen.el.querySelector(".gf-detail-job-level")?.textContent).toBe("2");
    // Measured, not hidden: the record prints the pair the Assay filed.
    expect(detail).toContain("Resolve");
    expect(detail).toContain("Attunement");
    expect(screen.el.querySelector(".gf-detail-resolve")?.textContent).toBe("72");
    expect(screen.el.querySelector(".gf-detail-attunement")?.textContent).toBe("38");
  });

  it("carries the chapter's dead beside the living, and never in the list", () => {
    const screen = new RosterScreen();
    screen.update(mockPartyView());
    const roll = screen.el.querySelector(".gf-roster-fallen");
    expect(roll?.textContent).toContain("Ivo Brace");
    expect(roll?.textContent).toContain("Fell at Foundry Floor Nine");
    expect(roll?.querySelector(".gf-fallen-roll")?.classList.contains("is-compact")).toBe(true);
    expect(screen.el.querySelector('.gf-menu-entry[data-entry="ivo-brace"]')).toBeNull();
  });

  it("shows no roll at all while nobody has been lost", () => {
    const screen = new RosterScreen();
    screen.update(mockPartyView({ fallen: [] }));
    expect(screen.el.querySelector(".gf-roster-fallen")?.textContent).toBe("");
  });

  it("opens the per-unit actions and emits the screen intent", () => {
    const { intents, calls } = recordingIntents();
    const screen = new RosterScreen({ intents });
    screen.update(mockPartyView());

    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path).toEqual(["roster", "roster-actions-rowen"]);
    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "openLearning", args: ["rowen"] });
  });
});

describe("CampaignSelectScreen", () => {
  const view = (): CampaignSelectView => ({
    campaigns: [
      {
        campaignId: "foundry-chapter",
        name: "The Foundry Chapter",
        description: "Rowen Corvane's commission into the House Watch.",
        encounterCount: 5,
        file: { engagementsClosed: 2 },
        unreadable: null,
      },
      {
        campaignId: "works-skirmishes",
        name: "The Works - Skirmishes",
        description: "Standing engagements in the Corvane works.",
        encounterCount: 1,
        file: null,
        unreadable: null,
      },
    ],
  });

  it("lists every campaign and says which has a record on file", () => {
    const screen = new CampaignSelectScreen();
    screen.update(view());
    const entries = [...screen.el.querySelectorAll<HTMLElement>(".gf-menu-entry")];
    expect(entries.map((node) => node.dataset["entry"])).toEqual([
      "foundry-chapter",
      "works-skirmishes",
    ]);
    expect(entries[0]?.textContent).toContain("The Foundry Chapter");
    expect(entries[0]?.textContent).toContain("Filed");
    // "New file" read as a button. It is a state, and it says so.
    expect(entries[1]?.textContent).toContain("No save yet");
    expect(entries[1]?.textContent).not.toContain("New file");
  });

  it("names the game in text, above its filing cabinet", () => {
    const screen = new CampaignSelectScreen();
    screen.update(view());
    const mark = screen.el.querySelector(".gf-register-mark");
    expect(mark?.querySelector(".gf-register-title")?.textContent).toBe("GREYFALL");
    expect(mark?.querySelector(".gf-register-genre")?.textContent).toContain("tactics RPG");
    // Text only: the logo art is commissioned separately.
    expect(mark?.querySelector("img")).toBeNull();
  });

  it("says the verb once, on the first menu of the session", () => {
    resetVerbHint();
    const first = new CampaignSelectScreen();
    first.update(view());
    expect(first.el.querySelector(".gf-verb-hint")?.textContent).toContain("press Enter to confirm");

    const second = new CampaignSelectScreen();
    second.update(view());
    const hint = second.el.querySelector(".gf-verb-hint");
    expect(hint?.textContent).toBe("");
    expect(hint?.classList.contains("is-hidden")).toBe(true);
  });

  it("puts the description, the engagement count, and the record beside the list", () => {
    const screen = new CampaignSelectScreen();
    screen.update(view());
    const detail = screen.el.querySelector(".gf-campaign-detail")?.textContent ?? "";
    expect(detail).toContain("Rowen Corvane's commission");
    expect(detail).toContain("5 engagements");
    expect(detail).toContain("2 of 5 closed");
    expect(screen.el.querySelector(".gf-campaign-detail .gf-plate-stamp")?.textContent).toBe(
      "FILED",
    );
  });

  it("reads the record of whichever campaign the cursor is on", () => {
    const screen = new CampaignSelectScreen();
    screen.update(view());
    screen.menus.handleKey(key("ArrowDown"));
    const detail = screen.el.querySelector(".gf-campaign-detail")?.textContent ?? "";
    expect(detail).toContain("Standing engagements");
    expect(detail).toContain("1 engagement");
    expect(detail).not.toContain("1 engagements");
    expect(detail).toContain("Nothing on file");
    expect(screen.el.querySelector(".gf-campaign-detail .gf-plate-stamp")?.textContent).toBe("NEW");
  });

  it("hands the picked campaign's id back, from the keyboard and the mouse", () => {
    const picked: string[] = [];
    const screen = new CampaignSelectScreen({ onPick: (id) => picked.push(id) });
    screen.update(view());

    screen.menus.handleKey(key("Enter"));
    expect(picked).toEqual(["foundry-chapter"]);

    screen.el
      .querySelector<HTMLElement>('.gf-menu-entry[data-entry="works-skirmishes"]')!
      .click();
    expect(picked).toEqual(["foundry-chapter", "works-skirmishes"]);
  });

  it("cannot be escaped out of: it is the only way into a campaign", () => {
    const screen = new CampaignSelectScreen();
    screen.update(view());
    screen.menus.handleKey(key("Escape"));
    expect(screen.menus.depth).toBe(1);
  });

  it("shows a record that will not open as unreadable, never as a new file", () => {
    const screen = new CampaignSelectScreen();
    const broken = view();
    screen.update({
      campaigns: [{ ...broken.campaigns[0]!, file: null, unreadable: "Unsupported save version 2" }],
    });
    const entry = screen.el.querySelector<HTMLElement>(".gf-menu-entry");
    expect(entry?.textContent).toContain("Unreadable");
    expect(entry?.textContent).not.toContain("No save yet");
    const detail = screen.el.querySelector(".gf-campaign-detail")?.textContent ?? "";
    expect(detail).toContain("Unsupported save version 2");
    expect(detail).not.toContain("Nothing on file");
    expect(screen.el.querySelector(".gf-campaign-detail .gf-plate-stamp")?.textContent).toBe(
      "UNREADABLE",
    );
  });
});

describe("UnitSheetScreen", () => {
  it("renders stats, equipment, and learned abilities", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const text = screen.el.textContent ?? "";
    expect(text).toContain("Standing (Enforcer)");
    expect(text).toContain("320");
    expect(text).toContain("Shock Maul");
    expect(text).toContain("Watch Cuirass");
    expect(text).toContain("Pin");
  });

  // "RECORD hides every stat that matters": Move, Jump, Speed, Phys, Mag and
  // Evade decide every turn and none of them were named on the record.
  it("prints every stat the rules read off the unit", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const text = screen.el.textContent ?? "";
    for (const label of ["Speed", "Phys", "Mag", "Move", "Jump", "Evade"]) {
      expect(text, label).toContain(label);
    }
    expect(screen.el.querySelector(".gf-stat-move .gf-field-value")?.textContent).toBe("3");
    expect(screen.el.querySelector(".gf-stat-jump .gf-field-value")?.textContent).toBe("2");
    // One unit per stat: Evade is the percentage, and it says so here too.
    expect(screen.el.querySelector(".gf-stat-evade .gf-field-value")?.textContent).toBe("8%");
  });

  it("names the two level tracks so Level 1 and level 2 stop contradicting", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const record = screen.el.querySelector(".gf-sheet-record")?.textContent ?? "";
    expect(record).toContain("Unit Level");
    expect(record).toContain("Job Level (Enforcer)");
    expect(screen.el.querySelector(".gf-unit-level .gf-field-value")?.textContent).toBe("1");
    expect(screen.el.querySelector(".gf-job-level .gf-field-value")?.textContent).toBe("2 of 8");
  });

  it("says where the Standing came from and which job holds it", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const rule = screen.el.querySelector(".gf-sheet-rule")?.textContent ?? "";
    expect(rule).toContain("10 Standing for every action");
    expect(rule).toContain("banked into the job it fought in");
    expect(rule).toContain("only if the battle is won");
  });

  it("tells an empty ability slot how to get filled", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const empties = [...screen.el.querySelectorAll<HTMLElement>(".gf-slot-empty")];
    expect(empties).toHaveLength(3);
    for (const slot of empties) {
      expect(slot.textContent).toContain("Learn one from a job, then equip it here");
    }
    expect(screen.el.textContent).not.toContain("Unassigned");
  });

  it("keeps a filled slot as the ability's name", () => {
    const screen = new UnitSheetScreen();
    screen.update(
      mockUnitSheetView({
        passives: [
          { slot: "reaction", abilityName: "Baton Answer" },
          { slot: "support", abilityName: null },
          { slot: "movement", abilityName: null },
        ],
      }),
    );
    expect(screen.el.querySelectorAll(".gf-slot-empty")).toHaveLength(2);
    expect(screen.el.textContent).toContain("Baton Answer");
  });

  it("prints what a learned ability does, not only what it is for", () => {
    const screen = new UnitSheetScreen();
    screen.update(mockUnitSheetView());
    const pin = screen.el.querySelector<HTMLElement>('.gf-ability[data-ability="pin"]');
    expect(pin?.querySelector(".gf-ability-mechanics")?.textContent).toContain(
      "Damage Weapon 80% kinetic",
    );
    expect(pin?.querySelector(".gf-ability-text")?.textContent).toContain("Watch doctrine");
  });

  it("hands the page back on the cancel key", () => {
    const { intents, calls } = recordingIntents();
    const screen = new UnitSheetScreen({ intents });
    screen.update(mockUnitSheetView());
    screen.attach(document);
    document.dispatchEvent(key("Escape"));
    expect(calls).toEqual([{ name: "closeScreen", args: [] }]);
    screen.destroy();
  });

  it("stops listening once it is torn down", () => {
    const { intents, calls } = recordingIntents();
    const screen = new UnitSheetScreen({ intents });
    screen.update(mockUnitSheetView());
    screen.attach(document);
    screen.destroy();
    document.dispatchEvent(key("Escape"));
    expect(calls).toHaveLength(0);
  });
});

describe("EquipmentScreen", () => {
  it("reports the shared field kit without offering to equip it", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    const kit = screen.el.querySelector(".gf-field-kit")?.textContent ?? "";
    expect(kit).toContain("Coagulant Vial");
    expect(kit).toContain("Cinder Flask");
    const slots = [...screen.el.querySelectorAll<HTMLElement>('[data-menu="equipment-slots"] .gf-menu-entry')];
    expect(slots.map((node) => node.dataset["entry"])).not.toContain("consumable");
    // Named once. The header carried the same list the stock panel now carries.
    expect(screen.el.querySelector(".gf-equipment .gf-satchel")).toBeNull();
  });

  it("says so when the satchel is empty", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView({ satchel: [] }));
    expect(screen.el.querySelector(".gf-field-kit .gf-plate-stamp")?.textContent).toBe("0 IN STOCK");
  });

  it("says what else would fit, and says it differently for an occupied slot", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    // Weapon is worn and the only other weapon in stock is a Conduit's.
    expect(screen.el.querySelector(".gf-equip-detail .gf-detail-note")?.textContent).toBe(
      "Nothing else in stock fits this slot.",
    );

    for (let i = 0; i < 2; i++) screen.menus.handleKey(key("ArrowDown"));
    expect(screen.el.querySelector(".gf-equip-detail .gf-detail-note")?.textContent).toBe(
      "1 piece in stock would fit.",
    );
  });

  it("filters candidates by slot and flags kit the job cannot bear", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());

    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path).toEqual(["equipment-slots", "equipment-options-weapon"]);
    const options = [...screen.el.querySelectorAll<HTMLElement>('[data-menu="equipment-options-weapon"] .gf-menu-entry')];
    expect(options.map((node) => node.dataset["entry"])).toEqual(["__unequip", "shock-maul", "tap-rod"]);
    const tapRod = options.find((node) => node.dataset["entry"] === "tap-rod");
    expect(tapRod?.classList.contains("is-disabled")).toBe(true);
    expect(tapRod?.title).toBe("Enforcer cannot bear Conduit gear");
  });

  it("previews stat deltas as the before and after they are", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());

    for (let i = 0; i < 3; i++) screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path.at(-1)).toBe("equipment-options-body");
    screen.menus.handleKey(key("ArrowDown"));
    const detail = screen.el.querySelector(".gf-equip-detail")?.textContent ?? "";
    expect(detail).toContain("Watch Cuirass");
    // "+24" is a number with nothing to measure it against.
    expect(detail).toContain("HP 58 → 82 (+24)");
    expect(detail).toContain("Speed 7 → 6 (-1)");
  });

  it("keeps one unit per stat: points stay points, Evade stays a percentage", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());

    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path.at(-1)).toBe("equipment-options-shield");
    const shield = screen.el.querySelector<HTMLElement>(
      '[data-menu="equipment-options-shield"] .gf-menu-entry[data-entry="riot-shield"]',
    );
    expect(shield?.textContent).toContain("Evade +12%");
    shield!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(screen.el.querySelector(".gf-equip-detail")?.textContent).toContain(
      "Evade 8% → 20% (+12%)",
    );
  });

  it("counts what an empty slot could actually take", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    const head = screen.el.querySelector<HTMLElement>(
      '[data-menu="equipment-slots"] .gf-menu-entry[data-entry="head"]',
    );
    // The Yard Helm is the one head piece an Enforcer can bear.
    expect(head?.textContent).toContain("Empty — 1 available");
  });

  it("names the kit a job can carry, never the internal tag", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    const tags = screen.el.querySelector(".gf-equip-tags")?.textContent ?? "";
    expect(tags).toContain("Heavy armour");
    expect(tags).toContain("Enforcer arms");
    expect(tags).not.toContain("heavy-armor");
    expect(tags).not.toContain("enforcer-arms");
  });

  it("prints the item's prose exactly once", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    for (let i = 0; i < 3; i++) screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    screen.menus.handleKey(key("ArrowDown"));
    const detail = screen.el.querySelector(".gf-equip-detail")?.textContent ?? "";
    const prose = "Corvane-stamped riot plate";
    expect(detail.split(prose)).toHaveLength(2);
    // And the line above it is the piece's figures, not the same sentence again.
    expect(screen.el.querySelector(".gf-equip-detail .gf-detail-sub")?.textContent).not.toContain(
      prose,
    );
  });

  it("lists the field kit as stock, with what each thing does", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView());
    const kit = screen.el.querySelector(".gf-field-kit");
    expect(kit?.querySelector(".gf-plate-stamp")?.textContent).toBe("4 IN STOCK");
    const vial = kit?.querySelector<HTMLElement>('.gf-kit-entry[data-item="coagulant-vial"]');
    expect(vial?.textContent).toContain("Coagulant Vial");
    expect(vial?.textContent).toContain("x3");
    expect(vial?.textContent).toContain("Self or ally");
    expect(vial?.textContent).toContain("Recovery 30");
    expect(kit?.textContent).toContain("does not come back");
  });

  it("says the satchel is empty in the stock list too", () => {
    const screen = new EquipmentScreen();
    screen.update(mockEquipmentView({ satchel: [] }));
    expect(screen.el.querySelector(".gf-field-kit")?.textContent).toContain(
      "Nothing in the satchel.",
    );
  });

  it("emits equipItem and unequips through Remove", () => {
    const { intents, calls } = recordingIntents();
    const screen = new EquipmentScreen({ intents });
    screen.update(mockEquipmentView());

    screen.menus.handleKey(key("Enter"));
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "equipItem", args: ["rowen", "weapon", null] });
    expect(screen.menus.path).toEqual(["equipment-slots"]);

    screen.menus.handleKey(key("Enter"));
    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "equipItem", args: ["rowen", "weapon", "shock-maul"] });
  });
});

describe("DeploymentScreen", () => {
  it("shows the field kit that goes out with the formation", () => {
    const screen = new DeploymentScreen();
    screen.update(mockDeploymentView());
    expect(screen.el.querySelector(".gf-satchel")?.textContent).toBe(
      "Field kit: Coagulant Vial x3 · Cinder Flask x1",
    );
  });
});

describe("BattleResultsScreen", () => {
  it("prints the banked Standing, the job levels it bought, and the fallen", () => {
    const screen = new BattleResultsScreen();
    screen.update(mockBattleResultsView());
    const text = screen.el.textContent ?? "";

    expect(screen.el.querySelector(".gf-screen-title")?.textContent).toBe("Field Held");
    expect(text).toContain("Standing banked");
    expect(screen.el.querySelector(".gf-record .gf-plate-stamp")?.textContent).toBe("150");
    expect(text).toContain("+110");
    expect(text).toContain("Enforcer level 3");
    expect(screen.el.querySelector(".gf-record-gain")?.textContent).toBe(" +1");

    const fallen = screen.el.querySelector(".gf-fallen");
    expect(fallen?.querySelector(".gf-plate-stamp")?.textContent).toBe("1 STRUCK");
    expect(fallen?.textContent).toContain("Ivo Brace");
    expect(fallen?.textContent).toContain("Machinist · Level 3");
    expect(fallen?.textContent).toContain("Fell at Foundry Floor Nine");
  });

  it("marks Standing banked by somebody who did not come back", () => {
    const screen = new BattleResultsScreen();
    screen.update(mockBattleResultsView());
    const struck = screen.el.querySelector<HTMLElement>('.gf-record-row[data-unit="ivo-brace"]');
    expect(struck?.classList.contains("is-struck")).toBe(true);
    expect(struck?.textContent).toContain("struck from the roster");
  });

  it("waits for the player: nothing but the advance closes it", () => {
    let filed = 0;
    const screen = new BattleResultsScreen({ onAdvance: () => (filed += 1) });
    screen.update(mockBattleResultsView());

    // No timer, no auto-dismiss: the component has no clock to run down.
    expect("tick" in screen).toBe(false);
    expect(filed).toBe(0);

    const advance = screen.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="advance"]');
    expect(advance?.textContent).toContain("File the record");
    advance!.click();
    expect(filed).toBe(1);
  });

  it("banks nothing on a loss and keeps the roster whole", () => {
    const screen = new BattleResultsScreen();
    screen.update(
      mockBattleResultsView({
        result: "loss",
        headline: "Line Broken",
        standing: [],
        standingTotal: 0,
        fallen: [],
        consumed: [],
        advanced: false,
      }),
    );
    expect(screen.el.classList.contains("is-loss")).toBe(true);
    const text = screen.el.textContent ?? "";
    expect(text).toContain("Nothing banked");
    expect(text).toContain("A loss changes nothing");
    expect(screen.el.querySelector(".gf-fallen")).toBeNull();
  });
});

describe("ChapterCloseScreen", () => {
  it("closes on the chapter's account and its dead", () => {
    const screen = new ChapterCloseScreen();
    screen.update(mockChapterCloseView());
    const text = screen.el.textContent ?? "";
    expect(text).toContain("The Foundry Chapter");
    expect(text).toContain("The Marshaling Yard");
    expect(text).toContain("Still standing");
    expect(text).toContain("Rowen Corvane");
    expect(screen.el.querySelector(".gf-fallen")?.textContent).toContain("Ivo Brace");
    expect(
      screen.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="advance"]')?.textContent,
    ).toContain("Close the record");
  });
});
