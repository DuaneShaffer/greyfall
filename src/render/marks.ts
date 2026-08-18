// Whose turn it is, and what is riding on each unit. Both are facts the panels
// already held and the field never showed: a blind playtest could not tell which
// figure was about to act — its own or the enemy's — and a unit carrying three
// statuses looked exactly like one carrying none.
//
// These are not board state, so they are not in the view model: they are marks
// laid over whatever `buildScene` last drew, and re-applied after a rebuild.
//
// The input shape is structural on purpose. `BattleHudView.field.units` already
// carries these fields (UI_DESIGN §14.3) and nothing in `src/render` may import
// `src/ui`, so the seam is the shape rather than the type.

/** Statuses on one unit, counted by kind: the field paints a chip, not a list. */
export interface UnitStatusCounts {
  readonly buffs: number;
  readonly debuffs: number;
}

export const NO_STATUSES: UnitStatusCounts = { buffs: 0, debuffs: 0 };

/** The fields of one `field.units` entry the marks are read off. */
export interface MarkedUnit {
  readonly unitId: string;
  readonly statuses: readonly { readonly category: "buff" | "debuff" }[];
}

export interface FieldMarks {
  /** Whose turn it is. Both sides: knowing whose enemy turn it is matters too. */
  readonly activeUnitId: string | null;
  /** Only the units carrying something; absence is the common case. */
  readonly statuses: ReadonlyMap<string, UnitStatusCounts>;
}

export const NO_MARKS: FieldMarks = { activeUnitId: null, statuses: new Map() };

export const fieldMarksFrom = (
  activeUnitId: string | null,
  units: readonly MarkedUnit[],
): FieldMarks => {
  const statuses = new Map<string, UnitStatusCounts>();
  for (const unit of units) {
    let buffs = 0;
    let debuffs = 0;
    for (const status of unit.statuses) {
      if (status.category === "buff") buffs += 1;
      else debuffs += 1;
    }
    if (buffs > 0 || debuffs > 0) statuses.set(unit.unitId, { buffs, debuffs });
  }
  return { activeUnitId, statuses };
};

export const statusesOf = (marks: FieldMarks, unitId: string): UnitStatusCounts =>
  marks.statuses.get(unitId) ?? NO_STATUSES;
