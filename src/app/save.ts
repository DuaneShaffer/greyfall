// Persistence for the between-battle layer. `CampaignState` is already plain
// JSON with every collection in a stable order, so a save is a versioned
// envelope around it and nothing more.
//
// One key per campaign: a chapter and a skirmish are separate files, and
// opening one must never be able to overwrite the other's record.

import { CAMPAIGN_STATE_VERSION, type CampaignState } from "../core/index.js";

export const SAVE_VERSION = 1;
export const SAVE_KEY_PREFIX = "greyfall.campaign";

/** The single key every campaign shared before saves were filed per campaign. */
export const LEGACY_SAVE_KEY = "greyfall.campaign";

export function saveKeyFor(campaignId: string): string {
  return `${SAVE_KEY_PREFIX}.${campaignId}`;
}

export interface SaveEnvelope {
  saveVersion: number;
  campaign: CampaignState;
}

/** The slice of `Storage` the save code uses; `localStorage` satisfies it. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type LoadOutcome =
  | { ok: true; campaign: CampaignState }
  /**
   * `unreadable` separates the two failures the caller must treat differently:
   * true means a blob is on the key and will not open, false means the key is
   * empty. Only the first is a record worth protecting.
   */
  | { ok: false; reason: string; unreadable: boolean };

export function memoryStorage(seed: Record<string, string> = {}): SaveStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

// One stand-in shared by every call, so a save and the load after it reach the
// same map when there is no `localStorage` to reach instead.
const nodeStorage = memoryStorage();

/** Browser `localStorage` when there is one; an in-memory stand-in in Node. */
export function defaultStorage(): SaveStorage {
  const candidate = (globalThis as { localStorage?: SaveStorage }).localStorage;
  return candidate ?? nodeStorage;
}

export function encodeSave(campaign: CampaignState): string {
  const envelope: SaveEnvelope = { saveVersion: SAVE_VERSION, campaign };
  return JSON.stringify(envelope);
}

const property = (value: object, key: string): unknown =>
  key in value ? (value as Record<string, unknown>)[key] : undefined;

/**
 * One entry per `CampaignState` field, so the gate below cannot fall behind the
 * type it guards: adding a field to `CampaignState` is a compile error until it
 * is listed here. `null` is the explicit "decode does not check this" answer.
 */
const CAMPAIGN_FIELD_CHECKS: {
  readonly [K in keyof CampaignState]: ((value: unknown) => boolean) | null;
} = {
  version: (value) => value === CAMPAIGN_STATE_VERSION,
  campaignId: (value) => typeof value === "string",
  roster: Array.isArray,
  progress: Array.isArray,
  inventory: Array.isArray,
  fallen: Array.isArray,
  encounterIndex: (value) => typeof value === "number",
  completedEncounterIds: Array.isArray,
};

function isCampaignState(value: unknown): value is CampaignState {
  if (typeof value !== "object" || value === null) return false;
  return Object.entries(CAMPAIGN_FIELD_CHECKS).every(
    ([key, check]) => check === null || check(property(value, key)),
  );
}

export function decodeSave(text: string): LoadOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Save data is not valid JSON", unreadable: true };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "Save data is not an object", unreadable: true };
  }
  const saveVersion = property(parsed, "saveVersion");
  if (saveVersion !== SAVE_VERSION) {
    return {
      ok: false,
      reason: `Unsupported save version ${String(saveVersion)}`,
      unreadable: true,
    };
  }
  const campaign = property(parsed, "campaign");
  if (!isCampaignState(campaign)) {
    return { ok: false, reason: "Save data is not a campaign", unreadable: true };
  }
  return { ok: true, campaign };
}

export function saveCampaign(campaign: CampaignState, storage: SaveStorage = defaultStorage()): void {
  storage.setItem(saveKeyFor(campaign.campaignId), encodeSave(campaign));
}

export function loadCampaign(
  campaignId: string,
  storage: SaveStorage = defaultStorage(),
): LoadOutcome {
  const text = storage.getItem(saveKeyFor(campaignId));
  if (text === null) return { ok: false, reason: "No save found", unreadable: false };
  return decodeSave(text);
}

export function clearCampaign(campaignId: string, storage: SaveStorage = defaultStorage()): void {
  storage.removeItem(saveKeyFor(campaignId));
}

/**
 * Move a save written under the old shared key to the key for the campaign it
 * actually names. Returns that campaign id, or null when there was nothing to
 * move. Idempotent, and deliberately conservative: a legacy blob that will not
 * decode, or one whose campaign already has a file of its own, is left exactly
 * where it is rather than discarded.
 */
export function migrateSaves(storage: SaveStorage = defaultStorage()): string | null {
  const legacy = storage.getItem(LEGACY_SAVE_KEY);
  if (legacy === null) return null;
  const decoded = decodeSave(legacy);
  if (!decoded.ok) return null;
  const key = saveKeyFor(decoded.campaign.campaignId);
  if (storage.getItem(key) !== null) return null;
  storage.setItem(key, legacy);
  storage.removeItem(LEGACY_SAVE_KEY);
  return decoded.campaign.campaignId;
}

/** Pretty-printed blob for an export-to-file path; no screen offers one yet. */
export function exportSave(campaign: CampaignState): string {
  return JSON.stringify({ saveVersion: SAVE_VERSION, campaign }, null, 2);
}

export function importSave(text: string): LoadOutcome {
  return decodeSave(text);
}
