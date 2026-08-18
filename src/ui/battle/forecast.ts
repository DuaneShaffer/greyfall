import { Child, Component, el, labelledValue, meter, plate, portrait, replaceChildren } from "../dom.js";
import { UiIntents, withIntents } from "../intents.js";
import type { TargetRef } from "../intents.js";
import { ForecastTargetView, ForecastView, formatDamageRange, formatSigned } from "../state.js";

const ATTACK_ANGLE_LABELS: Record<NonNullable<ForecastTargetView["attackAngle"]>, string> = {
  front: "Front",
  side: "Side",
  back: "Back",
};

/** An item costs no flux and no cast time; what it costs is itself. */
function costLine(view: ForecastView): string {
  if (view.item) return `Field kit · ${view.item.remaining} left after use`;
  return `Charge ${view.chargeCost} · ${view.castSpeed === null ? "Immediate" : `Cast ${view.castSpeed}`}`;
}

/** What the order is aimed at when nobody is standing in it. */
function aimLabel(aimedAt: TargetRef): string {
  if (aimedAt.kind === "tile") return `Tile ${aimedAt.tile.x}, ${aimedAt.tile.y}`;
  if (aimedAt.kind === "object") return "Machinery";
  // A unit aim with no rows means the area resolved somewhere else entirely;
  // calling that "The caster" was the panel naming the wrong party.
  if (aimedAt.kind === "unit") return "The aimed target";
  return "The caster";
}

/**
 * The id of whoever the cursor was on. Machinery rides in `unitId` on a target
 * row, so both kinds answer against the same field.
 */
function aimedId(view: ForecastView): string | null {
  const aimedAt = view.aimedAt;
  if (aimedAt.kind === "unit") return aimedAt.unitId;
  if (aimedAt.kind === "object") return aimedAt.objectId;
  if (aimedAt.kind === "self") return view.attacker.unitId;
  return null;
}

/**
 * Rows with the aimed one first. Core hands them over sorted by unit id, so an
 * ally standing in the blast could take the headline — the portrait, the name,
 * the numbers in the exchange — off the enemy the order was actually sent at.
 */
function stagedTargets(view: ForecastView): ForecastTargetView[] {
  const id = aimedId(view);
  const at = id === null ? -1 : view.targets.findIndex((target) => target.unitId === id);
  if (at <= 0) return view.targets;
  return [view.targets[at] as ForecastTargetView, ...view.targets.filter((_, index) => index !== at)];
}

/** Same side as the caster, and about to take the caster's damage. */
function caughtAlly(view: ForecastView, target: ForecastTargetView): boolean {
  return (
    view.attacker.team !== undefined &&
    target.team === view.attacker.team &&
    target.damage?.kind === "damage"
  );
}

/** How the strip names the friendly fire: who, or how many. */
function allyWarning(caught: readonly ForecastTargetView[], casterId: string): string {
  if (caught.length > 1) return `CAUGHT IN THE LINE — ${caught.length} ALLIES`;
  const only = caught[0];
  if (only === undefined) return "";
  if (only.unitId === casterId) return "CAUGHT IN THE LINE — THE CASTER";
  return `CAUGHT IN THE LINE — ALLY: ${only.name}`;
}

/**
 * A line's length is measured from the caster, not from the cursor: aimed past
 * it, the order resolves short and the tile under the cursor is not in the area
 * at all. Say the number of tiles it does carry.
 */
function aimMissLine(view: ForecastView): string | null {
  const area = view.area;
  if (area === undefined || area.coversAimedTarget) return null;
  return `Out of the line — ${view.abilityName} carries ${area.tiles} ${
    area.tiles === 1 ? "tile" : "tiles"
  }`;
}

/**
 * The commit-or-back-out panel: who, at what odds, for how much.
 *
 * Two shapes, one contract. Resting — an Operate cursor forecasting the machine
 * it is on — it is the compact panel answering the order column from the other
 * corner. **Armed**, with a target staged and the stamp the next thing the
 * player presses, it takes the bottom of the frame and faces the two parties
 * across the numbers, the way FFT hands its bottom bar to the confirmation and
 * Tactics Ogre Reborn frames a target (UI_DESIGN §8a).
 *
 * `lock()` is what the controller calls the instant an action is sent. The
 * numbers stay on screen — they are the record of what was ordered — but the
 * stamp goes dead and the panel stands down to its compact shape: the takeover
 * exists to ask a question, and once the order is away there is no question and
 * no reason to hold the field under a bar.
 */
export class ForecastPanel implements Component<ForecastView | null> {
  readonly el: HTMLElement;
  private readonly intents: UiIntents;
  private view: ForecastView | null = null;
  private readonly body: HTMLElement;
  private readonly stampEl: HTMLElement;
  private commitButton: HTMLButtonElement | null = null;
  private locked = false;

  constructor(options: { intents?: Partial<UiIntents> } = {}) {
    this.intents = withIntents(options.intents);
    this.body = el("div", { class: "gf-forecast-body" });
    const plateEl = plate("Forecast", "");
    this.stampEl = plateEl.querySelector(".gf-plate-stamp") as HTMLElement;
    this.el = el("section", {
      class: "gf-panel is-live gf-forecast is-empty",
      attrs: { "aria-label": "Action forecast" },
      children: [plateEl, this.body],
    });
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** True while the panel is holding the bottom of the frame for a decision. */
  get isArmed(): boolean {
    return this.el.classList.contains("is-armed");
  }

  update(view: ForecastView | null): void {
    // A committed order is the record of what was sent (UI_DESIGN §8): the
    // redraw that follows it carries no pending selection, and letting that
    // blank the panel threw the numbers away the instant they mattered most.
    // It holds until a new order is staged, or `clear()` closes the field.
    if (view === null && this.locked) return;
    this.view = view;
    this.locked = false;
    this.el.classList.toggle("is-empty", view === null);
    this.el.classList.remove("is-locked");
    if (!view) {
      this.commitButton = null;
      this.el.classList.remove("is-armed");
      this.stampEl.textContent = "";
      replaceChildren(this.body, [el("p", { class: "gf-empty-note", text: "No action selected." })]);
      return;
    }
    this.draw(view, view.armed);
  }

  /** Commits the pending action against what it is actually aimed at. */
  confirm(): void {
    const view = this.view;
    if (!view || this.locked) return;
    if (view.targets.length === 0 && view.effects.length === 0) return;
    if (view.operate) {
      this.intents.activateObject(view.attacker.unitId, view.operate.objectId);
      return;
    }
    if (view.item) {
      this.intents.confirmItemTarget(view.attacker.unitId, view.item.itemId, view.aimedAt);
      return;
    }
    this.intents.confirmTarget(view.attacker.unitId, view.abilityId, view.aimedAt);
  }

  /**
   * The order is away: keep the numbers, kill the stamp, and give the field
   * back. The committed record lives in the compact panel — the same corner it
   * occupies at rest — so the presentation the numbers describe is not playing
   * underneath a bar that is no longer asking anything.
   */
  lock(): void {
    const view = this.view;
    if (view === null) return;
    if (this.isArmed) this.draw(view, false);
    this.locked = true;
    this.el.classList.add("is-locked");
    if (this.commitButton !== null) {
      this.commitButton.disabled = true;
      this.commitButton.textContent = "Committed";
    }
  }

  /** Empty the panel whether or not it is holding a committed record. */
  clear(): void {
    this.locked = false;
    this.update(null);
  }

  destroy(): void {
    this.el.remove();
  }

  private draw(view: ForecastView, armed: boolean): void {
    // An action aimed at nothing has nothing to commit. Offering the stamp
    // anyway is the panel claiming an outcome it cannot produce — but an
    // ability whose whole payload is a machine laid on an empty tile has an
    // outcome and no rows, and refusing it was the same lie in reverse.
    const empty = view.targets.length === 0 && view.effects.length === 0;
    const commit = el("button", {
      class: "gf-button gf-forecast-commit",
      attrs: { type: "button", ...(empty ? { disabled: true } : {}) },
      text: "Commit",
    });
    commit.addEventListener("click", () => this.confirm());
    this.commitButton = commit;
    // Backing out needs a target the mouse can hit; Escape alone strands a
    // player who is only clicking.
    const withdraw = el("button", {
      class: "gf-button is-quiet gf-forecast-withdraw",
      attrs: { type: "button" },
      text: "Withdraw",
    });
    withdraw.addEventListener("click", () => {
      if (this.locked) return;
      this.intents.cancelSelection(view.attacker.unitId);
    });
    const footer = el("footer", { class: "gf-forecast-footer", children: [commit, withdraw] });
    this.el.classList.toggle("is-armed", armed);
    this.el.classList.toggle(
      "has-ally-caught",
      view.targets.some((target) => caughtAlly(view, target)),
    );
    this.stampEl.textContent = armed ? "CONFIRM" : "";
    replaceChildren(
      this.body,
      armed ? this.stage(view, empty, footer) : this.compact(view, empty, footer),
    );
  }

  /** The resting shape: a side panel reporting the order it is previewing. */
  private compact(view: ForecastView, empty: boolean, footer: HTMLElement): Child[] {
    return [
      ...this.warnings(view),
      el("header", {
        class: "gf-forecast-head",
        children: [
          portrait(view.attacker.portraitId, view.attacker.name, {
            jobName: view.attacker.jobName,
          }),
          el("div", {
            class: "gf-forecast-heading",
            children: [
              el("h2", { class: "gf-forecast-ability", text: view.abilityName }),
              el("p", {
                class: "gf-forecast-attacker",
                text: `${view.attacker.name} · ${view.attacker.jobName}`,
              }),
              el("p", { class: "gf-forecast-cost", text: costLine(view) }),
            ],
          }),
        ],
      }),
      ...this.abilityEffects(view),
      empty
        ? el("p", { class: "gf-empty-note", text: "Nothing in the area. Pick another tile." })
        : view.targets.length === 0
          ? el("p", { class: "gf-empty-note", text: "Nobody in the area — the order stands." })
          : el("ul", {
              class: "gf-forecast-targets",
              children: stagedTargets(view).map((target) => this.renderTarget(view, target)),
            }),
      footer,
    ];
  }

  /**
   * What the panel must say before anything else, because it is the reading the
   * numbers underneath cannot correct: the order landed somewhere other than
   * where it was pointed, or it lands on the caster's own side.
   */
  private warnings(view: ForecastView): Child[] {
    const out: Child[] = [];
    const miss = aimMissLine(view);
    if (miss !== null) out.push(el("p", { class: "gf-forecast-warning is-aim", text: miss }));
    const caught = view.targets.filter((target) => caughtAlly(view, target));
    if (caught.length > 0) {
      out.push(
        el("p", {
          class: "gf-forecast-warning is-ally",
          text: allyWarning(caught, view.attacker.unitId),
        }),
      );
    }
    return out;
  }

  /**
   * The confirm takeover: actor on one side, target on the other, the exchange
   * between them, and the stamp under it. Everything the compact panel says is
   * still said — the extra rows of an area order run underneath rather than
   * being folded away, because a panel never hides what it can do.
   */
  private stage(view: ForecastView, empty: boolean, footer: HTMLElement): Child[] {
    const ordered = stagedTargets(view);
    const primary = ordered[0];
    const rest = ordered.slice(1);
    return [
      ...this.warnings(view),
      el("div", {
        class: "gf-forecast-stage",
        children: [
          this.party("actor", {
            name: view.attacker.name,
            detail: view.attacker.jobName,
            ...(view.attacker.portraitId === undefined ? {} : { portraitId: view.attacker.portraitId }),
            ...(view.attacker.hp === undefined ? {} : { hp: view.attacker.hp }),
            ...(view.attacker.maxHp === undefined ? {} : { maxHp: view.attacker.maxHp }),
          }),
          el("div", {
            class: "gf-forecast-exchange",
            children: [
              el("h2", { class: "gf-forecast-ability", text: view.abilityName }),
              el("p", { class: "gf-forecast-cost", text: costLine(view) }),
              ...(primary === undefined ? [] : this.numbers(primary)),
              empty
                ? el("p", { class: "gf-empty-note", text: "Nothing in the area. Pick another tile." })
                : null,
            ],
          }),
          primary === undefined
            ? el("div", {
                class: "gf-forecast-party is-target is-none",
                children: [
                  el("h3", { class: "gf-forecast-party-name", text: aimLabel(view.aimedAt) }),
                  el("p", {
                    class: "gf-empty-note",
                    text: "Nobody in the area — the order stands.",
                  }),
                ],
              })
            : this.party("target", {
                name: primary.name,
                detail: primary.jobName ?? (this.isObject(primary) ? "Machinery" : ""),
                ...(primary.portraitId === undefined ? {} : { portraitId: primary.portraitId }),
                ...(primary.hp === undefined ? {} : { hp: primary.hp }),
                ...(primary.maxHp === undefined ? {} : { maxHp: primary.maxHp }),
                machine: this.isObject(primary),
                ally: caughtAlly(view, primary),
              }),
        ],
      }),
      ...this.abilityEffects(view),
      ...(rest.length === 0
        ? []
        : [
            el("ul", {
              class: "gf-forecast-targets",
              children: rest.map((target) => this.renderTarget(view, target)),
            }),
          ]),
      footer,
    ];
  }

  /** One facing panel of the takeover: who this is, and what shape they are in. */
  private party(
    side: "actor" | "target",
    subject: {
      name: string;
      detail: string;
      portraitId?: string;
      hp?: number;
      maxHp?: number;
      machine?: boolean;
      ally?: boolean;
    },
  ): HTMLElement {
    const hp =
      subject.hp === undefined || subject.maxHp === undefined
        ? null
        : el("div", {
            class: "gf-unit-bar gf-forecast-party-hp",
            children: [
              el("span", { class: "gf-field-label", text: subject.machine === true ? "Integrity" : "HP" }),
              el("span", { class: "gf-field-value", text: `${subject.hp} / ${subject.maxHp}` }),
              meter("is-hp", subject.hp, subject.maxHp),
            ],
          });
    return el("div", {
      class: `gf-forecast-party is-${side}${subject.machine === true ? " is-object" : ""}${
        subject.ally === true ? " is-ally" : ""
      }`,
      children: [
        subject.machine === true
          ? null
          : portrait(subject.portraitId, subject.name, { jobName: subject.detail }),
        el("div", {
          class: "gf-forecast-party-ident",
          children: [
            el("h3", { class: "gf-forecast-party-name", text: subject.name }),
            subject.detail === ""
              ? null
              : el("p", { class: "gf-forecast-party-job", text: subject.detail }),
          ],
        }),
        hp,
      ],
    });
  }

  /** Consequences that belong to the order rather than to anyone standing in it. */
  private abilityEffects(view: ForecastView): Child[] {
    if (view.effects.length === 0) return [];
    return [
      el("ul", {
        class: "gf-forecast-effects is-ability",
        children: view.effects.map((line) => el("li", { class: "gf-forecast-effect", text: line })),
      }),
    ];
  }

  /** Machinery has no facing and no portrait: it reads as a machine, in copper. */
  private isObject(target: ForecastTargetView): boolean {
    return target.attackAngle === null && target.portraitId === undefined;
  }

  private renderTarget(view: ForecastView, target: ForecastTargetView): HTMLElement {
    const ally = caughtAlly(view, target);
    return el("li", {
      class: `gf-forecast-target${this.isObject(target) ? " is-object" : ""}${
        ally ? " is-ally" : ""
      }`,
      data: { unit: target.unitId },
      children: [
        portrait(target.portraitId, target.name),
        el("div", {
          class: "gf-forecast-numbers",
          children: [
            el("h3", { class: "gf-forecast-target-name", text: target.name }),
            ally ? el("p", { class: "gf-forecast-ally-flag", text: "ALLY" }) : null,
            ...this.numbers(target),
          ],
        }),
      ],
    });
  }

  /** What lands on one target: the odds, the amount, and everything else. */
  private numbers(target: ForecastTargetView): Child[] {
    const damage = target.damage;
    const damageLabel = damage?.kind === "heal" ? "Recovery" : "Damage";
    const damageText =
      damage === null
        ? "—"
        : `${formatDamageRange(damage)}${damage.damageType ? ` ${damage.damageType}` : ""}`;
    // An order that deals no damage prints no damage row: "Damage —" beside a
    // three-turn buff reads as "this does nothing".
    const silent = target.statuses.length === 0 && target.effects.length === 0;
    return [
      labelledValue("Hit", `${target.hitChancePercent}%`, "gf-forecast-hit"),
      ...(damage === null ? [] : [labelledValue(damageLabel, damageText, "gf-forecast-damage")]),
      el("ul", {
        class: "gf-forecast-statuses",
        children: silent
          ? [el("li", { class: "gf-forecast-status is-none", text: "No further effect" })]
          : target.statuses.map((status) =>
              el("li", {
                class: "gf-forecast-status",
                text: `${status.name} ${status.chancePercent}%`,
              }),
            ),
      }),
      ...(target.effects.length === 0
        ? []
        : [
            el("ul", {
              class: "gf-forecast-effects",
              children: target.effects.map((line) =>
                el("li", { class: "gf-forecast-effect", text: line }),
              ),
            }),
          ]),
      el("p", {
        class: "gf-forecast-modifiers",
        text: [
          target.attackAngle ? ATTACK_ANGLE_LABELS[target.attackAngle] : null,
          target.heightAdvantage === 0 ? null : `Height ${formatSigned(target.heightAdvantage)}`,
        ]
          .filter((part): part is string => part !== null)
          .join(" · "),
      }),
    ];
  }
}
