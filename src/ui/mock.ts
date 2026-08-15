import type { Ability, DialogueLine, Item, Job, Status, Unit } from "../data/index.js";
import type {
  ActionMenuView,
  EquipSlot,
  EquipSlotView,
  EquipmentView,
  ForecastView,
  ItemOptionView,
  LearningView,
  PartyView,
  SkillsetView,
  StatLineView,
  TurnOrderView,
  UnitSheetView,
  UnitView,
} from "./state.js";
import { EQUIP_SLOTS, EQUIP_SLOT_LABELS, STAT_LABELS } from "./state.js";

// Mock state for the harness and tests. Content marked "real" below is copied
// verbatim from data/*.json (tests/ui/mock.test.ts fails if it drifts) so the
// layouts and register are honest; the rest is UI-only scaffolding that will be
// replaced by core selectors next phase.

// --- real content -----------------------------------------------------------

export const enforcerJob: Job = {
  schemaVersion: 1,
  id: "enforcer",
  name: "Enforcer",
  description:
    "House Watch line soldier. Riot armor, shock maul, and the training to hold a street against a crowd.",
  prerequisites: {},
  statCurve: {
    hp: { growth: 11, multiplierPercent: 120 },
    charge: { growth: 2, multiplierPercent: 70 },
    speed: { growth: 4, multiplierPercent: 100 },
    phys: { growth: 8, multiplierPercent: 115 },
    mag: { growth: 2, multiplierPercent: 75 },
  },
  baseMove: 3,
  baseJump: 2,
  baseEvade: 8,
  innateAbilityIds: [],
  learnableAbilityIds: ["pin"],
  equipTags: ["enforcer-arms", "heavy-armor", "shield"],
  spriteId: "enforcer",
};

export const conduitJob: Job = {
  schemaVersion: 1,
  id: "conduit",
  name: "Conduit",
  description:
    "Assay-licensed attuned. Taps lines, kills machines, and turns the map's own charge into a weapon.",
  prerequisites: {},
  statCurve: {
    hp: { growth: 7, multiplierPercent: 85 },
    charge: { growth: 9, multiplierPercent: 130 },
    speed: { growth: 4, multiplierPercent: 100 },
    phys: { growth: 3, multiplierPercent: 70 },
    mag: { growth: 8, multiplierPercent: 125 },
  },
  baseMove: 3,
  baseJump: 1,
  baseEvade: 5,
  innateAbilityIds: [],
  learnableAbilityIds: ["overload-cell"],
  equipTags: ["conduit-gear", "light-armor"],
  spriteId: "conduit",
};

export const pinAbility: Ability = {
  schemaVersion: 1,
  id: "pin",
  name: "Pin",
  description: "Drive the maul low and hold the target in place. Watch doctrine for taking someone alive.",
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
  effects: [
    { kind: "damage", damageType: "kinetic", amount: { base: "weapon", power: 80 } },
    { kind: "applyStatus", statusId: "stunned", chance: 60 },
  ],
};

export const overloadCellAbility: Ability = {
  schemaVersion: 1,
  id: "overload-cell",
  name: "Overload Cell",
  description:
    "Force charge into a machine past its rated draw until something gives. Voids the Assay warranty and usually the machine.",
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

export const shockMaul: Item = {
  schemaVersion: 1,
  id: "shock-maul",
  name: "Shock Maul",
  description: "Watch-issue maul with a flux discharge head. Officially a compliance tool.",
  equipTags: ["enforcer-arms"],
  price: 400,
  slot: "weapon",
  power: 9,
  damageType: "kinetic",
  range: { min: 1, max: 1, vertical: 1 },
};

export const stunnedStatus: Status = {
  schemaVersion: 1,
  id: "stunned",
  name: "Stunned",
  description: "Rattled and pinned; can neither act nor move.",
  category: "debuff",
  duration: { kind: "turns", turns: 1 },
  hooks: { preventsAction: true, preventsMove: true },
};

export const rowen: Unit = {
  schemaVersion: 1,
  id: "rowen",
  name: "Rowen Corvane",
  spriteId: "enforcer",
  portraitId: "rowen",
  level: 1,
  jobId: "enforcer",
  disposition: { resolve: 72, attunement: 38 },
  learnedAbilityIds: ["pin"],
  equipment: { weapon: "shock-maul" },
};

/** Mirrors data/*.json; the mock fidelity test compares these against disk. */
export const realContent = {
  jobs: { enforcer: enforcerJob, conduit: conduitJob },
  abilities: { pin: pinAbility, "overload-cell": overloadCellAbility },
  items: { "shock-maul": shockMaul },
  statuses: { stunned: stunnedStatus },
  units: { rowen },
} as const;

// --- UI-only scaffolding ----------------------------------------------------

/** Kit that has not been authored as content yet; UI layout fodder only. */
export const draftItems: Item[] = [
  shockMaul,
  {
    schemaVersion: 1,
    id: "riot-shield",
    name: "Riot Shield",
    description: "Layered plate on a forearm brace. Rated for thrown brick, not for pressure.",
    equipTags: ["shield"],
    price: 260,
    slot: "shield",
    statMods: { evade: 12 },
  },
  {
    schemaVersion: 1,
    id: "watch-cuirass",
    name: "Watch Cuirass",
    description: "Corvane-stamped riot plate. Heavy enough that the crowd reads it before you speak.",
    equipTags: ["heavy-armor"],
    price: 520,
    slot: "body",
    statMods: { hp: 24, speed: -1 },
  },
  {
    schemaVersion: 1,
    id: "yard-helm",
    name: "Yard Helm",
    description: "Half-visor with an ash filter. Standard issue since the ash-fall ordinances.",
    equipTags: ["heavy-armor"],
    price: 180,
    slot: "head",
    statMods: { hp: 9 },
  },
  {
    schemaVersion: 1,
    id: "assay-ward",
    name: "Assay Ward",
    description: "Licensed insulation band. Blunts flux-borne effects and the Assay's questions.",
    equipTags: ["heavy-armor", "light-armor"],
    price: 340,
    slot: "accessory",
    statMods: { mag: -2, charge: 6 },
  },
  {
    schemaVersion: 1,
    id: "tap-rod",
    name: "Tap Rod",
    description: "Conduit's licensed coupling rod. Draws from a line without tripping the meter.",
    equipTags: ["conduit-gear"],
    price: 380,
    slot: "weapon",
    power: 5,
    damageType: "arc",
    range: { min: 1, max: 1, vertical: 1 },
  },
];

const itemsById = new Map(draftItems.map((item) => [item.id, item]));
const jobsById = new Map([enforcerJob, conduitJob].map((job) => [job.id, job]));
const abilitiesById = new Map(
  [pinAbility, overloadCellAbility].map((ability) => [ability.id, ability]),
);

const SKILLSET_NAMES: Record<string, string> = {
  enforcer: "Watch Doctrine",
  conduit: "Line Work",
};

export function mockUnitView(overrides: Partial<UnitView> = {}): UnitView {
  return {
    id: "rowen",
    name: "Rowen Corvane",
    jobId: "enforcer",
    jobName: "Enforcer",
    level: 1,
    team: "player",
    portraitId: "rowen",
    hp: 41,
    maxHp: 58,
    charge: 6,
    maxCharge: 14,
    ct: 100,
    facing: "north",
    statuses: [],
    disposition: { resolve: 72, attunement: 38 },
    downed: false,
    ...overrides,
  };
}

export function mockEnemyView(overrides: Partial<UnitView> = {}): UnitView {
  return mockUnitView({
    id: "provocateur-a",
    name: "Provocateur",
    team: "enemy",
    hp: 33,
    maxHp: 44,
    charge: 4,
    maxCharge: 11,
    ct: 62,
    facing: "south",
    statuses: [{ id: "stunned", name: "Stunned", category: "debuff", remainingTurns: 1 }],
    disposition: { resolve: 55, attunement: 45 },
    ...overrides,
  });
}

function abilityView(ability: Ability, charge: number) {
  const chargeCost = ability.slot === "action" ? ability.chargeCost : 0;
  const castSpeed = ability.slot === "action" ? ability.castSpeed : null;
  const unaffordable = chargeCost > charge;
  return {
    id: ability.id,
    name: ability.name,
    description: ability.description,
    slot: ability.slot,
    chargeCost,
    castSpeed,
    standingCost: ability.standingCost,
    ...(unaffordable ? { unavailableReason: "Insufficient charge" } : {}),
  };
}

export function mockSkillsets(unit: UnitView, learnedAbilityIds: string[] = ["pin", "overload-cell"]): SkillsetView[] {
  const byJob = new Map<string, Ability[]>();
  for (const id of learnedAbilityIds) {
    const ability = abilitiesById.get(id);
    if (!ability) continue;
    const list = byJob.get(ability.jobId) ?? [];
    list.push(ability);
    byJob.set(ability.jobId, list);
  }
  return [...byJob.entries()].map(([jobId, abilities]) => ({
    jobId,
    name: SKILLSET_NAMES[jobId] ?? jobsById.get(jobId)?.name ?? jobId,
    abilities: abilities.map((ability) => abilityView(ability, unit.charge)),
  }));
}

export function mockActionMenuView(overrides: Partial<ActionMenuView> = {}): ActionMenuView {
  const unit = overrides.unit ?? mockUnitView();
  return {
    unit,
    skillsets: mockSkillsets(unit),
    canMove: true,
    canAct: true,
    ...overrides,
  };
}

export function mockForecastView(overrides: Partial<ForecastView> = {}): ForecastView {
  return {
    attacker: { unitId: "rowen", name: "Rowen Corvane", portraitId: "rowen", jobName: "Enforcer" },
    abilityId: "pin",
    abilityName: "Pin",
    chargeCost: 0,
    castSpeed: null,
    targets: [
      {
        unitId: "provocateur-a",
        name: "Provocateur",
        hitChancePercent: 82,
        damage: { kind: "damage", min: 24, max: 31, damageType: "kinetic" },
        statuses: [{ name: "Stunned", chancePercent: 60 }],
        relativeFacing: "side",
        heightAdvantage: 1,
      },
    ],
    ...overrides,
  };
}

export function mockTurnOrderView(): TurnOrderView {
  return {
    entries: [
      { unitId: "rowen", name: "Rowen Corvane", jobName: "Enforcer", team: "player", portraitId: "rowen", kind: "turn", ticksUntil: 0 },
      { unitId: "provocateur-a", name: "Provocateur", jobName: "Enforcer", team: "enemy", kind: "turn", ticksUntil: 12 },
      { unitId: "sella-wick", name: "Sella Wick", jobName: "Conduit", team: "player", kind: "cast", abilityName: "Overload Cell", ticksUntil: 18 },
      { unitId: "dunn-brack", name: "Dunn Brack", jobName: "Enforcer", team: "player", kind: "turn", ticksUntil: 24 },
      { unitId: "provocateur-b", name: "Provocateur", jobName: "Enforcer", team: "enemy", kind: "turn", ticksUntil: 37 },
      { unitId: "sella-wick", name: "Sella Wick", jobName: "Conduit", team: "player", kind: "turn", ticksUntil: 45 },
    ],
  };
}

export function mockPartyView(): PartyView {
  return {
    deployedLimit: 4,
    members: [
      { unitId: "rowen", name: "Rowen Corvane", jobName: "Enforcer", level: 1, portraitId: "rowen", hp: 41, maxHp: 58, standing: 320, note: "Deployed" },
      { unitId: "dunn-brack", name: "Dunn Brack", jobName: "Enforcer", level: 2, hp: 66, maxHp: 66, standing: 140, note: "Deployed" },
      { unitId: "sella-wick", name: "Sella Wick", jobName: "Conduit", level: 2, hp: 38, maxHp: 47, standing: 275, note: "Deployed" },
      { unitId: "mott-tarr", name: "Mott Tarr", jobName: "Enforcer", level: 1, hp: 0, maxHp: 54, standing: 60, note: "Downed" },
    ],
  };
}

const MOCK_STATS: StatLineView[] = [
  { key: "hp", label: STAT_LABELS.hp, value: 58 },
  { key: "charge", label: STAT_LABELS.charge, value: 14 },
  { key: "speed", label: STAT_LABELS.speed, value: 7 },
  { key: "phys", label: STAT_LABELS.phys, value: 11 },
  { key: "mag", label: STAT_LABELS.mag, value: 4 },
];

function equipSlotViews(equipment: Partial<Record<EquipSlot, string>>): EquipSlotView[] {
  return EQUIP_SLOTS.map((slot) => {
    const itemId = equipment[slot] ?? null;
    const item = itemId ? itemsById.get(itemId) : undefined;
    return {
      slot,
      itemId,
      itemName: item?.name ?? null,
      summary: item ? summarizeItem(item) : "Empty",
    };
  });
}

function summarizeItem(item: Item): string {
  if (item.slot === "weapon") return `Power ${item.power} · ${item.damageType}`;
  if (item.slot === "consumable") return "Consumable";
  const mods = Object.entries(item.statMods)
    .map(([key, value]) => `${STAT_LABELS[key as keyof typeof STAT_LABELS]} ${value! > 0 ? "+" : ""}${value}`)
    .join(" · ");
  return mods.length > 0 ? mods : "No modifiers";
}

export function mockUnitSheetView(overrides: Partial<UnitSheetView> = {}): UnitSheetView {
  return {
    unit: mockUnitView(),
    standing: 320,
    stats: MOCK_STATS,
    move: enforcerJob.baseMove,
    jump: enforcerJob.baseJump,
    evade: enforcerJob.baseEvade,
    equipment: equipSlotViews({ weapon: "shock-maul", body: "watch-cuirass", shield: "riot-shield" }),
    learnedAbilities: [abilityView(pinAbility, 14)],
    passives: [
      { slot: "reaction", abilityName: null },
      { slot: "support", abilityName: null },
      { slot: "movement", abilityName: null },
    ],
    ...overrides,
  };
}

export function mockLearningView(overrides: Partial<LearningView> = {}): LearningView {
  const standing = overrides.standing ?? 120;
  const learnedIds = new Set(["pin"]);
  const entries = [pinAbility, overloadCellAbility].map((ability) => ({
    abilityId: ability.id,
    name: ability.name,
    description: ability.description,
    slot: ability.slot,
    standingCost: ability.standingCost,
    chargeCost: ability.slot === "action" ? ability.chargeCost : 0,
    learned: learnedIds.has(ability.id),
  }));
  return {
    unitId: "rowen",
    unitName: "Rowen Corvane",
    jobName: "Enforcer",
    standing,
    entries,
    ...overrides,
  };
}

export function mockEquipmentView(overrides: Partial<EquipmentView> = {}): EquipmentView {
  const equipped: Partial<Record<EquipSlot, string>> = {
    weapon: "shock-maul",
    body: "watch-cuirass",
    shield: "riot-shield",
  };
  const job = enforcerJob;
  const options = {} as Record<EquipSlot, ItemOptionView[]>;
  for (const slot of EQUIP_SLOTS) {
    options[slot] = draftItems
      .filter((item) => item.slot === slot)
      .map((item) => {
        const usable = item.equipTags.some((tag) => job.equipTags.includes(tag));
        const mods = item.slot === "consumable" ? {} : (item.statMods ?? {});
        return {
          itemId: item.id,
          name: item.name,
          description: item.description,
          slot,
          equipTags: item.equipTags,
          equipped: equipped[slot] === item.id,
          summary: summarizeItem(item),
          deltas: Object.entries(mods).map(([key, value]) => ({
            key: key as StatLineView["key"],
            label: STAT_LABELS[key as StatLineView["key"]],
            delta: value ?? 0,
          })),
          ...(usable ? {} : { unavailableReason: `${job.name} cannot bear ${item.equipTags[0]}` }),
        };
      });
  }
  return {
    unitId: "rowen",
    unitName: "Rowen Corvane",
    jobName: job.name,
    jobEquipTags: job.equipTags,
    slots: equipSlotViews(equipped),
    options,
    ...overrides,
  };
}

export const mockDialogue: DialogueLine[] = [
  {
    speaker: "Maren Voss",
    text: "Nobody on this line raised a hand until your people showed up, officer. Ask yourself who fired first.",
  },
  {
    speaker: "Rowen Corvane",
    portraitId: "rowen",
    text: "I have orders to clear the yard. I would rather clear it with everyone still standing.",
  },
  {
    speaker: "Watch Sergeant",
    text: "There goes the cell! Mind the flare!",
  },
];

export const SLOT_LABELS = EQUIP_SLOT_LABELS;
