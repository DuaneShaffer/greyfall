// The verb, said once. A player who has never met this interface has no way to
// know a row is confirmed rather than dragged, and the playtest spent its first
// menu finding out. Once is the whole point: a hint on every list is chrome.

let spent = false;

export const VERB_HINT = "Click a row or press Enter to confirm it.";

/**
 * The hint, if nothing has taken it yet. Whichever menu the session opens on
 * gets it, and no menu after that does.
 */
export function takeVerbHint(): string | null {
  if (spent) return null;
  spent = true;
  return VERB_HINT;
}

/** Tests only: a session boundary the process does not otherwise have. */
export function resetVerbHint(): void {
  spent = false;
}
