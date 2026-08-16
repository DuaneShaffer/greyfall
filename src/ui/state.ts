import type { DamageType, DialogueLine, Disposition, Facing, StatKey, Team, TileCoord } from "../data/index.js";

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

/**
 * A timed stat change from a `modifyStats` effect. Statuses have names; these
 * do not, so the UI reports them as what they are: the stat, the delta, and how
 * long it lasts.
 */
export interface StatModView {
  id: string;
  /** "Phys +4 · Speed -1" — already formatted; the UI does layout, not math. */
  label: string;
  /** null = until removed. */
  remainingTurns: number | null;
  /** Net direction, for the chip's tone. */
  direction: "gain" | "loss" | "mixed";
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
  /** Timed stat changes in force; empty for a unit carrying none. */
  modifiers?: StatModView[];
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

export interface OperableView {
  objectId: string;
  name: string;
}

/** One consumable in the party's shared satchel, as the Item submenu lists it. */
export interface ItemEntryView {
  itemId: string;
  name: string;
  description: string;
  /** Stock left in the satchel; the whole force draws on the same pile. */
  count: number;
  unavailableReason?: string;
}

export interface ActionMenuView {
  unit: UnitView;
  skillsets: SkillsetView[];
  canMove: boolean;
  canAct: boolean;
  /** Reasons shown on the greyed entries when the flags above are false. */
  moveBlockedReason?: string;
  actBlockedReason?: string;
  /** Adjacent machinery the unit could operate; empty hides the entry. */
  operables?: OperableView[];
  /** The satchel, shared by the whole force; empty hides the Item entry. */
  items?: ItemEntryView[];
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
  /** Set when the pending action is a consumable rather than an ability. */
  item?: { itemId: string; remaining: number };
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

/**
 * What the game is asking the player for, right now. The HUD announces it in
 * one place and styles the panels around it, so "which of these things is live"
 * is never a guess.
 */
export type HudMode =
  | "orders"
  | "move"
  | "target"
  | "facing"
  | "dialogue"
  | "presenting"
  | "ai"
  | "deploy"
  | "ended";

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
  /** Job level in the unit's current job; 1–8. */
  jobLevel?: number;
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
  /** Consumables in stock. Read-only here: they are carried, never equipped. */
  satchel: ItemEntryView[];
}

export interface JobOptionView {
  jobId: string;
  name: string;
  description: string;
  /** 1–8; rises with cumulative Standing banked in the job. */
  jobLevel: number;
  /** Unspent Standing sitting in this job. */
  standing: number;
  isPrimary: boolean;
  isSecondary: boolean;
  /** Set when prerequisites are unmet or the pick is nonsense. */
  lockedReason?: string;
}

export interface JobsView {
  unitId: string;
  unitName: string;
  primaryJobName: string;
  secondaryJobName: string | null;
  options: JobOptionView[];
}

export interface DeploymentSlotView {
  tile: TileCoord;
  unitId: string | null;
  unitName: string | null;
}

export interface DeploymentCandidateView {
  unitId: string;
  name: string;
  jobName: string;
  level: number;
  hp: number;
  maxHp: number;
  assigned: boolean;
  /** Set when the unit cannot take the field at all. */
  unavailableReason?: string;
}

/** The formation screen: who goes in, and onto which deployment tile. */
export interface DeploymentView {
  encounterId: string;
  encounterName: string;
  maxDeployed: number;
  candidates: DeploymentCandidateView[];
  slots: DeploymentSlotView[];
  /** The satchel that goes out with them; spent stock does not come back. */
  satchel: ItemEntryView[];
  canConfirm: boolean;
  /** Why Deploy is greyed: nobody assigned, roster empty. */
  blockedReason?: string;
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
