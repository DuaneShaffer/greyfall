import type { Ability, DialogueLine, Item, Job, Status, Unit } from "../data/index.js";
import type {
  ActionMenuView,
  BattleResultsView,
  ChapterCloseView,
  DeploymentView,
  EquipSlot,
  EquipSlotView,
  EquipmentView,
  FallenEntryView,
  ForecastView,
  ItemEntryView,
  ItemOptionView,
  JobsView,
  LearningView,
  PartyView,
  PowerLedgerView,
  SkillsetView,
  StatLineView,
  TurnOrderView,
  UnitSheetView,
  UnitView,
} from "./state.js";
import { EQUIP_SLOTS, STAT_LABELS } from "./state.js";

// Mock state for the harness and tests. Content marked "real" below is copied
// verbatim from data/*.json (tests/ui/mock.test.ts fails if it drifts) so the
// layouts and register are honest; the rest is UI-only scaffolding standing in
// for whatever a battle would have supplied.

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
  learnableAbilityIds: [
    "pin",
    "shield-advance",
    "kettle",
    "breach-posture",
    "baton-answer",
    "hold-the-line",
    "riot-drill",
    "press-through",
  ],
  equipTags: ["enforcer-arms", "heavy-armor", "shield", "accessory", "field-issue"],
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
  learnableAbilityIds: [
    "arc",
    "tap-line",
    "throw-the-breaker",
    "overload-cell",
    "reclose",
    "backfeed",
    "cross-tie",
    "ground",
    "overdraw",
    "flare",
    "licensed-draw",
    "rated-draw",
    "earth-strap",
  ],
  equipTags: ["conduit-gear", "light-armor", "accessory", "field-issue"],
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
    { kind: "applyStatus", statusId: "stunned", chance: 35 },
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
  requires: ["targetPowered"],
  chargeCost: 5,
  castSpeed: null,
  effects: [{ kind: "damageObject", amount: { base: "mag", power: 20 } }],
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
  portraitId: "rowen",
  level: 1,
  jobId: "enforcer",
  disposition: { resolve: 72, attunement: 38 },
  learnedAbilityIds: ["pin"],
  reactionAbilityId: "baton-answer",
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

/** Harness-only kit list: layout fodder, not held to data/items fidelity. */
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
    modifiers: [
      { id: "mod-1", label: "Phys -3", remainingTurns: 2, direction: "loss" as const },
    ],
    disposition: { resolve: 55, attunement: 45 },
    charging: { abilityName: "Overload Cell", ticksUntil: 18 },
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

/** The shared field kit, in the Chemist register the item files use. */
export function mockSatchel(): ItemEntryView[] {
  return [
    {
      itemId: "coagulant-vial",
      name: "Coagulant Vial",
      description: "Standard field clotting compound.",
      count: 3,
    },
    {
      itemId: "cinder-flask",
      name: "Cinder Flask",
      description: "Accelerant in thin glass with a friction cap.",
      count: 1,
    },
  ];
}

export function mockActionMenuView(overrides: Partial<ActionMenuView> = {}): ActionMenuView {
  const unit = overrides.unit ?? mockUnitView();
  return {
    unit,
    skillsets: mockSkillsets(unit),
    canMove: true,
    canAct: true,
    items: mockSatchel(),
    ...overrides,
  };
}

export function mockForecastView(overrides: Partial<ForecastView> = {}): ForecastView {
  return {
    attacker: {
      unitId: "rowen",
      name: "Rowen Corvane",
      portraitId: "rowen",
      jobName: "Enforcer",
      hp: 41,
      maxHp: 58,
    },
    // The confirm moment is the one the panel is mostly in; `armed: false` is
    // the Operate cursor's resting preview.
    armed: true,
    abilityId: "pin",
    abilityName: "Pin",
    chargeCost: 0,
    castSpeed: null,
    targets: [
      {
        unitId: "provocateur-a",
        name: "Provocateur",
        jobName: "Provocateur",
        hp: 33,
        maxHp: 44,
        hitChancePercent: 82,
        damage: { kind: "damage", min: 24, max: 31, damageType: "kinetic" },
        statuses: [{ name: "Stunned", chancePercent: 35 }],
        effects: [],
        relativeFacing: "side",
        heightAdvantage: 1,
      },
    ],
    effects: [],
    aimedAt: { kind: "unit", unitId: "provocateur-a" },
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

/**
 * The register as §2.5(a)'s mock draws it: one gridded section split in two by
 * an open tie — one bus past its rating and blown, one dead with no feed at all
 * — a second section sitting on its rating, a third at rest, and the loose
 * machinery underneath. The three load colours on one screen.
 */
export function mockPowerRegisterView(): PowerLedgerView {
  return {
    networks: [
      {
        gridId: "refinery-three-grid",
        name: "Refinery Three Grid",
        components: [
          {
            id: "charge-hoist-east",
            sources: ["east main"],
            load: 14,
            capacity: 12,
            held: 0,
            level: "over",
            state: "tripped",
            nodes: [
              { objectId: "east-main", name: "east main", state: "tripped" },
              { objectId: "charge-hoist-east", name: "charge hoist east", state: "live" },
            ],
          },
          {
            id: "charge-hoist-west",
            sources: [],
            load: 4,
            capacity: 0,
            held: 0,
            level: "over",
            state: "dead",
            nodes: [
              { objectId: "charge-hoist-west", name: "charge hoist west", state: "dead" },
            ],
          },
        ],
        outOfCircuit: [
          { objectId: "west-main", name: "west main", state: "open" },
          { objectId: "gallery-tie", name: "tie, gallery", state: "tie-open" },
          { objectId: "north-bus", name: "north bus", state: "cut" },
          { objectId: "feeder-trough", name: "feeder trough", state: "destroyed" },
        ],
      },
      {
        gridId: "gallery-grid",
        name: "Gallery Grid",
        components: [
          {
            id: "gallery-board",
            sources: ["gallery main"],
            load: 9,
            capacity: 10,
            held: 10,
            level: "rated",
            state: "live",
            nodes: [
              { objectId: "gallery-main", name: "gallery main", state: "live" },
              { objectId: "gallery-board", name: "board, gallery", state: "tie-closed" },
              { objectId: "gallery-lamps", name: "lamp standards", state: "live" },
            ],
          },
        ],
        outOfCircuit: [],
      },
      {
        gridId: "yard-grid",
        name: "Yard Grid",
        components: [
          {
            id: "yard-hoist",
            sources: ["yard main"],
            load: 4,
            capacity: 10,
            held: 10,
            level: "rest",
            state: "live",
            nodes: [
              { objectId: "yard-main", name: "yard main", state: "live" },
              { objectId: "yard-hoist", name: "yard hoist", state: "live" },
            ],
          },
        ],
        outOfCircuit: [],
      },
    ],
    entries: [{ objectId: "service-lift", name: "Service Lift", powered: true }],
  };
}

export const mockFallen: FallenEntryView[] = [
  {
    unitId: "ivo-brace",
    name: "Ivo Brace",
    jobName: "Machinist",
    level: 3,
    encounterName: "Foundry Floor Nine",
  },
];

export function mockPartyView(overrides: Partial<PartyView> = {}): PartyView {
  return {
    deployedLimit: 4,
    fallen: mockFallen,
    members: [
      { unitId: "rowen", name: "Rowen Corvane", jobName: "Enforcer", level: 1, portraitId: "rowen", hp: 41, maxHp: 58, standing: 320, disposition: { resolve: 72, attunement: 38 }, note: "Deployed" },
      { unitId: "dunn-brack", name: "Dunn Brack", jobName: "Enforcer", level: 2, hp: 66, maxHp: 66, standing: 140, disposition: { resolve: 61, attunement: 30 }, note: "Deployed" },
      { unitId: "sella-wick", name: "Sella Wick", jobName: "Conduit", level: 2, hp: 38, maxHp: 47, standing: 275, disposition: { resolve: 44, attunement: 78 }, note: "Deployed" },
      { unitId: "mott-tarr", name: "Mott Tarr", jobName: "Enforcer", level: 1, hp: 0, maxHp: 54, standing: 60, disposition: { resolve: 58, attunement: 26 }, note: "Downed" },
    ],
    ...overrides,
  };
}

export function mockBattleResultsView(
  overrides: Partial<BattleResultsView> = {},
): BattleResultsView {
  return {
    result: "win",
    encounterId: "e2-foundry-floor-nine",
    encounterName: "Foundry Floor Nine",
    headline: "Field Held",
    note: "Engagement closed and entered on the chapter.",
    standing: [
      {
        unitId: "rowen",
        name: "Rowen Corvane",
        jobName: "Enforcer",
        amount: 110,
        jobLevel: 3,
        jobLevelsGained: 1,
        struck: false,
      },
      {
        unitId: "ivo-brace",
        name: "Ivo Brace",
        jobName: "Machinist",
        amount: 40,
        jobLevel: 3,
        jobLevelsGained: 0,
        struck: true,
      },
    ],
    standingTotal: 150,
    fallen: mockFallen,
    consumed: [{ itemId: "coagulant-vial", name: "Coagulant Vial", count: 2 }],
    advanced: true,
    ...overrides,
  };
}

export function mockChapterCloseView(overrides: Partial<ChapterCloseView> = {}): ChapterCloseView {
  return {
    chapterName: "The Foundry Chapter",
    note: "No further engagements are on the docket.",
    engagements: [
      { encounterId: "e1-marshaling-yard", name: "The Marshaling Yard" },
      { encounterId: "e2-foundry-floor-nine", name: "Foundry Floor Nine" },
    ],
    standingTotal: 640,
    survivors: [
      { unitId: "rowen", name: "Rowen Corvane", jobName: "Enforcer", level: 3 },
      { unitId: "sella-wick", name: "Sella Wick", jobName: "Conduit", level: 2 },
    ],
    fallen: mockFallen,
    ...overrides,
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
    .map(([key, value]) => `${STAT_LABELS[key as keyof typeof STAT_LABELS]} ${value > 0 ? "+" : ""}${value}`)
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
    satchel: mockSatchel(),
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

export function mockJobsView(overrides: Partial<JobsView> = {}): JobsView {
  return {
    unitId: "rowen",
    unitName: "Rowen Corvane",
    primaryJobName: "Enforcer",
    secondaryJobName: "Conduit",
    options: [
      {
        jobId: "enforcer",
        name: enforcerJob.name,
        description: enforcerJob.description,
        jobLevel: 3,
        standing: 320,
        isPrimary: true,
        isSecondary: false,
      },
      {
        jobId: "conduit",
        name: conduitJob.name,
        description: conduitJob.description,
        jobLevel: 1,
        standing: 0,
        isPrimary: false,
        isSecondary: true,
      },
      {
        jobId: "railrunner",
        name: "Railrunner",
        description: "Mobility specialist keyed to rails and machinery.",
        jobLevel: 1,
        standing: 0,
        isPrimary: false,
        isSecondary: false,
        lockedReason: "Needs Enforcer level 4 (has 3)",
      },
    ],
    ...overrides,
  };
}

export function mockDeploymentView(overrides: Partial<DeploymentView> = {}): DeploymentView {
  const party = mockPartyView();
  const assigned = new Set(["rowen", "sella-wick"]);
  return {
    encounterId: "e1-marshaling-yard",
    encounterName: "The Marshaling Yard",
    maxDeployed: 4,
    candidates: party.members.map((member) => ({
      unitId: member.unitId,
      name: member.name,
      jobName: member.jobName,
      level: member.level,
      hp: member.hp,
      maxHp: member.maxHp,
      assigned: assigned.has(member.unitId),
      ...(member.hp === 0 ? { unavailableReason: "Downed" } : {}),
    })),
    slots: [
      { tile: { x: 0, y: 4 }, unitId: "rowen", unitName: "Rowen Corvane" },
      { tile: { x: 1, y: 4 }, unitId: "sella-wick", unitName: "Sella Wick" },
      { tile: { x: 0, y: 5 }, unitId: null, unitName: null },
      { tile: { x: 1, y: 5 }, unitId: null, unitName: null },
    ],
    satchel: mockSatchel(),
    canConfirm: true,
    ...overrides,
  };
}
