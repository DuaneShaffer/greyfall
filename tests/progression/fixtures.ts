import type { Ability, Campaign, Item, Job, Unit } from "../../src/data/index.js";
import { createCampaign, type CampaignState, type ProgressionContent } from "../../src/core/index.js";

// A self-contained content bench. `data/` is still growing under the content
// workstream, so the progression tests pin their own jobs, abilities, and items
// rather than asserting against numbers that are still being balanced.

const job = (id: string, overrides: Partial<Job> = {}): Job => ({
  schemaVersion: 1,
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  description: `Bench job: ${id}.`,
  prerequisites: {},
  statCurve: {
    hp: { growth: 10, multiplierPercent: 100 },
    charge: { growth: 4, multiplierPercent: 100 },
    speed: { growth: 4, multiplierPercent: 100 },
    phys: { growth: 6, multiplierPercent: 100 },
    mag: { growth: 4, multiplierPercent: 100 },
  },
  baseMove: 3,
  baseJump: 2,
  baseEvade: 5,
  innateAbilityIds: [],
  learnableAbilityIds: ["pin"],
  equipTags: ["enforcer-arms"],
  ...overrides,
});

export const ENFORCER: Job = job("enforcer", {
  learnableAbilityIds: ["pin", "brace", "riposte"],
  equipTags: ["enforcer-arms", "heavy-armor"],
});

export const CONDUIT: Job = job("conduit", {
  learnableAbilityIds: ["overload-cell", "sprint"],
  equipTags: ["conduit-gear"],
});

/** Gated behind Enforcer job level 3 — the prerequisite path under test. */
export const MACHINIST: Job = job("machinist", {
  prerequisites: { enforcer: 3 },
  learnableAbilityIds: ["rig"],
  equipTags: ["machinist-kit"],
});

export const PIN: Ability = {
  schemaVersion: 1,
  id: "pin",
  name: "Pin",
  description: "Hold the target in place.",
  jobId: "enforcer",
  standingCost: 100,
  slot: "action",
  targeting: {
    range: { min: 1, max: 1, vertical: 1 },
    area: { shape: "single" },
    requiresLos: true,
    validTargets: ["enemy"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "damage", damageType: "kinetic", amount: { base: "weapon", power: 80 } }],
};

export const BRACE: Ability = {
  schemaVersion: 1,
  id: "brace",
  name: "Brace",
  description: "Set your feet.",
  jobId: "enforcer",
  standingCost: 150,
  slot: "support",
  passive: { statMods: { hp: 6 } },
};

export const RIPOSTE: Ability = {
  schemaVersion: 1,
  id: "riposte",
  name: "Riposte",
  description: "Answer a blow.",
  jobId: "enforcer",
  standingCost: 200,
  slot: "reaction",
  trigger: "damaged",
  effects: [{ kind: "damage", damageType: "kinetic", amount: { base: "weapon", power: 50 } }],
};

export const OVERLOAD_CELL: Ability = {
  schemaVersion: 1,
  id: "overload-cell",
  name: "Overload Cell",
  description: "Force charge past the rated draw.",
  jobId: "conduit",
  standingCost: 250,
  slot: "action",
  targeting: {
    range: { min: 1, max: 4, vertical: 2 },
    area: { shape: "single" },
    requiresLos: true,
    validTargets: ["object"],
  },
  chargeCost: 8,
  castSpeed: 25,
  effects: [{ kind: "damageObject", amount: { base: "mag", power: 16 } }],
};

export const SPRINT: Ability = {
  schemaVersion: 1,
  id: "sprint",
  name: "Sprint",
  description: "Longer stride.",
  jobId: "conduit",
  standingCost: 50,
  slot: "movement",
  passive: { statMods: { move: 1 } },
};

export const RIG: Ability = {
  schemaVersion: 1,
  id: "rig",
  name: "Rig",
  description: "Bolt something together.",
  jobId: "machinist",
  standingCost: 120,
  slot: "action",
  targeting: {
    range: { min: 1, max: 1, vertical: 1 },
    area: { shape: "single" },
    requiresLos: false,
    validTargets: ["emptyTile"],
  },
  chargeCost: 0,
  castSpeed: null,
  effects: [{ kind: "spawnObject", object: "turret", hp: 10 }],
};

export const SHOCK_MAUL: Item = {
  schemaVersion: 1,
  id: "shock-maul",
  name: "Shock Maul",
  description: "Watch-issue maul.",
  equipTags: ["enforcer-arms"],
  price: 400,
  slot: "weapon",
  power: 9,
  damageType: "kinetic",
  range: { min: 1, max: 1, vertical: 1 },
};

export const LINE_ROD: Item = {
  schemaVersion: 1,
  id: "line-rod",
  name: "Line Rod",
  description: "Assay-issue tap rod.",
  equipTags: ["conduit-gear"],
  price: 300,
  slot: "weapon",
  power: 5,
  damageType: "arc",
  range: { min: 1, max: 1, vertical: 1 },
};

export const WATCH_PLATE: Item = {
  schemaVersion: 1,
  id: "watch-plate",
  name: "Watch Plate",
  description: "Riot plate.",
  equipTags: ["heavy-armor"],
  price: 250,
  slot: "body",
  statMods: { hp: 8, speed: -1 },
};

export const TONIC: Item = {
  schemaVersion: 1,
  id: "tonic",
  name: "Tonic",
  description: "Field coagulant.",
  equipTags: ["any"],
  price: 50,
  slot: "consumable",
  effects: [{ kind: "heal", amount: { base: "fixed", power: 20 } }],
};

export const BENCH: ProgressionContent = {
  jobs: { enforcer: ENFORCER, conduit: CONDUIT, machinist: MACHINIST },
  abilities: {
    pin: PIN,
    brace: BRACE,
    riposte: RIPOSTE,
    "overload-cell": OVERLOAD_CELL,
    sprint: SPRINT,
    rig: RIG,
  },
  items: {
    "shock-maul": SHOCK_MAUL,
    "line-rod": LINE_ROD,
    "watch-plate": WATCH_PLATE,
    tonic: TONIC,
  },
};

export const ROWEN: Unit = {
  schemaVersion: 1,
  id: "rowen",
  name: "Rowen Corvane",
  portraitId: "rowen",
  level: 1,
  jobId: "enforcer",
  disposition: { resolve: 72, attunement: 38 },
  learnedAbilityIds: ["pin"],
  equipment: { weapon: "shock-maul" },
};

export const VALE: Unit = {
  schemaVersion: 1,
  id: "vale",
  name: "Vale Tarn",
  level: 1,
  jobId: "conduit",
  disposition: { resolve: 50, attunement: 70 },
  learnedAbilityIds: [],
  equipment: {},
};

export const BENCH_UNITS: Record<string, Unit> = { rowen: ROWEN, vale: VALE };

export function benchCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    schemaVersion: 1,
    id: "bench-chapter",
    name: "Bench Chapter",
    description: "Progression test chapter.",
    encounterIds: ["e1-marshaling-yard", "e2-elsewhere"],
    startingRosterUnitIds: ["rowen", "vale"],
    startingStandingBonus: 300,
    startingInventory: [
      { itemId: "watch-plate", count: 1 },
      { itemId: "line-rod", count: 2 },
    ],
    ...overrides,
  };
}

export function benchState(overrides: Partial<Campaign> = {}): CampaignState {
  return createCampaign(benchCampaign(overrides), BENCH_UNITS);
}
