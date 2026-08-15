import type { DamageType, DialogueLine, Disposition, Facing, StatKey, Team } from "../data/index.js";

// VIEW MODELS — the read side of the UI seam.
//
// These are plain, serializable snapshots of what a screen needs to draw. They
// mirror what `core` selectors will hand over next phase (derived from
// GameState after each command's events are applied); until then the harness
// and tests build them from `src/ui/mock.ts`. Rules for anything added here:
//
//   1. Plain data only — no functions, no class instances, no core types.
//   2. Already formatted for display where formatting is a rules decision
//      (hit chance, damage range); the UI does layout, not math.
//   3. Named after src/data vocabulary: charge (never mana/MP), ability
//      (never spell), Standing, Resolve, Attunement.

export type EquipSlot = "weapon" | "shield" | "head" | "body" | "accessory";
export const EQUIP_SLOTS: readonly EquipSlot[] = ["weapon", "shield", "head", "body", "accessory"];

export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: "Weapon",
  shield: "Shield",
  head: "Head",
  body: "Body",
  accessory: "Accessory",
};

export const STAT_LABELS: Record<StatKey, string> = {
  hp: "HP",
  charge: "Charge",
  speed: "Speed",
  phys: "Phys",
  mag: "Mag",
  move: "Move",
  jump: "Jump",
  evade: "Evade",
};

export interface StatusView {
  id: string;
  name: string;
  category: "buff" | "debuff";
  /** null = until removed. */
  remainingTurns: number | null;
}

export interface UnitView {
  id: string;
  name: string;
  jobId: string;
  jobName: string;
  level: number;
  team: Team;
  portraitId?: string;
  hp: number;
  maxHp: number;
  charge: number;
  maxCharge: number;
  /** 0–100; a unit acts at 100. */
  ct: number;
  facing: Facing;
  statuses: StatusView[];
  disposition: Disposition;
  downed: boolean;
}

export interface AbilityView {
  id: string;
  name: string;
  description: string;
  slot: "action" | "reaction" | "support" | "movement";
  chargeCost: number;
  /** null = instant, no charging phase. */
  castSpeed: number | null;
  standingCost: number;
  /** Set when the ability cannot be used right now; shown as the entry's reason. */
  unavailableReason?: string;
}

export interface SkillsetView {
  jobId: string;
  /** "Watch Doctrine", "Line Work" — the job's skillset name. */
  name: string;
  abilities: AbilityView[];
}

export interface ActionMenuView {
  unit: UnitView;
  skillsets: SkillsetView[];
  canMove: boolean;
  canAct: boolean;
  /** Reasons shown on the greyed entries when the flags above are false. */
  moveBlockedReason?: string;
  actBlockedReason?: string;
}

export interface ForecastTargetView {
  unitId: string;
  name: string;
  portraitId?: string;
  hitChancePercent: number;
  damage: {
    kind: "damage" | "heal";
    min: number;
    max: number;
    damageType?: DamageType;
  } | null;
  statuses: { name: string; chancePercent: number }[];
  /** Facing the attack comes in on; drives the hit bonus the player is reading. */
  relativeFacing: "front" | "side" | "back" | null;
  heightAdvantage: number;
}

export interface ForecastView {
  attacker: { unitId: string; name: string; portraitId?: string; jobName: string };
  abilityId: string;
  abilityName: string;
  chargeCost: number;
  /** null = resolves immediately; otherwise it enters the turn order as a cast. */
  castSpeed: number | null;
  targets: ForecastTargetView[];
}

export interface TurnOrderEntryView {
  unitId: string;
  name: string;
  jobName: string;
  team: Team;
  portraitId?: string;
  /** A charging cast resolving before the unit's next turn. */
  kind: "turn" | "cast";
  abilityName?: string;
  /** Ticks until this entry resolves; 0 = acting now. */
  ticksUntil: number;
}

export interface TurnOrderView {
  entries: TurnOrderEntryView[];
}

/** Everything the battle overlay draws for one moment of one battle. */
export interface BattleHudView {
  action: ActionMenuView;
  /** Unit under the cursor, or the acting unit when nothing is hovered. */
  inspected: UnitView | null;
  turnOrder: TurnOrderView;
  forecast: ForecastView | null;
  dialogue: DialogueLine[];
}

export interface RosterEntryView {
  unitId: string;
  name: string;
  jobName: string;
  level: number;
  portraitId?: string;
  hp: number;
  maxHp: number;
  standing: number;
  /** Roster-level notes: "Deployed", "Reserve", "Downed". */
  note?: string;
}

export interface PartyView {
  /** The chapter's party, in roster order. */
  members: RosterEntryView[];
  deployedLimit: number;
}

export interface StatLineView {
  key: StatKey;
  label: string;
  value: number;
  /** Change a pending equipment choice would make. */
  delta?: number;
}

export interface EquipSlotView {
  slot: EquipSlot;
  itemId: string | null;
  itemName: string | null;
  summary: string;
  /** Set when the unit's job cannot use this slot at all. */
  lockedReason?: string;
}

export interface UnitSheetView {
  unit: UnitView;
  standing: number;
  stats: StatLineView[];
  move: number;
  jump: number;
  evade: number;
  equipment: EquipSlotView[];
  learnedAbilities: AbilityView[];
  passives: { slot: "reaction" | "support" | "movement"; abilityName: string | null }[];
}

export interface LearnableView {
  abilityId: string;
  name: string;
  description: string;
  slot: "action" | "reaction" | "support" | "movement";
  standingCost: number;
  chargeCost: number;
  learned: boolean;
}

export interface LearningView {
  unitId: string;
  unitName: string;
  jobName: string;
  standing: number;
  entries: LearnableView[];
}

export interface ItemOptionView {
  itemId: string;
  name: string;
  description: string;
  slot: EquipSlot;
  equipTags: string[];
  equipped: boolean;
  /** One-line readout for stats the delta list cannot show (weapon power). */
  summary: string;
  deltas: { key: StatKey; label: string; delta: number }[];
  /** Set when the job lacks a matching equipTag or the item is spoken for. */
  unavailableReason?: string;
}

export interface EquipmentView {
  unitId: string;
  unitName: string;
  jobName: string;
  jobEquipTags: string[];
  slots: EquipSlotView[];
  /** Candidate items per slot, already filtered to the ones worth listing. */
  options: Record<EquipSlot, ItemOptionView[]>;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function formatDamageRange(damage: ForecastTargetView["damage"]): string {
  if (damage === null) return "—";
  return damage.min === damage.max ? String(damage.min) : `${damage.min}–${damage.max}`;
}

export function formatStanding(points: number): string {
  return `Standing: ${points}`;
}
