// Persistence for the between-battle layer. `CampaignState` is already plain
// JSON with every collection in a stable order, so a save is a versioned
// envelope around it and nothing more — no migration machinery until there is
// a second version to migrate from.

import { CAMPAIGN_STATE_VERSION, type CampaignState } from "../core/index.js";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "greyfall.campaign";

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
  | { ok: false; reason: string };

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

/** Browser `localStorage` when there is one; an in-memory stand-in in Node. */
export function defaultStorage(): SaveStorage {
  const candidate = (globalThis as { localStorage?: SaveStorage }).localStorage;
  return candidate ?? memoryStorage();
}

export function encodeSave(campaign: CampaignState): string {
  const envelope: SaveEnvelope = { saveVersion: SAVE_VERSION, campaign };
  return JSON.stringify(envelope);
}

export function decodeSave(text: string): LoadOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: "Save data is not valid JSON" };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "Save data is not an object" };
  }
  const envelope = parsed as Partial<SaveEnvelope>;
  if (envelope.saveVersion !== SAVE_VERSION) {
    return { ok: false, reason: `Unsupported save version ${String(envelope.saveVersion)}` };
  }
  const campaign = envelope.campaign;
  if (
    typeof campaign !== "object" ||
    campaign === null ||
    campaign.version !== CAMPAIGN_STATE_VERSION ||
    typeof campaign.campaignId !== "string" ||
    !Array.isArray(campaign.roster) ||
    !Array.isArray(campaign.progress) ||
    !Array.isArray(campaign.inventory) ||
    !Array.isArray(campaign.fallen) ||
    typeof campaign.encounterIndex !== "number"
  ) {
    return { ok: false, reason: "Save data is not a campaign" };
  }
  return { ok: true, campaign };
}

export function saveCampaign(campaign: CampaignState, storage: SaveStorage = defaultStorage()): void {
  storage.setItem(SAVE_KEY, encodeSave(campaign));
}

export function loadCampaign(storage: SaveStorage = defaultStorage()): LoadOutcome {
  const text = storage.getItem(SAVE_KEY);
  if (text === null) return { ok: false, reason: "No save found" };
  return decodeSave(text);
}

export function clearCampaign(storage: SaveStorage = defaultStorage()): void {
  storage.removeItem(SAVE_KEY);
}

/** Pretty-printed blob for the export-to-file path. */
export function exportSave(campaign: CampaignState): string {
  return JSON.stringify({ saveVersion: SAVE_VERSION, campaign }, null, 2);
}

export function importSave(text: string): LoadOutcome {
  return decodeSave(text);
}
