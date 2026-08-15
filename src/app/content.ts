// Browser content load: every file under `data/` imported statically and
// validated with its zod schema, so malformed content fails at startup rather
// than mid-battle. Node-side callers (tests, sim) read the same files off disk.
//
// TODO(content): swap the explicit imports for a generated manifest once the
// content set outgrows hand-listing.

import overloadCellJson from "../../data/abilities/overload-cell.json";
import pinJson from "../../data/abilities/pin.json";
import marshalingYardEncounterJson from "../../data/encounters/e1-marshaling-yard.json";
import shockMaulJson from "../../data/items/shock-maul.json";
import conduitJson from "../../data/jobs/conduit.json";
import enforcerJson from "../../data/jobs/enforcer.json";
import marshalingYardMapJson from "../../data/maps/marshaling-yard.json";
import stunnedJson from "../../data/statuses/stunned.json";
import rowenJson from "../../data/units/rowen.json";
import type { ContentLibrary } from "../core/index.js";
import { Ability, Encounter, GameMap, Item, Job, Status, Unit } from "../data/index.js";

const byId = <T extends { id: string }>(entries: readonly T[]): Record<string, T> => {
  const out: Record<string, T> = {};
  for (const entry of entries) out[entry.id] = entry;
  return out;
};

/**
 * PLACEHOLDER PARTY MEMBER. `data/units/` only ships Rowen so far, and a party
 * of one Enforcer cannot touch the yard's machinery — the slice's whole design
 * pillar. This Conduit stands in until the content workstream authors
 * `data/units/vale.json`, at which point delete it and load the directory.
 */
const VALE_PLACEHOLDER: unknown = {
  schemaVersion: 1,
  id: "vale",
  name: "Vale Tarn",
  spriteId: "conduit",
  portraitId: "vale",
  level: 1,
  jobId: "conduit",
  disposition: { resolve: 50, attunement: 70 },
  learnedAbilityIds: ["overload-cell"],
  equipment: {},
};

export const PARTY: Unit[] = [Unit.parse(rowenJson), Unit.parse(VALE_PLACEHOLDER)];

export const CONTENT: ContentLibrary = {
  jobs: byId([Job.parse(enforcerJson), Job.parse(conduitJson)]),
  abilities: byId([Ability.parse(pinJson), Ability.parse(overloadCellJson)]),
  items: byId([Item.parse(shockMaulJson)]),
  statuses: byId([Status.parse(stunnedJson)]),
  maps: byId([GameMap.parse(marshalingYardMapJson)]),
  encounters: byId([Encounter.parse(marshalingYardEncounterJson)]),
};

export const OPENING_ENCOUNTER_ID = "e1-marshaling-yard";
