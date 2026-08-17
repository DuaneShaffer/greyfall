// PORTRAIT INTAKE, browser side. Painted portraits are produced externally
// (art-src/PORTRAIT_BRIEFS.md) and land here as one game-ready file per
// character, named for the `portraitId` the data already carries:
//
//   art/portraits/<portraitId>.png   — the plate, 256 x 320 (the 2x shipped
//                                      texture of the 128 x 160 in-game size)
//
// Nothing else is delivered: the 32 x 32 head chip is a crop of this file, cut
// in CSS from the rect the briefs fix, so a character is one asset and the queue
// chip can never drift from the dialogue plate.
//
// Globbing rather than a hand-written manifest, for the same reason `content.ts`
// globs `data/`: the art workstream lands files continuously and nothing here
// should need editing when it does. The directory is empty until the first
// portrait is accepted, and every slot falls back to the monogram record card
// (UI_DESIGN §9) — which is not a placeholder, since most of the cast will never
// be painted.

import { registerPortraits, type PortraitAsset } from "../ui/index.js";

const FILES: Record<string, string> = import.meta.glob("../../art/portraits/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});

const portraitIdFromPath = (path: string): string =>
  path.slice(path.lastIndexOf("/") + 1).replace(/\.png$/i, "");

/** File whatever the build found. Called once, from the browser entry. */
export function loadPortraitArt(): string[] {
  const assets: Record<string, PortraitAsset> = {};
  for (const [path, url] of Object.entries(FILES)) {
    assets[portraitIdFromPath(path)] = { plate: url };
  }
  registerPortraits(assets);
  return Object.keys(assets).sort();
}
