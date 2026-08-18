import type { MenuDef, MenuEntry, MenuStack } from "../menu.js";

/**
 * The briefing: what the engagement is for, how the systems it is fought with
 * work, and the way out of it.
 *
 * It exists because Escape at the root did nothing at all. A tactics game's root
 * menu is the one place a player looks for the rules it never printed, and the
 * blind playtest reached the end of a battle without learning what Standing was,
 * what a cast did to a turn, or why anybody would throw a breaker.
 *
 * It is pages of prose, laid out as menus so the stack's own keyboard, hover and
 * right-click carry it. Confirming a line closes the page it is on: the rows are
 * something to read, not orders to give, and a row that did nothing at all would
 * be the affordance lie §8 forbids.
 */

export const BRIEFING_ID = "battle-briefing";
export const OBJECTIVES_ID = "briefing-objectives";
export const SYSTEMS_ID = "briefing-systems";
export const FORFEIT_ID = "briefing-forfeit";

/** No encounter has said, and the interface does not invent one (§14.4). */
export const NO_OBJECTIVE = "No standing orders recorded.";
export const OBJECTIVE_FALLBACK = "The engagement closes when one side cannot answer.";

export interface SystemsNote {
  readonly id: string;
  readonly label: string;
  readonly line: string;
}

// CANONICAL WORDING PENDING. A content pass owns the final phrasing of these in
// docs; this is the interface's own version, written off COMBAT_RULES §5, §7,
// §11, §14a and PROGRESSION §2 so that nothing here can be wrong about the
// rules while the wording is settled.
export const SYSTEMS_NOTES: readonly SystemsNote[] = [
  {
    id: "standing",
    label: "Standing",
    line: "Ten for every action a unit resolves. On a win it banks into the job that unit fought in, and only that job's account can buy that job's abilities.",
  },
  {
    id: "charge",
    label: "Charge",
    line: "What an order costs the unit that gives it. A greyed order says the charge it wanted; a cast pays when the cast starts, not when it lands.",
  },
  {
    id: "cast",
    label: "Cast speed",
    line: "An ability with a cast joins the queue instead of resolving: it banks its speed each tick and fires at 100. The queue lists it, so a charge already sent is a fact you can read.",
  },
  {
    id: "doctrine",
    label: "Doctrine",
    line: "A job's skillset. A unit fights in one job and may borrow a second set, so Act is one column per doctrine — and Standing banked in one job never buys the other's.",
  },
  {
    id: "power",
    label: "Power",
    line: "Machinery is live only while something still feeds it, and inert the moment nothing does. Throwing a breaker cuts the bus behind it: a lift's deck drops to the terrain under it, a press stops, a lamp goes out. It is how a machine is turned off without spending a shot on it.",
  },
  {
    id: "facing",
    label: "Facing",
    line: "FRONT, SIDE or BACK, read from where the attacker stands. Side halves the target's evade and the back ignores it, so where a unit is standing decides whether an order lands — never how hard.",
  },
  {
    id: "elevation",
    label: "Elevation",
    line: "Height decides half the aim gate: every reach carries a vertical allowance, and the tile readout prints the difference against the unit whose turn it is.",
  },
];

export interface BriefingOptions {
  /** The encounter's own line, or null for one nobody wrote up. */
  objective: () => string | null;
  /** Confirmed twice. The engagement is lost and the force returns to the roster. */
  onForfeit: () => void;
}

/** A page of prose. Confirming a line closes it; Escape and right-click do too. */
function prosePage(
  menus: MenuStack,
  id: string,
  title: string,
  entries: MenuEntry[],
): MenuDef {
  return { id, title, entries, onSelect: () => void menus.pop() };
}

export function objectivesPage(menus: MenuStack, objective: string | null): MenuDef {
  return prosePage(menus, OBJECTIVES_ID, "Objectives", [
    objective === null
      ? { id: "none", label: NO_OBJECTIVE, note: OBJECTIVE_FALLBACK }
      : { id: "objective", label: objective },
  ]);
}

export function systemsPage(menus: MenuStack): MenuDef {
  return prosePage(
    menus,
    SYSTEMS_ID,
    "Systems",
    SYSTEMS_NOTES.map((note) => ({ id: note.id, label: note.label, note: note.line })),
  );
}

export function forfeitPage(menus: MenuStack, onForfeit: () => void): MenuDef {
  return {
    id: FORFEIT_ID,
    title: "Forfeit",
    entries: [
      { id: "stay", label: "Keep fighting" },
      {
        id: "forfeit-confirm",
        label: "Forfeit the engagement",
        note: "The field is given up and the force returns to the roster.",
      },
    ],
    onSelect: (entry) => {
      if (entry.id === "forfeit-confirm") onForfeit();
      else menus.pop();
    },
  };
}

/** The briefing itself, ready to push onto the battle's own menu stack. */
export function briefingMenu(menus: MenuStack, options: BriefingOptions): MenuDef {
  return {
    id: BRIEFING_ID,
    title: "Briefing",
    entries: [
      { id: "objectives", label: "Objectives", note: "What this engagement is for" },
      { id: "systems", label: "Systems", note: "What the rules do" },
      { id: "forfeit", label: "Forfeit", note: "Give up the field" },
    ],
    onSelect: (entry) => {
      if (entry.id === "objectives") menus.push(objectivesPage(menus, options.objective()));
      else if (entry.id === "systems") menus.push(systemsPage(menus));
      else if (entry.id === "forfeit") menus.push(forfeitPage(menus, options.onForfeit));
    },
  };
}
