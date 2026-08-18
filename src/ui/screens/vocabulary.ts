import type { StatKey } from "../../data/index.js";
import { formatSigned } from "../state.js";

// How the between-battle screens say a content key out loud, in one place: the
// unit a stat is measured in, and the name an equip tag goes by.
//
// One unit per stat, everywhere. The kit list printed "Evade +12" beside a sheet
// that printed "8%", so the same stat read as points in one place and a
// percentage in the other and the player had no way to know which was meant.
//
// Evade is the only percentage the derived stats carry; everything else is
// points. A stat that changes side has to change it here, once.
const PERCENT_STATS: ReadonlySet<StatKey> = new Set<StatKey>(["evade"]);

export const statUnit = (key: StatKey): string => (PERCENT_STATS.has(key) ? "%" : "");

export const formatStatValue = (key: StatKey, value: number): string =>
  `${value}${statUnit(key)}`;

export const formatStatDelta = (key: StatKey, delta: number): string =>
  `${formatSigned(delta)}${statUnit(key)}`;

/** "11 → 15": what the stat is now and what the choice would make it. */
export const formatStatShift = (key: StatKey, before: number, delta: number): string =>
  `${formatStatValue(key, before)} → ${formatStatValue(key, before + delta)}`;

/**
 * What a job's equip tags are called out loud. The equipment screen used to
 * print the internal ids — `heavy-armor`, `enforcer-arms` — which are content
 * keys, not words a player has ever been shown.
 */
const EQUIP_TAG_LABELS: Record<string, string> = {
  accessory: "Accessories",
  "chemist-kit": "Chemist kit",
  "conduit-gear": "Conduit gear",
  "enforcer-arms": "Enforcer arms",
  "field-issue": "Field issue",
  "graft-arms": "Graft arms",
  "heavy-armor": "Heavy armour",
  "light-armor": "Light armour",
  "machinist-tools": "Machinist tools",
  "railrunner-gear": "Railrunner gear",
  "saboteur-kit": "Saboteur kit",
  shield: "Shields",
};

/** A tag nobody has named yet still reads as words, never as a key. */
export function equipTagLabel(tag: string): string {
  const known = EQUIP_TAG_LABELS[tag];
  if (known !== undefined) return known;
  const spaced = tag.replace(/-/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export const equipTagList = (tags: readonly string[]): string =>
  tags.length === 0 ? "nothing" : tags.map(equipTagLabel).join(", ");
