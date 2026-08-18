/** @vitest-environment happy-dom */
// Two rows both stamped NEXT, a queue that said whose turn it was in colour on
// two rows out of six, and a reinforcement who arrived as a name nobody had seen:
// the three things the blind playtest could not read off the clock.

import { describe, expect, it } from "vitest";
import { TurnOrderStrip } from "../../src/ui/battle/turnOrder.js";
import type { Team } from "../../src/data/index.js";
import type { LogEntryView, TurnOrderEntryView } from "../../src/ui/state.js";

function queued(overrides: Partial<TurnOrderEntryView> = {}): TurnOrderEntryView {
  return {
    unitId: "rowen",
    name: "Rowen Corvane",
    jobName: "Enforcer",
    team: "player",
    kind: "turn",
    ticksUntil: 0,
    ...overrides,
  };
}

function join(unitId: string, name: string, team: Team, index: number): LogEntryView {
  return {
    index,
    kind: "join",
    turn: 3,
    tick: 40,
    actor: { id: unitId, name, team },
    targets: [],
    notes: [],
    text: `${name} takes the field at (3, 4) — ally`,
  };
}

function turnOf(unitId: string, name: string, team: Team, index: number): LogEntryView {
  return {
    index,
    kind: "turn",
    turn: 4,
    tick: 0,
    actor: { id: unitId, name, team },
    targets: [],
    notes: [],
    text: `Turn 4 — ${name}`,
  };
}

const rows = (strip: TurnOrderStrip): HTMLElement[] =>
  [...strip.el.querySelectorAll<HTMLElement>(".gf-turn-entry")];

const badges = (strip: TurnOrderStrip): string[] =>
  rows(strip).map((row) => row.querySelector(".gf-turn-ticks")?.textContent ?? "");

const joins = (strip: TurnOrderStrip): string[] =>
  [...strip.el.querySelectorAll<HTMLElement>(".gf-turn-join")].map(
    (row) => row.textContent ?? "",
  );

describe("TurnOrderStrip", () => {
  it("stamps exactly one NEXT, whatever else is tied at the line", () => {
    const strip = new TurnOrderStrip();
    strip.update({
      entries: [
        queued(),
        queued({ unitId: "maren", name: "Maren Voss", ticksUntil: 0 }),
        queued({ unitId: "provocateur-a", name: "Provocateur", team: "enemy", ticksUntil: 0 }),
        queued({ unitId: "provocateur-b", name: "Runner", team: "enemy", ticksUntil: 12 }),
      ],
    });

    expect(badges(strip)).toEqual(["Now", "Next", "Then", "+12"]);
    expect(rows(strip).filter((row) => row.classList.contains("is-next"))).toHaveLength(1);
    expect(rows(strip).filter((row) => row.classList.contains("is-now"))).toHaveLength(1);
  });

  it("keeps the tick countdown when nobody is tied", () => {
    const strip = new TurnOrderStrip();
    strip.update({
      entries: [
        queued(),
        queued({ unitId: "maren", name: "Maren Voss", ticksUntil: 3 }),
        queued({ unitId: "provocateur-a", name: "Provocateur", team: "enemy", ticksUntil: 9 }),
      ],
    });

    // A countdown says more than a badge does; NEXT is only for the row a
    // countdown would have printed as +0.
    expect(badges(strip)).toEqual(["Now", "+3", "+9"]);
    expect(rows(strip).filter((row) => row.classList.contains("is-next"))).toHaveLength(0);
  });

  it("gives every row its faction, in colour and in words", () => {
    const strip = new TurnOrderStrip();
    strip.update({
      entries: [
        queued(),
        queued({ unitId: "provocateur-a", name: "Provocateur", team: "enemy", ticksUntil: 7 }),
        queued({ unitId: "yard-hand", name: "Yard Hand", team: "neutral", ticksUntil: 11 }),
      ],
    });

    expect(rows(strip).map((row) => row.dataset["team"])).toEqual([
      "player",
      "enemy",
      "neutral",
    ]);
    expect(rows(strip)[0]?.className).toContain("is-player");
    expect(rows(strip)[1]?.className).toContain("is-enemy");
    expect(rows(strip)[2]?.className).toContain("is-neutral");
    expect(rows(strip).map((row) => row.getAttribute("aria-label"))).toEqual([
      "Rowen Corvane — ally — Now",
      "Provocateur — hostile — +7",
      "Yard Hand — neutral — +11",
    ]);
  });

  it("announces a mid-battle join with the side it came in on", () => {
    const strip = new TurnOrderStrip();
    const entries = [queued(), queued({ unitId: "maren", name: "Maren Voss", ticksUntil: 6 })];
    strip.update({ entries }, [join("maren", "Maren Voss", "player", 12)]);

    expect(joins(strip)).toEqual(["Maren Voss joins the line — ally"]);
    expect(strip.el.querySelector(".gf-turn-join")?.className).toContain("is-player");
  });

  it("stands the band down once the newcomer has taken a turn", () => {
    const strip = new TurnOrderStrip();
    const entries = [queued({ unitId: "maren", name: "Maren Voss" })];
    const log = [join("maren", "Maren Voss", "player", 12)];
    strip.update({ entries }, log);
    expect(joins(strip)).toHaveLength(1);

    strip.update({ entries }, [...log, turnOf("maren", "Maren Voss", "player", 13)]);
    expect(joins(strip)).toEqual([]);
  });

  it("names an enemy reinforcement as hostile", () => {
    const strip = new TurnOrderStrip();
    strip.update({ entries: [queued()] }, [
      join("provocateur-c", "Watch Sergeant", "enemy", 20),
    ]);

    expect(joins(strip)).toEqual(["Watch Sergeant joins the line — hostile"]);
  });

  it("still gives a charging cast its own line", () => {
    const strip = new TurnOrderStrip();
    strip.update({
      entries: [
        queued(),
        queued({
          unitId: "conduit-a",
          name: "Conduit",
          team: "enemy",
          kind: "cast",
          abilityName: "Overload Cell",
          ticksUntil: 8,
        }),
      ],
    });

    const cast = rows(strip)[1];
    expect(cast?.className).toContain("is-cast");
    expect(cast?.querySelector(".gf-turn-detail")?.textContent).toBe("Charging · Overload Cell");
  });
});
