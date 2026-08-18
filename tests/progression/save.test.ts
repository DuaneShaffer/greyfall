import { describe, expect, it } from "vitest";
import {
  changeJob,
  equipItem,
  learnAbility,
  type CampaignState,
} from "../../src/core/index.js";
import {
  LEGACY_SAVE_KEY,
  SAVE_VERSION,
  clearCampaign,
  decodeSave,
  encodeSave,
  exportSave,
  importSave,
  loadCampaign,
  memoryStorage,
  migrateSaves,
  saveCampaign,
  saveKeyFor,
} from "../../src/app/save.js";
import { BENCH, benchState } from "./fixtures.js";

const BENCH_ID = "bench-chapter";

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
    const first = loadCampaign(BENCH_ID, storage);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    saveCampaign(first.campaign, storage);
    expect(storage.getItem(saveKeyFor(BENCH_ID))).toBe(encodeSave(state));
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
    const outcome = loadCampaign(BENCH_ID, memoryStorage());
    expect(outcome).toEqual({ ok: false, reason: "No save found", unreadable: false });
  });

  it("reports a campaign that has never been filed, even beside one that has", () => {
    const storage = memoryStorage();
    saveCampaign(benchState(), storage);
    expect(loadCampaign("works-skirmishes", storage)).toEqual({
      ok: false,
      reason: "No save found",
      unreadable: false,
    });
  });

  it("clears", () => {
    const storage = memoryStorage();
    saveCampaign(benchState(), storage);
    clearCampaign(BENCH_ID, storage);
    expect(loadCampaign(BENCH_ID, storage).ok).toBe(false);
  });
});

/**
 * The bug this key layout exists to make impossible: two campaigns sharing one
 * key meant opening the second silently overwrote the first one's record.
 */
describe("one file per campaign", () => {
  const skirmish = (): CampaignState =>
    benchState({ id: "works-skirmishes", name: "Skirmishes", encounterIds: ["s1-meter-house"] });

  it("keeps each campaign under its own key", () => {
    const storage = memoryStorage();
    saveCampaign(benchState(), storage);
    saveCampaign(skirmish(), storage);
    expect(storage.getItem(saveKeyFor(BENCH_ID))).toBe(encodeSave(benchState()));
    expect(storage.getItem(saveKeyFor("works-skirmishes"))).toBe(encodeSave(skirmish()));
  });

  it("never lets one campaign's save touch another's, in either direction", () => {
    const storage = memoryStorage();
    const chapter = benchState();
    saveCampaign(chapter, storage);

    saveCampaign(skirmish(), storage);
    const afterSkirmish = loadCampaign(BENCH_ID, storage);
    expect(afterSkirmish.ok).toBe(true);
    if (afterSkirmish.ok) expect(afterSkirmish.campaign).toEqual(chapter);

    let advanced = skirmish();
    advanced = { ...advanced, encounterIndex: 1, completedEncounterIds: ["s1-meter-house"] };
    saveCampaign(advanced, storage);
    saveCampaign(chapter, storage);
    const afterChapter = loadCampaign("works-skirmishes", storage);
    expect(afterChapter.ok).toBe(true);
    if (afterChapter.ok) expect(afterChapter.campaign.completedEncounterIds).toEqual([
      "s1-meter-house",
    ]);
  });
});

describe("migrating the shared save key", () => {
  it("moves a legacy save to the key for the campaign it names", () => {
    const state = benchState();
    const storage = memoryStorage({ [LEGACY_SAVE_KEY]: encodeSave(state) });

    expect(migrateSaves(storage)).toBe(BENCH_ID);
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBeNull();

    const loaded = loadCampaign(BENCH_ID, storage);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.campaign).toEqual(state);
  });

  it("is idempotent", () => {
    const storage = memoryStorage({ [LEGACY_SAVE_KEY]: encodeSave(benchState()) });
    expect(migrateSaves(storage)).toBe(BENCH_ID);
    const migrated = storage.getItem(saveKeyFor(BENCH_ID));

    expect(migrateSaves(storage)).toBeNull();
    expect(migrateSaves(storage)).toBeNull();
    expect(storage.getItem(saveKeyFor(BENCH_ID))).toBe(migrated);
  });

  it("does nothing when there was never a legacy save", () => {
    const storage = memoryStorage();
    expect(migrateSaves(storage)).toBeNull();
    expect(storage.getItem(saveKeyFor(BENCH_ID))).toBeNull();
  });

  it("refuses to overwrite a per-campaign save that already exists", () => {
    const legacy = benchState();
    let current = benchState();
    current = { ...current, encounterIndex: 1, completedEncounterIds: ["e1-marshaling-yard"] };
    const storage = memoryStorage({
      [LEGACY_SAVE_KEY]: encodeSave(legacy),
      [saveKeyFor(BENCH_ID)]: encodeSave(current),
    });

    expect(migrateSaves(storage)).toBeNull();
    expect(storage.getItem(saveKeyFor(BENCH_ID))).toBe(encodeSave(current));
  });

  it("leaves a legacy blob it cannot read exactly where it is", () => {
    const storage = memoryStorage({ [LEGACY_SAVE_KEY]: "{not json" });
    expect(migrateSaves(storage)).toBeNull();
    expect(storage.getItem(LEGACY_SAVE_KEY)).toBe("{not json");
  });
});

describe("save validation", () => {
  it("rejects non-JSON", () => {
    expect(decodeSave("{not json")).toEqual({
      ok: false,
      reason: "Save data is not valid JSON",
      unreadable: true,
    });
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
    expect(outcome).toEqual({
      ok: false,
      reason: "Save data is not a campaign",
      unreadable: true,
    });
  });

  /**
   * Every field the campaign screens dereference has to be gated here, or the
   * blob reaches them typed as a campaign and the screen throws. The register
   * reads `completedEncounterIds.length` on the way in.
   */
  it("rejects a campaign whose completedEncounterIds is missing or not an array", () => {
    const { completedEncounterIds: _dropped, ...withoutField } = benchState();
    expect(decodeSave(JSON.stringify({ saveVersion: SAVE_VERSION, campaign: withoutField })).ok).toBe(
      false,
    );

    const wrongType = { ...benchState(), completedEncounterIds: "e1-marshaling-yard" };
    expect(decodeSave(JSON.stringify({ saveVersion: SAVE_VERSION, campaign: wrongType })).ok).toBe(
      false,
    );
  });
});

/**
 * A record that will not open is still a record: the caller has to be able to
 * tell it apart from an empty key, because only one of the two is safe to
 * write over.
 */
describe("a save that will not decode", () => {
  it("is reported as unreadable, not as a campaign never played", () => {
    const storage = memoryStorage({ [saveKeyFor(BENCH_ID)]: "{not json" });
    const outcome = loadCampaign(BENCH_ID, storage);
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.unreadable).toBe(true);
  });

  it("reads a future save version as unreadable rather than absent", () => {
    const text = JSON.stringify({ saveVersion: SAVE_VERSION + 1, campaign: benchState() });
    const outcome = loadCampaign(BENCH_ID, memoryStorage({ [saveKeyFor(BENCH_ID)]: text }));
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.unreadable).toBe(true);
  });

  it("leaves the blob exactly where it is: loading never writes", () => {
    const storage = memoryStorage({ [saveKeyFor(BENCH_ID)]: "{not json" });
    loadCampaign(BENCH_ID, storage);
    expect(storage.getItem(saveKeyFor(BENCH_ID))).toBe("{not json");
  });
});

describe("the default storage", () => {
  it("shares one in-memory stand-in across calls, so a save survives to the load", () => {
    if ("localStorage" in globalThis) return;
    const state = benchState();
    saveCampaign(state);
    const loaded = loadCampaign(BENCH_ID);
    expect(loaded.ok).toBe(true);
    if (loaded.ok) expect(loaded.campaign).toEqual(state);
    clearCampaign(BENCH_ID);
  });
});
