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
  /** `docs/SYSTEMS_COPY.md`'s own key for this entry. */
  readonly id: string;
  readonly label: string;
  /** The collapsed row: what the system is, in one sentence. */
  readonly line: string;
  /** The page the row opens, one paragraph per entry. */
  readonly body: readonly string[];
}

/**
 * The help pages themselves. The copy is `docs/SYSTEMS_COPY.md` and that file is
 * the source (UI_DESIGN §15.3): every entry's `id` is that file's own `key`, its
 * `line` is the collapsed row, and its `body` is the page that row opens. A wave
 * that ships provisional strings reconciles to the file, never the other way
 * round, so nothing here is edited on the way in except the markdown emphasis
 * and the rule citations — a player reading a help page is not being sent to
 * `COMBAT_RULES`.
 */
export const SYSTEMS_NOTES: readonly SystemsNote[] = [
  {
    id: "power",
    label: "Power",
    line: "Every machine on the map is either being fed or it is not, and the register says which.",
    body: [
      "A map's machinery hangs on a grid: mains that supply it, cable runs that carry it, and sinks — presses, hoists, lifts, lamps — that draw from it. The POWER register under the turn queue is the whole grid as a ledger, one row per node, and it flips the instant anybody changes the topology.",
      "LIVE means the node is being fed and will do its job. DEAD means nothing is reaching it: a main is out, a span is gone, or the switch above it is open. A dead machine is not a broken machine — feed it again and it works. Two rows say how it went dead, because the answer decides which order fixes it: CUT is a severed span and wants a splice, TRIPPED is a main that blew under load and wants a reclose, DESTROYED is permanent, and TIE OPEN / TIE CLOSED is a breaker sitting where somebody left it. Inert is a machine with no electrical part at all.",
      "A component's LOAD is what its sinks and any hung loads draw against its mains' capacity. Push load past capacity and the mains trip — the whole component at once, and it stays dark until someone walks to the board and recloses it. There is no shedding and no partial brown-out: the floor goes.",
    ],
  },
  {
    id: "power-breaker",
    label: "Throwing a breaker",
    line: "One action at a switch decides what a whole branch is today.",
    body: [
      "Anybody standing at a switch can throw it; a Conduit can throw one from across the floor. It is worth an action when the thing downstream is working against you — a turret drawing off the bus, a press cycling on the aisle you need, an Augmented or a Conduit whose kit is being fed by the map. It is worth it in the other direction too: reclosing a main is how you get a lift, a hoist or a gallery light back, and a floor nobody thinks to relight is a floor that stays dark.",
      "Throwing a breaker is a topology edit, not a flag flip. Open the mains switch and every sink below it drops in the same action; open a tie and one bus stops carrying for the other, which is how a component that was comfortable becomes a component that trips.",
    ],
  },
  {
    id: "power-freight-lift",
    label: "The Freight Lift, Marshaling Yard",
    line: "The lift's deck exists while the lift is fed. Kill its power and the deck is not there any more.",
    body: [
      "The Freight Lift decks the tiles it covers at its own height while it is being fed, and the Signal Switch beside it toggles that feed. Stand on the deck and you are standing two heights up, with the reach and the sight line that buys. Throw the switch and the deck reverts to the ground under it — height, pathing and line of sight all change in the same instant, for whoever is up there and whoever was shooting at them. The switch needs no power itself, so nobody can lock you out of it, and it works from either side.",
    ],
  },
  {
    id: "standing",
    label: "Standing",
    line: "Ten Standing for every order a unit resolves, banked into the job it fought in when the battle is won.",
    body: [
      "Standing is what a unit earns for doing the work: a flat ten each time it resolves an action. Moving earns nothing and waiting earns nothing — a unit that walks the whole battle without acting finishes it no better off than it started.",
      "On a win, each deployed unit's earned Standing is banked into the job it fought the battle in, and that account is where its abilities are bought from. Standing does not cross between jobs: a Conduit's Standing will never buy an Enforcer order, and changing job opens a fresh account at zero. A loss banks nothing — the roster goes back to exactly the state it deployed in, and the engagement can be fought again.",
      "Each job account keeps two numbers. What the job has ever earned sets its level, and is never spent down; what is unspent is what learning draws on. So buying an ability costs you the price and never costs you a level.",
    ],
  },
  {
    id: "charge",
    label: "Charge",
    line: "Carried flux. Every order that spends it says how much, and nothing refills it out of nowhere.",
    body: [
      "Charge is the flux a unit is carrying — in cells on its belt, in the housings of its grafts. Its ceiling is the unit's Charge stat, off the job's curve and whatever kit it is wearing, and most orders that do anything but swing a weapon spend some.",
      "Nobody makes charge. It is refilled by taking it off something that has it: tapping a live main, breaking a cell tab, siphoning it out of somebody else's rig. That is why a Conduit on a dead floor with nothing racked is nearly powerless, and why finding the map's power is the first half of playing one.",
    ],
  },
  {
    id: "cast-speed",
    label: "Cast speed",
    line: "An order with a cast speed leaves your hands and lands later. The higher the number, the sooner it gets there.",
    body: [
      "Most orders resolve the moment they are given. An order with a cast speed does not: it goes onto its own clock, banks that many points each tick, and fires when it reaches a hundred. A cast speed of 50 lands in half the time one of 25 does.",
      "Three things follow, and all three are the price of the reach and the size that bought the cast in the first place. The flux and any blood it costs are spent when the cast begins, not when it lands. Beginning it ends the unit's turn immediately. And an order aimed at a unit is pinned to the tile that unit was standing on — it lands where it was aimed, so a target who walks out is a target you missed. Down the caster before it fires and it never fires.",
    ],
  },
  {
    id: "resolve",
    label: "Resolve",
    line: "Grit under fire, nought to a hundred. It is the rate at which a unit's reaction answers.",
    body: [
      "Resolve is how steady a unit is when it is being hit. It is read straight as the trigger rate of whatever reaction the unit has slotted: at Resolve 60 the reaction answers six times in ten, and there is no hidden second roll behind that.",
      "It is a measured fact about a person, not a mood. Sergeants grade Resolve in the yard and it goes on the record, which is why the player reads the number instead of guessing at it. Some orders and some events move it, up and down, and those changes stick.",
    ],
  },
  {
    id: "attunement",
    label: "Attunement",
    line: "How hard a body couples to flux, nought to a hundred. It is power and vulnerability in the same number.",
    body: [
      "Attunement scales every flux-based amount twice — once by the Attunement of whoever cast it, once by the Attunement of whoever it lands on. A high-Attunement Conduit therefore hits harder than a low one, and is hit harder by the next Conduit she meets. There is no way to buy the first half without buying the second; the Augmented job trades Resolve for Attunement on purpose and pays for it exactly this way.",
      "Machinery and bare ground have no Attunement and are treated as unscaled, so a Conduit's numbers against a machine do not move with anybody's disposition. Kit and chemistry that are deliberately not flux-driven — a coagulant, a thrown flask — say so and scale with nothing.",
      "The Assay measures Attunement to issue a licence, so like Resolve it is a filed fact rather than a secret.",
    ],
  },
  {
    id: "damage-types",
    label: "Damage types and resistance",
    line: "Four types: Kinetic, Arc, Thermal, Chemical. Nothing on the field resists a type, and there is no elemental weakness to find.",
    body: [
      "A type says what the damage is — a maul, a discharge, a flame, a compound — so the log, the popup and the fiction all agree about what happened. It is also how the world stays honest: an Arc order has to have drawn its charge from somewhere, and a Chemical one from a bench.",
      "Type does not change a number. There is no resistance table, no armour class per type, no target that takes half from Thermal and double from Arc. What actually moves a number is the acting unit's stats, the target's Attunement where the amount is flux-based, height, facing and evasion. If a type seems to be doing more work, it is the status that usually rides with it — a Thermal order that sets Scalded, an Arc one that sets Flux Burn — and those are printed beside the order with their own odds.",
      "One quiet consequence worth knowing: the blood an order costs its own user is filed as Chemical damage to that user.",
    ],
  },
  {
    id: "borrow-a-skillset",
    label: "Borrowing a skillset",
    line: "A unit fights out of one job and may borrow a second job's orders. Borrowed means already paid for, in that job, by that unit.",
    body: [
      "Every unit has a primary job — the sheet it wears, the stats it grows on, the kit it may carry. It may also name a secondary job, and the orders it has already bought in that job appear on its menu beside its own. Nothing is granted by borrowing: the secondary only surfaces what that unit paid for out of that job's Standing, back when it was working in it.",
      "Only action orders come and go this way. A reaction, a support or a movement ability, once bought, can be slotted whatever job the unit is currently in — the purchase is permanent even when the skillset is not.",
      "Change primary job and the old action list leaves the menu; borrow it back as a secondary and it returns unbought. A secondary that collides with the new primary is cleared, and kit the new job has no ticket for goes back to stores.",
    ],
  },
  {
    id: "doctrine",
    label: "Doctrine",
    line: "A faction's written procedure: the drill it trains, and the finding it files afterwards. It is a fact about the world, not a stat.",
    body: [
      "Half the orders in the game are named out of somebody's doctrine, so the word needs defining rather than assuming. Doctrine is a standing written procedure — what an organisation trains its people to do, and what it will record as having happened. The House Watch's doctrine is a wall of shields and patience: hold ground, pin, take alive where taking alive is possible, and file the result as compliance. The Assay Sodality's doctrine is purity and licence: what may be refined, who may be attuned, and which of the two documents goes into the Archive.",
      "The Combine does not use the word. What the Watch calls a doctrine, a yard hand calls the line — and a line is a place people are standing, not a procedure.",
      "Nothing in the engine reads doctrine. When an order's text says Watch doctrine for something, it is telling you who taught it and what they meant it for, and the numbers beside it are the whole of what it does.",
    ],
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

/** The index: one row per system, saying what it is before it is opened. */
export function systemsPage(menus: MenuStack): MenuDef {
  return {
    id: SYSTEMS_ID,
    title: "Systems",
    entries: SYSTEMS_NOTES.map((note) => ({ id: note.id, label: note.label, note: note.line })),
    onSelect: (entry) => {
      const note = SYSTEMS_NOTES.find((candidate) => candidate.id === entry.id);
      if (note !== undefined) menus.push(systemNotePage(menus, note));
    },
  };
}

/** One system's page, a row per paragraph. Confirming any of them closes it. */
export function systemNotePage(menus: MenuStack, note: SystemsNote): MenuDef {
  return prosePage(
    menus,
    `${SYSTEMS_ID}-${note.id}`,
    note.label,
    note.body.map((paragraph, index) => ({ id: `${note.id}-${index + 1}`, label: paragraph })),
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
