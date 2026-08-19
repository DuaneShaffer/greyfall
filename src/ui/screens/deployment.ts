import type { TileCoord } from "../../data/index.js";
import { Component, el, meter, plate, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import { MenuDef, MenuStack } from "../menu.js";
import { DeploymentView } from "../state.js";
import { summarizeSatchel } from "./equipment.js";

const LIST_ID = "deployment-roster";

/**
 * What a deployment tile is called. The formation is given as coordinates and
 * asked for by pointing, which left nothing to say out loud: a letter is the
 * name the rail, the field chips and the copy can all use for the same tile.
 */
export function deploySlotLabel(index: number): string {
  if (index < 0) return "—";
  return index < 26 ? String.fromCharCode(65 + index) : `T${index + 1}`;
}

/**
 * One of the other side, as the formation screen reads them. The formation is
 * the last decision made before the shooting, and it used to be made against a
 * board the player could not read: no names, no condition, no allegiance.
 */
export interface DeployOppositionView {
  unitId: string;
  name: string;
  /** The faction as the record names it, or the job when that is all there is. */
  faction: string;
  hp: number;
  maxHp: number;
  tile: TileCoord;
}

/** The eight words a bearing gets. Anything finer is precision nobody can use. */
const BEARINGS: readonly string[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

const centroid = (tiles: readonly TileCoord[]): TileCoord | null => {
  if (tiles.length === 0) return null;
  const sum = tiles.reduce((acc, tile) => ({ x: acc.x + tile.x, y: acc.y + tile.y }), { x: 0, y: 0 });
  return { x: sum.x / tiles.length, y: sum.y / tiles.length };
};

/**
 * Which way the opposition is, from the formation's own tiles. North is -y, so
 * the angle is measured off screen-north and rounded to the nearest eighth.
 */
export function bearingWord(from: TileCoord, to: TileCoord): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return "on top of the formation";
  const eighths = Math.round((Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8;
  return BEARINGS[eighths] ?? "north";
}

export interface DeploymentOptions {
  intents?: Partial<UiIntents>;
  /** The unit waiting for a tile changed; the app lights the map for it. */
  onPlacing?: (unitId: string | null) => void;
}

/**
 * Formation. The list is only half of it: the other half is the battlefield
 * behind this rail, where the deployment tiles are lit and clickable.
 *
 * Pick a unit here, then click a tile out there. Confirming a listed unit still
 * drops it on the first free tile, so a player who wants one click to start
 * never has to learn the placement flow at all.
 */
export class DeploymentScreen implements Component<DeploymentView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly intents: UiIntents;
  private readonly options: DeploymentOptions;
  private readonly detail: HTMLElement;
  private readonly headerEl: HTMLElement;
  /** Lives across redraws: a hover must never rebuild the rows under the hand. */
  private readonly intelEl: HTMLElement;
  private view: DeploymentView | null = null;
  private placing: string | null = null;
  private opposition: readonly DeployOppositionView[] = [];
  /** Whoever the pointer is over, on the field or in the rail. */
  private hovered: string | null = null;
  /** A refusal the rail owes an answer for: a tile picked with nothing held. */
  private refusal: string | null = null;

  constructor(options: DeploymentOptions = {}) {
    this.options = options;
    this.intents = withIntents(options.intents);
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-deploy-detail" });
    this.intelEl = el("p", { class: "gf-detail-sub gf-deploy-intel is-hidden" });
    this.headerEl = el("p", { class: "gf-screen-note" });
    this.el = el("section", {
      class: "gf-screen gf-deployment",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [el("h1", { class: "gf-screen-title", text: "Formation" }), this.headerEl],
            }),
          ],
        }),
        el("div", { class: "gf-deploy-rail", children: [this.menus.el, this.detail] }),
      ],
    });
  }

  /** The unit waiting for a tile, or null when nothing is being placed. */
  get placingUnitId(): string | null {
    return this.placing;
  }

  /**
   * Who else is on the board. Not in `DeploymentView` — the encounter's roster
   * is not part of the formation the player is staging — so the app hands it
   * over separately, off the same map data the battle is built from.
   */
  setOpposition(entries: readonly DeployOppositionView[]): void {
    this.opposition = entries;
    if (this.view !== null) this.renderSlots(this.view);
  }

  /**
   * The field's own hover, routed in: a sprite under the pointer names itself
   * here. Both sides answer — a deployed unit by name, one of the opposition
   * with its condition and allegiance beside it.
   */
  hoverUnit(unitId: string | null): void {
    if (this.hovered === unitId) return;
    this.hovered = unitId;
    this.syncHover();
  }

  /**
   * Move the highlight over the rows already on screen. Rebuilding them under a
   * resting pointer is what costs a player their next click (UI_DESIGN §8).
   */
  private syncHover(): void {
    for (const node of this.detail.querySelectorAll<HTMLElement>("[data-unit]")) {
      node.classList.toggle("is-hovered", node.dataset["unit"] === this.hovered);
    }
    const read = this.opposition.find((entry) => entry.unitId === this.hovered) ?? null;
    this.intelEl.textContent =
      read === null ? "" : `${read.name} · ${read.faction} · ${read.hp} of ${read.maxHp}`;
    this.intelEl.classList.toggle("is-hidden", read === null);
  }

  update(view: DeploymentView): void {
    this.view = view;
    if (this.placing !== null && !view.candidates.some((c) => c.unitId === this.placing)) {
      this.setPlacing(null);
    }
    const assigned = view.slots.filter((slot) => slot.unitId !== null).length;
    this.headerEl.textContent = `${view.encounterName} · ${assigned} of ${view.maxDeployed} tiles filled`;
    const menu = this.rosterMenu(view);
    if (this.menus.path[0] === LIST_ID) this.menus.refresh(menu);
    else this.menus.push(menu);
    this.renderSlots(view);
  }

  /**
   * A click on the field. Returns true when the formation consumed it: placing
   * the held unit, or picking up whoever already stands there.
   */
  pickTile(tileIndex: number): boolean {
    const view = this.view;
    const slot = view?.slots[tileIndex];
    if (view === undefined || view === null || slot === undefined) return false;
    if (this.placing !== null) {
      this.refusal = null;
      this.intents.assignDeployment(this.placing, tileIndex);
      this.setPlacing(null);
      return true;
    }
    if (slot.unitId !== null) {
      this.refusal = null;
      this.setPlacing(slot.unitId);
      return true;
    }
    // An empty tile with nobody in hand is a refusal, and it used to be silence.
    this.refusal = `Tile ${deploySlotLabel(tileIndex)} is empty. Confirm a unit first.`;
    this.renderSlots(view);
    return false;
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private setPlacing(unitId: string | null): void {
    if (this.placing === unitId) return;
    this.placing = unitId;
    this.options.onPlacing?.(unitId);
    if (this.view !== null) {
      this.menus.refresh(this.rosterMenu(this.view));
      this.renderSlots(this.view);
    }
  }

  private rosterMenu(view: DeploymentView): MenuDef {
    const held = view.candidates.find((candidate) => candidate.unitId === this.placing) ?? null;
    return {
      id: LIST_ID,
      title: "Deploy",
      cancellable: false,
      entries: [
        ...view.candidates.map((candidate) => ({
          id: candidate.unitId,
          label: candidate.name,
          detail: `${candidate.jobName} ${candidate.level}`,
          note:
            candidate.unitId === this.placing
              ? "Pick a tile on the field"
              : candidate.assigned
                ? "On the field"
                : "Reserve",
          disabled: candidate.unavailableReason !== undefined,
          ...(candidate.unavailableReason === undefined
            ? {}
            : { disabledReason: candidate.unavailableReason }),
        })),
        ...(held !== null && held.assigned
          ? [{ id: "__withdraw", label: `Withdraw ${held.name}`, note: "Back to reserve" }]
          : []),
        {
          id: "__confirm",
          // Not "Move out": that is the bar's button, which opens *this* screen.
          // Two controls with one label, one screen apart, is how a player comes
          // to press the wrong one.
          label: "Take the field",
          note: "Starts the engagement",
          disabled: !view.canConfirm,
          ...(view.blockedReason === undefined ? {} : { disabledReason: view.blockedReason }),
        },
        { id: "__back", label: "Back to roster" },
      ],
      onSelect: (entry) => {
        if (entry.id === "__confirm") {
          this.intents.confirmDeployment();
          return;
        }
        if (entry.id === "__back") {
          this.intents.closeScreen();
          return;
        }
        if (entry.id === "__withdraw") {
          const unitId = this.placing;
          this.setPlacing(null);
          if (unitId !== null) this.intents.toggleDeployment(unitId);
          return;
        }
        // Confirming the held unit again puts it down. A unit already on the
        // field is picked up for re-placement; a reserve unit takes the first
        // free tile, so one-click starts never need the placement flow.
        if (this.placing === entry.id) {
          this.setPlacing(null);
          return;
        }
        const candidate = view.candidates.find((c) => c.unitId === entry.id);
        if (candidate?.assigned === true) {
          this.setPlacing(entry.id);
          return;
        }
        this.intents.toggleDeployment(entry.id);
      },
      onCancel: () => {
        if (this.placing !== null) {
          this.setPlacing(null);
          return;
        }
        this.intents.closeScreen();
      },
    };
  }

  private renderSlots(view: DeploymentView): void {
    const held = view.candidates.find((candidate) => candidate.unitId === this.placing) ?? null;
    replaceChildren(this.detail, [
      // Who is across the board comes first. It was the last thing in the rail
      // and it fell off the bottom of it: the whole answer to "no enemy intel at
      // formation time" was below the fold at the window size the finding was
      // filed from, behind a scrollbar nobody had a reason to look for.
      ...this.oppositionBlock(view),
      plate("Deployment tiles", `${view.slots.length}`),
      el("ul", {
        class: "gf-deploy-slots",
        children: view.slots.map((slot, index) => this.renderSlot(slot, index)),
      }),
      el("div", {
        class: "gf-detail-body",
        children: [
          el("p", {
            class: "gf-detail-note",
            text:
              held === null
                ? "Confirm a unit to field it, or click one already out there to move them."
                : `Holding ${held.name}. Click a lit tile on the field, or a lettered row above.`,
          }),
          this.refusal === null
            ? null
            : el("p", { class: "gf-detail-note is-refused", text: this.refusal }),
          el("p", { class: "gf-detail-sub gf-satchel", text: summarizeSatchel(view.satchel) }),
          ...view.candidates
            .filter((candidate) => candidate.assigned)
            .map((candidate) =>
              el("div", {
                class: "gf-unit-bar",
                data: { unit: candidate.unitId },
                title: `${candidate.name} · ${candidate.jobName} ${candidate.level}`,
                children: [
                  el("span", { class: "gf-field-label", text: candidate.name }),
                  el("span", {
                    class: "gf-field-value",
                    text: `${candidate.hp} / ${candidate.maxHp}`,
                  }),
                  meter("is-hp", candidate.hp, candidate.maxHp),
                ],
              }),
            ),
        ],
      }),
    ]);
    this.syncHover();
  }

  /** One deployment tile: its letter, its coordinate, and whoever holds it. */
  private renderSlot(slot: DeploymentView["slots"][number], index: number): HTMLElement {
    const held = slot.unitId !== null;
    const node = el("li", {
      class: [
        "gf-deploy-slot",
        held ? "" : "is-empty",
        this.placing === null ? "" : "is-placing",
      ]
        .filter((part) => part !== "")
        .join(" "),
      data: { tile: `${index}`, ...(slot.unitId === null ? {} : { unit: slot.unitId }) },
      title: slot.unitName ?? `Tile ${deploySlotLabel(index)} · empty`,
      children: [
        el("span", { class: "gf-deploy-chip", text: deploySlotLabel(index) }),
        el("span", { class: "gf-field-label", text: `${slot.tile.x},${slot.tile.y}` }),
        el("span", { class: "gf-field-value", text: slot.unitName ?? "—" }),
        el("span", { class: "gf-menu-detail", text: held ? "" : "empty" }),
      ],
    });
    // The rail is the half of this screen that is certainly clickable: the tiles
    // themselves are 3D geometry behind it, and a player who cannot hit one had
    // no other way to place a unit.
    node.addEventListener("click", () => void this.pickTile(index));
    node.addEventListener("mouseenter", () => this.hoverUnit(slot.unitId));
    node.addEventListener("mouseleave", () => this.hoverUnit(null));
    return node;
  }

  /** Who is across the board, and which way they are. */
  private oppositionBlock(view: DeploymentView): (HTMLElement | null)[] {
    if (this.opposition.length === 0) return [];
    const ours = centroid(view.slots.map((slot) => slot.tile));
    const theirs = centroid(this.opposition.map((entry) => entry.tile));
    const bearing =
      ours === null || theirs === null
        ? null
        : `The opposition forms up to the ${bearingWord(ours, theirs)}.`;
    return [
      plate("Opposition", `${this.opposition.length}`),
      bearing === null ? null : el("p", { class: "gf-detail-note gf-deploy-bearing", text: bearing }),
      el("ul", {
        class: "gf-deploy-opposition",
        children: this.opposition.map((entry) =>
          el("li", {
            class: "gf-deploy-enemy",
            data: { unit: entry.unitId },
            title: `${entry.name} · ${entry.faction} · ${entry.hp}/${entry.maxHp}`,
            children: [
              el("span", { class: "gf-field-label", text: entry.name }),
              el("span", { class: "gf-field-value", text: `${entry.hp} / ${entry.maxHp}` }),
              el("span", { class: "gf-menu-detail", text: entry.faction }),
            ],
          }),
        ),
      }),
      this.intelEl,
    ];
  }
}
