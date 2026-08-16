/** @vitest-environment happy-dom */
// The network-level presentation (FLUX_GRID §5.4). Every one of these must
// reach its terminal state on its own, because `skip()` jumps straight there,
// and applying one twice must change nothing.

import { describe, expect, it } from "vitest";
import type { GameMap } from "../../src/data/schemas/map.js";
import { ObjectVisual } from "../../src/render/objects.js";
import { PresentationQueue, type Animation, type RenderEvent } from "../../src/render/presentation.js";
import {
  gridStrainAnimation,
  gridTripAnimation,
  spanAnimation,
  type GridNodeVisual,
  type SpanVisual,
} from "../../src/render/scene.js";
import type { MapObjectView } from "../../src/render/viewmodel.js";

const map: GameMap = {
  schemaVersion: 1,
  id: "grid-render",
  name: "Grid Render",
  width: 2,
  depth: 2,
  tiles: Array.from({ length: 4 }, () => ({ height: 0, terrain: "plain" as const })),
  objects: [],
  deploymentTiles: [{ x: 0, y: 0 }],
  grids: [],
};

const objectView = (): MapObjectView => ({
  id: "north-bus",
  kind: "machine",
  spriteId: "machine",
  tiles: [{ x: 0, y: 0 }],
  surfaceHeight: null,
  powered: true,
  destroyed: false,
  severed: false,
  volatile: false,
});

const recorder = (): GridNodeVisual & { readings: number[] } => {
  const readings: number[] = [];
  return { readings, setOverload: (amount) => void readings.push(amount) };
};

const play = (animation: Animation): void => {
  animation.update(animation.duration / 2);
  animation.finish();
};

describe("the seams settling onto new headroom", () => {
  it("ends on the strain the event names, however it is driven", () => {
    const skipped = recorder();
    gridStrainAnimation([skipped], 0.6).finish();

    const played = recorder();
    play(gridStrainAnimation([played], 0.6));

    expect(skipped.readings.at(-1)).toBe(0.6);
    expect(played.readings.at(-1)).toBe(0.6);
  });

  it("is idempotent: finishing twice is finishing once", () => {
    const visual = recorder();
    const animation = gridStrainAnimation([visual], 1);
    animation.finish();
    animation.finish();
    expect(new Set(visual.readings)).toEqual(new Set([1]));
  });
});

describe("a component blowing", () => {
  it("flares and leaves nothing straining, because the trip is total", () => {
    const visual = recorder();
    const animation = gridTripAnimation([visual]);
    animation.update(animation.duration / 2);
    expect(visual.readings.at(-1)).toBeGreaterThan(0);
    animation.finish();
    animation.finish();
    expect(visual.readings.at(-1)).toBe(0);
  });

  it("reaches the same end when it is skipped unplayed", () => {
    const visual = recorder();
    gridTripAnimation([visual]).finish();
    expect(visual.readings).toEqual([0]);
  });
});

describe("a span cut and made good again", () => {
  const spanRecorder = (): SpanVisual & { states: boolean[] } => {
    const states: boolean[] = [];
    return { states, setSevered: (severed) => void states.push(severed) };
  };

  it("settles severed and sparks exactly once", () => {
    const visual = spanRecorder();
    let sparks = 0;
    const animation = spanAnimation(visual, true, () => {
      sparks += 1;
    });
    animation.update(0);
    animation.update(animation.duration);
    animation.finish();
    animation.finish();
    expect(sparks).toBe(1);
    expect(visual.states).toEqual([true, true]);
  });

  it("sparks even when it is skipped straight to the end", () => {
    const visual = spanRecorder();
    let sparks = 0;
    spanAnimation(visual, false, () => {
      sparks += 1;
    }).finish();
    expect(sparks).toBe(1);
    expect(visual.states).toEqual([false]);
  });
});

describe("the object visual the events write to", () => {
  it("parts a cut span along its run and stands it back up", () => {
    const visual = new ObjectVisual(map, objectView());
    const whole = visual.group.scale.x;

    visual.setSevered(true);
    const parted = visual.group.scale.x;
    visual.setSevered(true);
    expect(visual.group.scale.x).toBe(parted);
    expect(parted).toBeLessThan(whole);
    expect(parted).toBeGreaterThan(0);
    // A gap and a kink, not a sag: a wreck squashes, a cut stays standing.
    expect(visual.group.scale.y).toBe(1);
    expect(visual.group.rotation.y).not.toBe(0);

    visual.setSevered(false);
    expect(visual.group.scale.x).toBe(whole);
    expect(visual.group.rotation.y).toBe(0);
    visual.dispose();
  });

  it("reads nothing like a wreck, and a wreck outranks it", () => {
    const cut = new ObjectVisual(map, objectView());
    cut.setSevered(true);
    const wrecked = new ObjectVisual(map, objectView());
    wrecked.setDestroyed(true);

    expect(cut.group.scale.y).not.toBe(wrecked.group.scale.y);
    expect(cut.group.rotation.z).not.toBe(wrecked.group.rotation.z);

    // Destruction is permanent and takes over: a cut span that is then blown up
    // stops reading as a cut.
    cut.setDestroyed(true);
    expect(cut.group.scale.x).toBe(wrecked.group.scale.x);
    expect(cut.group.rotation.y).toBe(0);
    cut.dispose();
    wrecked.dispose();
  });

  // The bug this closes: the cut lived only in the animation that made it, so
  // any rebuild (load game, a spawn, a resize) put the span back together.
  it("builds severed straight from the view model, so a rebuild keeps the cut", () => {
    const rebuilt = new ObjectVisual(map, { ...objectView(), severed: true });
    const reference = new ObjectVisual(map, objectView());
    reference.setSevered(true);

    expect(rebuilt.group.scale.x).toBe(reference.group.scale.x);
    expect(rebuilt.group.rotation.y).toBe(reference.group.rotation.y);
    rebuilt.dispose();
    reference.dispose();
  });
});

describe("the queue these are played through", () => {
  it("skips every grid event straight to its end, in order", () => {
    const finished: string[] = [];
    const queue = new PresentationQueue((event) => ({
      duration: 1,
      update: () => {},
      finish: () => void finished.push(event.kind),
    }));
    const events: RenderEvent[] = [
      { kind: "gridChanged", gridId: "g", nodeIds: ["a"], strain: 0.6 },
      { kind: "gridTripped", gridId: "g", nodeIds: ["a"], capacity: 12, load: 14 },
      { kind: "gridReset", gridId: "g", nodeId: "main" },
      { kind: "lineSevered", objectId: "bus" },
      { kind: "lineSpliced", objectId: "bus" },
      { kind: "loadAttached", gridId: "g", nodeId: "bus", amount: 8 },
    ];
    queue.pushAll(events);
    queue.skip();
    expect(queue.isIdle).toBe(true);
    expect(finished).toEqual(events.map((event) => event.kind));
  });
});
