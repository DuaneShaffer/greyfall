import { describe, expect, it } from "vitest";
import { getObject } from "../../../src/core/index.js";
import type { TileCoord } from "../../../src/data/index.js";
import { buildContext, chooseCommand } from "../../../src/core/ai/index.js";
import { distanceField } from "../../../src/core/ai/field.js";
import { moveProfile, reachableTiles } from "../../../src/core/rules/movement.js";
import { advanceTo } from "../fixtures.js";
import { at, conduit, medic, playTurn, unit, watchman, yardBattle } from "./fixtures.js";

/** The four tiles the yard cell flares onto when it goes up. */
const BLAST: TileCoord[] = [
  { x: 0, y: 1 },
  { x: 2, y: 1 },
  { x: 1, y: 0 },
  { x: 1, y: 2 },
];

const isBlast = (tile: TileCoord): boolean => BLAST.some((t) => t.x === tile.x && t.y === tile.y);

describe("target choice", () => {
  it("kills the wounded unit rather than chipping the healthy one", () => {
    const state = advanceTo(
      yardBattle([
        at(watchman("brute"), "enemy", { x: 3, y: 2 }, "north"),
        at(watchman("hale"), "player", { x: 3, y: 3 }, "north"),
        at(watchman("wounded"), "player", { x: 3, y: 1 }, "north"),
      ]),
      "brute",
    );
    unit(state, "wounded").hp = 5;

    const played = playTurn(state);
    const act = played.commands.find((command) => command.kind === "act");
    expect(act).toBeDefined();
    expect(act?.kind === "act" && act.target).toEqual({ kind: "unit", unitId: "wounded" });
    expect(unit(played.state, "wounded").downed).toBe(true);
    expect(unit(played.state, "hale").hp).toBe(unit(state, "hale").hp);
  });

  it("does not spend flux on chip damage when the cell would hurt nobody", () => {
    const state = advanceTo(
      yardBattle([
        at(conduit("sparks"), "enemy", { x: 3, y: 4 }, "north"),
        at(watchman("mark"), "player", { x: 4, y: 4 }, "north"),
      ]),
      "sparks",
    );
    const flux = unit(state, "sparks").charge;

    const played = playTurn(state);
    expect(played.commands.map((command) => command.kind)).toContain("act");
    for (const command of played.commands) {
      expect(command.kind === "act" && command.abilityId).not.toBe("overload-cell");
    }
    expect(unit(played.state, "sparks").charge).toBe(flux);
  });
});

describe("battlefield systems", () => {
  it("overloads the flux cell two hostiles are standing beside", () => {
    const state = advanceTo(
      yardBattle([
        at(conduit("sparks"), "enemy", { x: 3, y: 1 }, "west"),
        at(watchman("left"), "player", { x: 0, y: 1 }, "north"),
        at(watchman("right"), "player", { x: 2, y: 1 }, "north"),
      ]),
      "sparks",
    );

    const played = playTurn(state);
    const act = played.commands.find((command) => command.kind === "act");
    expect(act).toEqual({
      kind: "act",
      unitId: "sparks",
      abilityId: "overload-cell",
      target: { kind: "object", objectId: "yard-cell" },
    });
    const charging = played.state.charges.some((charge) => charge.abilityId === "overload-cell");
    const blown = getObject(played.state, "yard-cell")?.destroyed === true;
    expect(charging || blown).toBe(true);
  });

  it("cuts power to the lift a hostile is parked on", () => {
    const state = advanceTo(
      yardBattle([
        at(watchman("brute"), "enemy", { x: 3, y: 3 }, "north"),
        at(watchman("perch"), "player", { x: 5, y: 4 }, "north"),
      ]),
      "brute",
    );
    expect(getObject(state, "freight-lift")?.powered).toBe(true);

    const played = playTurn(state);
    expect(played.commands).toContainEqual({
      kind: "activateObject",
      unitId: "brute",
      objectId: "yard-switch",
    });
    expect(getObject(played.state, "freight-lift")?.powered).toBe(false);
  });

  it("stays out of a damaged cell's blast radius when another tile fights as well", () => {
    const roster = () => [
      at(watchman("brute"), "enemy", { x: 3, y: 3 }, "north"),
      at(watchman("mark"), "player", { x: 2, y: 0 }, "north"),
    ];

    const damaged = advanceTo(yardBattle(roster()), "brute");
    const cell = damaged.map.objects.find((obj) => obj.def.id === "yard-cell");
    expect(cell).toBeDefined();
    if (cell !== undefined) cell.hp = 5;

    // (2,1) is in the blast, reachable, and just as good a place to swing from.
    const reachable = reachableTiles(damaged, unit(damaged, "brute"));
    expect(reachable.some((tile) => tile.canStop && isBlast(tile.tile))).toBe(true);

    const risky = playTurn(damaged);
    expect(isBlast(unit(risky.state, "brute").position)).toBe(false);
    expect(risky.commands.some((command) => command.kind === "act")).toBe(true);

    // With the cell already gone the same unit happily uses the same tile.
    const cleared = advanceTo(yardBattle(roster()), "brute");
    const gone = cleared.map.objects.find((obj) => obj.def.id === "yard-cell");
    if (gone !== undefined) {
      gone.destroyed = true;
      gone.hp = 0;
    }
    expect(isBlast(unit(playTurn(cleared).state, "brute").position)).toBe(true);
  });
});

describe("positioning", () => {
  it("closes by path, not by Manhattan distance", () => {
    const state = advanceTo(
      yardBattle([
        at(watchman("brute"), "enemy", { x: 5, y: 0 }, "south"),
        at(watchman("mark"), "player", { x: 3, y: 3 }, "north"),
      ]),
      "brute",
    );
    const field = distanceField(state, moveProfile(state, unit(state, "brute")), { x: 3, y: 3 });
    const map = state.content.map;
    const cost = (tile: TileCoord): number => field[tile.y * map.width + tile.x] ?? Number.MAX_SAFE_INTEGER;

    // (5,3) and (3,1) are both two tiles away as the crow flies; the crate
    // stack makes one of them twice as far to actually walk.
    expect(cost({ x: 5, y: 3 })).toBe(4);
    expect(cost({ x: 3, y: 1 })).toBe(2);

    const command = chooseCommand(state);
    expect(command.kind).toBe("move");
    if (command.kind !== "move") return;
    const options = reachableTiles(state, unit(state, "brute")).filter((tile) => tile.canStop);
    const best = Math.min(...options.map((option) => cost(option.tile)));
    expect(cost(command.to)).toBe(best);
  });

  it("ends the turn with its back to nobody", () => {
    const state = advanceTo(
      yardBattle([
        at(watchman("brute"), "enemy", { x: 3, y: 1 }, "north"),
        at(watchman("mark"), "player", { x: 3, y: 4 }, "north"),
      ]),
      "brute",
    );
    // Pretend the turn is spent, so the only thing left to pick is a facing.
    state.activeTurn = { unitId: "brute", moved: true, acted: true };

    expect(chooseCommand(state)).toEqual({ kind: "wait", unitId: "brute", facing: "south" });
  });
});

describe("job expression", () => {
  it("reads an archetype out of the kit the unit carries", () => {
    const state = advanceTo(
      yardBattle([
        at(watchman("brute"), "enemy", { x: 3, y: 3 }, "north"),
        at(conduit("sparks"), "enemy", { x: 4, y: 4 }, "north"),
        at(medic("mercy"), "enemy", { x: 5, y: 5 }, "north"),
        at(watchman("mark"), "player", { x: 0, y: 0 }, "south"),
      ]),
      "brute",
    );
    const archetype = (id: string): string => buildContext(state, unit(state, id)).kit.archetype;
    expect(archetype("brute")).toBe("melee");
    expect(archetype("sparks")).toBe("artillery");
    expect(archetype("mercy")).toBe("support");
  });

  it("keeps a support kit alive behind its friends and healing them", () => {
    const state = advanceTo(
      yardBattle([
        at(medic("mercy"), "enemy", { x: 3, y: 3 }, "north"),
        at(watchman("shield"), "enemy", { x: 3, y: 2 }, "north"),
        at(watchman("mark"), "player", { x: 4, y: 4 }, "north"),
      ]),
      "mercy",
    );
    unit(state, "shield").hp = 20;

    const played = playTurn(state);
    const act = played.commands.find((command) => command.kind === "act");
    expect(act?.kind === "act" && act.abilityId).toBe("ai-mend");
    expect(act?.kind === "act" && act.target).toEqual({ kind: "unit", unitId: "shield" });
    expect(unit(played.state, "shield").hp).toBeGreaterThan(20);

    const before = Math.abs(3 - 4) + Math.abs(3 - 4);
    const after = unit(played.state, "mercy").position;
    expect(Math.abs(after.x - 4) + Math.abs(after.y - 4)).toBeGreaterThan(before);
  });

  it("advances anyway once a standoff has dragged on", () => {
    const holding = () =>
      advanceTo(
        yardBattle([
          at(conduit("sparks"), "enemy", { x: 5, y: 0 }, "south"),
          at(watchman("mark"), "player", { x: 2, y: 3 }, "north"),
        ]),
        "sparks",
      );

    expect(chooseCommand(holding()).kind).toBe("wait");

    const stalled = holding();
    stalled.turn = 40;
    const command = chooseCommand(stalled);
    expect(command.kind).toBe("move");
    if (command.kind !== "move") return;
    const field = distanceField(stalled, moveProfile(stalled, unit(stalled, "sparks")), { x: 2, y: 3 });
    const map = stalled.content.map;
    expect(field[command.to.y * map.width + command.to.x]).toBeLessThan(
      field[0 * map.width + 5] ?? Number.MAX_SAFE_INTEGER,
    );
  });
});
