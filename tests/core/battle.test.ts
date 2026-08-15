import { describe, expect, it } from "vitest";
import {
  activeUnit,
  applyCommand,
  BASIC_ATTACK_ID,
  createBattle,
  getUnit,
  reachableTiles,
  targetableTiles,
  type Command,
  type GameState,
} from "../../src/core/index.js";
import type { TileCoord } from "../../src/data/index.js";
import { coordEq, hasTile, loadContent, rowen } from "./fixtures.js";

const ROWEN = "rowen";
const PROVOCATEUR = "provocateur-a";

function start(): GameState {
  return createBattle(loadContent(), "e1-marshaling-yard", [rowen()], [
    { unitId: ROWEN, position: { x: 3, y: 5 }, facing: "north" },
  ]).state;
}

function manhattan(a: TileCoord, b: TileCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Close, then swing: a fixed policy, so the whole battle is reproducible. */
function rowensTurn(state: GameState): Command[] {
  const commands: Command[] = [];
  const target = getUnit(state, PROVOCATEUR);
  const self = getUnit(state, ROWEN);
  if (target === null || self === null) return commands;

  if (!hasTile(targetableTiles(state, ROWEN, BASIC_ATTACK_ID), target.position)) {
    const options = reachableTiles(state, ROWEN)
      .filter((r) => r.canStop)
      .sort(
        (a, b) =>
          manhattan(a.tile, target.position) - manhattan(b.tile, target.position) ||
          a.tile.y - b.tile.y ||
          a.tile.x - b.tile.x,
      );
    const best = options[0];
    if (best !== undefined && !coordEq(best.tile, self.position)) {
      commands.push({ kind: "move", unitId: ROWEN, to: best.tile });
    }
  }
  return commands;
}

/** Play the tutorial battle out and return the command log that produced it. */
function playThrough(): { state: GameState; log: Command[] } {
  let state = start();
  const log: Command[] = [];
  const run = (cmd: Command): void => {
    const result = applyCommand(state, cmd);
    expect(result.error, `${cmd.kind} rejected: ${result.error?.message}`).toBeNull();
    state = result.state;
    log.push(cmd);
  };

  for (let guard = 0; guard < 300 && state.result === null; guard += 1) {
    const active = activeUnit(state);
    if (active === null) break;
    if (active.id !== ROWEN) {
      run({ kind: "endTurn", unitId: active.id });
      continue;
    }
    for (const cmd of rowensTurn(state)) run(cmd);
    const target = getUnit(state, PROVOCATEUR);
    if (target !== null && hasTile(targetableTiles(state, ROWEN, BASIC_ATTACK_ID), target.position)) {
      run({
        kind: "act",
        unitId: ROWEN,
        abilityId: BASIC_ATTACK_ID,
        target: { kind: "unit", unitId: PROVOCATEUR },
      });
    }
    if (state.result === null) run({ kind: "endTurn", unitId: ROWEN });
  }
  return { state, log };
}

describe("the Marshaling Yard", () => {
  it("opens with Maren Voss and the first unit's turn", () => {
    const opening = createBattle(loadContent(), "e1-marshaling-yard", [rowen()], [
      { unitId: ROWEN, position: { x: 3, y: 5 }, facing: "north" },
    ]);
    expect(opening.events[0]).toMatchObject({ type: "BattleStarted", encounterId: "e1-marshaling-yard" });
    const dialogue = opening.events.find((e) => e.type === "DialogueRequested");
    expect(dialogue?.lines[0]?.speaker).toBe("Maren Voss");
    expect(opening.events.some((e) => e.type === "TurnStarted")).toBe(true);
    expect(opening.state.units.map((u) => u.id)).toEqual([PROVOCATEUR, ROWEN]);
  });

  it("plays out to a win by routing the provocateur", () => {
    const { state } = playThrough();
    expect(state.result).toBe("win");
    expect(getUnit(state, PROVOCATEUR)?.downed).toBe(true);
    expect(getUnit(state, PROVOCATEUR)?.hp).toBe(0);
    expect(getUnit(state, ROWEN)?.downed).toBe(false);
    // 10 Standing per resolved action; Rowen only ever attacks.
    const attacks = state.units.find((u) => u.id === ROWEN)?.standingEarned ?? 0;
    expect(attacks % 10).toBe(0);
    expect(attacks).toBeGreaterThan(0);
  });

  it("rejects further commands once the battle is decided", () => {
    const { state } = playThrough();
    const result = applyCommand(state, { kind: "endTurn", unitId: ROWEN });
    expect(result.error?.code).toBe("battle-over");
  });
});

describe("determinism", () => {
  it("replays the same seed and command log to an identical state", () => {
    const first = playThrough();

    let replayed = start();
    for (const cmd of first.log) {
      const result = applyCommand(replayed, cmd);
      expect(result.error).toBeNull();
      replayed = result.state;
    }
    expect(replayed).toEqual(first.state);
    expect(JSON.stringify(replayed)).toBe(JSON.stringify(first.state));
  });

  it("produces the same event stream twice", () => {
    const a = playThrough();
    const b = playThrough();
    expect(b.log).toEqual(a.log);
    expect(b.state).toEqual(a.state);
  });

  it("round-trips through JSON without changing the battle", () => {
    const { state, log } = playThrough();
    const revived = JSON.parse(JSON.stringify(state)) as GameState;
    expect(revived).toEqual(state);

    let midway = start();
    for (const cmd of log.slice(0, Math.floor(log.length / 2))) {
      midway = applyCommand(midway, cmd).state;
    }
    const serialized = JSON.parse(JSON.stringify(midway)) as GameState;
    const fromMemory = log.slice(Math.floor(log.length / 2)).reduce((s, cmd) => applyCommand(s, cmd).state, midway);
    const fromJson = log
      .slice(Math.floor(log.length / 2))
      .reduce((s, cmd) => applyCommand(s, cmd).state, serialized);
    expect(fromJson).toEqual(fromMemory);
  });
});
