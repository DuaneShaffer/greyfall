import { describe, expect, it } from "vitest";
import { changeJob, equipItem, learnAbility } from "../../src/core/index.js";
import {
  SAVE_KEY,
  SAVE_VERSION,
  clearCampaign,
  decodeSave,
  encodeSave,
  exportSave,
  importSave,
  loadCampaign,
  memoryStorage,
  saveCampaign,
} from "../../src/app/save.js";
import { BENCH, benchState } from "./fixtures.js";

describe("save round trip", () => {
  it("restores a campaign byte-identically", () => {
    let state = benchState();
    state = learnAbility(state, "rowen", "brace", BENCH).state;
    state = equipItem(state, "rowen", "body", "watch-plate", BENCH).state;
    state = changeJob(state, "vale", "enforcer", BENCH).state;

    const restored = decodeSave(encodeSave(state));
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.campaign).toEqual(state);
    expect(encodeSave(restored.campaign)).toBe(encodeSave(state));
  });

  it("is deterministic: the same state always serializes to the same text", () => {
    const a = benchState();
    const b = benchState();
    expect(encodeSave(a)).toBe(encodeSave(b));
  });

  it("survives a second trip through storage", () => {
    const storage = memoryStorage();
    const state = benchState();
    saveCampaign(state, storage);
    const first = loadCampaign(storage);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    saveCampaign(first.campaign, storage);
    expect(storage.getItem(SAVE_KEY)).toBe(encodeSave(state));
  });

  it("exports pretty JSON that imports back", () => {
    const state = benchState();
    const blob = exportSave(state);
    expect(blob).toContain("\n");
    const back = importSave(blob);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.campaign).toEqual(state);
  });
});

describe("save storage", () => {
  it("reports a missing save rather than throwing", () => {
    const outcome = loadCampaign(memoryStorage());
    expect(outcome).toEqual({ ok: false, reason: "No save found" });
  });

  it("clears", () => {
    const storage = memoryStorage();
    saveCampaign(benchState(), storage);
    clearCampaign(storage);
    expect(loadCampaign(storage).ok).toBe(false);
  });
});

describe("save validation", () => {
  it("rejects non-JSON", () => {
    expect(decodeSave("{not json")).toEqual({ ok: false, reason: "Save data is not valid JSON" });
  });

  it("rejects a non-object", () => {
    expect(decodeSave("42").ok).toBe(false);
  });

  it("rejects a foreign save version", () => {
    const text = JSON.stringify({ saveVersion: SAVE_VERSION + 1, campaign: benchState() });
    const outcome = decodeSave(text);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("Unsupported save version");
  });

  it("rejects an envelope whose payload is not a campaign", () => {
    const outcome = decodeSave(JSON.stringify({ saveVersion: SAVE_VERSION, campaign: { nope: 1 } }));
    expect(outcome).toEqual({ ok: false, reason: "Save data is not a campaign" });
  });
});
