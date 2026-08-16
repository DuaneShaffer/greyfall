/**
 * Golden replays: the release gate for engine changes that are supposed to be
 * behaviour-preserving. A recorded run is the whole event stream of a seeded
 * AI-vs-AI battle on a shipped encounter; a change that moves one byte of it
 * has changed the game.
 *
 * Re-record deliberately (a rebalance, a new rule) and never to make a test
 * pass: `GREYFALL_RECORD_GOLDENS=1 npx vitest run tests/golden`.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type BattleEvent } from "../../src/core/index.js";
import { simContent } from "../../src/sim/content.js";
import { runBattle } from "../../src/sim/harness.js";
import { authoredDeployment } from "../../src/sim/sweeps.js";

export const GOLDEN_ENCOUNTERS = [
  "e1-marshaling-yard",
  "e2-foundry-floor-nine",
  "e3-tallow-row",
  "e4-refinery-three",
  "e5-charterhouse-steps",
] as const;

export const GOLDEN_SEEDS = [101, 202, 303] as const;

export const GOLDEN_COMMAND_CAP = 800;

export interface GoldenReplay {
  encounterId: string;
  mapId: string;
  seed: number;
  outcome: string;
  winner: string;
  turns: number;
  clock: number;
  commands: number;
  capped: boolean;
  rejectedCommands: number;
  objectsDestroyed: string[];
  events: BattleEvent[];
}

export function fixtureDir(): string {
  return join(import.meta.dirname, "fixtures");
}

export function fixturePath(encounterId: string, seed: number): string {
  return join(fixtureDir(), `${encounterId}-${seed}.json`);
}

export function replay(encounterId: string, seed: number): GoldenReplay {
  const content = simContent();
  const deployed = authoredDeployment(content, encounterId);
  if (deployed === null) throw new Error(`golden: cannot deploy ${encounterId}`);
  const record = runBattle(
    content.library,
    { kind: "encounter", encounterId, party: deployed.party, deployment: deployed.deployment },
    seed,
    { commandCap: GOLDEN_COMMAND_CAP, keepEvents: true },
  );
  return {
    encounterId: record.encounterId,
    mapId: record.mapId,
    seed: record.seed,
    outcome: record.outcome,
    winner: record.winner,
    turns: record.turns,
    clock: record.clock,
    commands: record.commands,
    capped: record.capped,
    rejectedCommands: record.rejectedCommands,
    objectsDestroyed: record.objectsDestroyed,
    events: record.events ?? [],
  };
}

/** The bytes the gate compares. Trailing newline so the fixtures are ordinary text files. */
export function serialize(record: GoldenReplay): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function readFixture(encounterId: string, seed: number): string {
  return readFileSync(fixturePath(encounterId, seed), "utf8");
}

export function writeFixture(encounterId: string, seed: number, body: string): void {
  writeFileSync(fixturePath(encounterId, seed), body, "utf8");
}
