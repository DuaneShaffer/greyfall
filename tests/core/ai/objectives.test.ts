// The AI reading the encounter's own win/loss conditions: the unit a
// `unitReachesTiles` loss names runs for those tiles once it is losing, and a
// player-side `reachTiles` win pulls the party onto the tiles it wins on.

import { describe, expect, it } from "vitest";
import type { TileCoord } from "../../../src/data/index.js";
import { chooseCommand } from "../../../src/core/ai/index.js";
import { advanceTo } from "../fixtures.js";
import { at, unit, watchman, yardBattle } from "./fixtures.js";

/** The head of the yard: the tiles a runner is trying to get off the board by. */
const STAIR: TileCoord[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
];

const onStair = (tile: TileCoord): boolean => STAIR.some((t) => t.x === tile.x && t.y === tile.y);

/** A runner one step from the stair, with the Watch already on top of him. */
function pursuit(options: { hp?: number } = {}) {
  const state = advanceTo(
    yardBattle(
      [
        at(watchman("runner"), "enemy", { x: 0, y: 1 }, "south"),
        at(watchman("watch"), "player", { x: 0, y: 2 }, "north"),
      ],
      {
        id: "e-ai-pursuit",
        lossConditions: [
          { kind: "partyRout" },
          { kind: "unitReachesTiles", unitId: "runner", tiles: STAIR },
        ],
      },
    ),
    "runner",
  );
  if (options.hp !== undefined) unit(state, "runner").hp = options.hp;
  return state;
}

describe("objective awareness", () => {
  it("takes the stair it is named on rather than swinging one more time", () => {
    const command = chooseCommand(pursuit({ hp: 6 }));

    expect(command.kind).toBe("move");
    expect(command.kind === "move" && onStair(command.to)).toBe(true);
  });

  it("stands and fights while it is still winning", () => {
    const command = chooseCommand(pursuit());

    expect(command.kind === "move" && onStair(command.to)).toBe(false);
  });

  it("ignores an escape that names somebody else", () => {
    const state = advanceTo(
      yardBattle(
        [
          at(watchman("runner"), "enemy", { x: 0, y: 1 }, "south"),
          at(watchman("watch"), "player", { x: 0, y: 2 }, "north"),
        ],
        {
          id: "e-ai-someone-else",
          lossConditions: [
            { kind: "partyRout" },
            { kind: "unitReachesTiles", unitId: "nobody", tiles: STAIR },
          ],
        },
      ),
      "runner",
    );
    unit(state, "runner").hp = 6;

    const command = chooseCommand(state);
    expect(command.kind === "move" && onStair(command.to)).toBe(false);
  });

  it("walks a player unit onto the tiles the battle is won on", () => {
    const state = advanceTo(
      yardBattle(
        [
          at(watchman("scout"), "player", { x: 0, y: 1 }, "south"),
          at(watchman("guard"), "enemy", { x: 0, y: 2 }, "north"),
        ],
        { id: "e-ai-reach", winConditions: [{ kind: "reachTiles", tiles: STAIR }] },
      ),
      "scout",
    );

    const command = chooseCommand(state);
    expect(command.kind).toBe("move");
    expect(command.kind === "move" && onStair(command.to)).toBe(true);
  });
});
