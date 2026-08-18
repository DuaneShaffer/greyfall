// PORTRAIT ASSETS — the `portraitId` keyed lookup every portrait slot reads.
//
// Painted portraits are commissioned externally (art-src/PORTRAIT_BRIEFS.md);
// this is the seam they land on, and until they do every lookup misses and
// `portrait()` draws the monogram record card instead (UI_DESIGN §9). Nothing
// here loads or decodes anything: the app registers whatever the build found,
// the UI asks by id.
//
// One asset per character, never two. The brief is explicit that the head chip
// is a crop and not a delivered asset, so the small slots take the same plate
// and cut CHIP_RECT out of it in CSS.

/** The in-game portrait plate, per ART_DIRECTION §4. Masters are 4× this. */
export const PORTRAIT_PLATE = { width: 128, height: 160 } as const;

/**
 * The head chip, cut out of the plate above and halved to 32×32 — (128, 64,
 * 256, 256) in master terms. Every square portrait slot shows this rect; the
 * 4:5 slots show the whole plate.
 */
export const CHIP_RECT = { x: 32, y: 16, width: 64, height: 64 } as const;

export interface PortraitAsset {
  /**
   * The whole plate, at any resolution ≥ 128×160 (the shipped texture is 2×).
   * Used directly as a CSS `url()`, so a bundler-hashed path is what belongs
   * here rather than a filename.
   */
  plate: string;
}

const assets = new Map<string, PortraitAsset>();

/**
 * File a delivered portrait against the `portraitId` the data already carries.
 * Ids come from `data/units/*.json` and `DialogueLine.portraitId`; an id nothing
 * references is filed and simply never asked for.
 */
export function registerPortrait(portraitId: string, asset: PortraitAsset): void {
  assets.set(portraitId, asset);
}

/** Intake in bulk: `{ rowen: { plate: url } }`, as a manifest or a glob. */
export function registerPortraits(entries: Readonly<Record<string, PortraitAsset>>): void {
  for (const [portraitId, asset] of Object.entries(entries)) registerPortrait(portraitId, asset);
}

export function portraitAsset(portraitId: string | undefined): PortraitAsset | null {
  if (portraitId === undefined) return null;
  return assets.get(portraitId) ?? null;
}

/** Tests and the harness; the app registers once at boot and never clears. */
export function clearPortraits(): void {
  assets.clear();
}
