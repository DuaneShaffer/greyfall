/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import type { DialogueLine } from "../../src/data/index.js";
import { DialogueBox } from "../../src/ui/battle/dialogue.js";
import { recordingIntents } from "../../src/ui/intents.js";

const LINES: DialogueLine[] = [
  { speaker: "Maren Voss", text: "Ask who fired first." },
  { speaker: "Rowen Corvane", portraitId: "rowen", text: "I have orders." },
];

function box(intents?: ReturnType<typeof recordingIntents>["intents"]): DialogueBox {
  return new DialogueBox({ charIntervalMs: 10, ...(intents ? { intents } : {}) });
}

describe("DialogueBox", () => {
  it("reveals the current line one character at a time", () => {
    const dialogue = box();
    dialogue.update(LINES);

    expect(dialogue.visibleText).toBe("");
    dialogue.tick(30);
    expect(dialogue.visibleText).toBe("Ask");
    dialogue.tick(10);
    expect(dialogue.visibleText).toBe("Ask ");
    expect(dialogue.isRevealing).toBe(true);
  });

  it("names the speaker on the plate", () => {
    const dialogue = box();
    dialogue.update(LINES);
    expect(dialogue.el.querySelector(".gf-dialogue-speaker")?.textContent).toBe("Maren Voss");
  });

  it("Enter finishes the reveal before advancing", () => {
    const { intents, calls } = recordingIntents();
    const dialogue = box(intents);
    dialogue.update(LINES);

    dialogue.advance();
    expect(dialogue.visibleText).toBe(LINES[0]!.text);
    expect(dialogue.lineIndex).toBe(0);
    expect(calls).toHaveLength(0);

    dialogue.advance();
    expect(dialogue.lineIndex).toBe(1);
    expect(calls).toEqual([{ name: "advanceDialogue", args: [0] }]);
    expect(dialogue.el.querySelector(".gf-dialogue-speaker")?.textContent).toBe("Rowen Corvane");
    expect(dialogue.visibleText).toBe("");
  });

  it("closes after the last line and reports it", () => {
    const { intents, calls } = recordingIntents();
    const dialogue = box(intents);
    dialogue.update(LINES);

    for (let i = 0; i < 4; i++) dialogue.advance();
    expect(dialogue.isOpen).toBe(false);
    expect(dialogue.el.classList.contains("is-hidden")).toBe(true);
    expect(calls.map((call) => call.name)).toEqual(["advanceDialogue", "advanceDialogue", "endDialogue"]);
  });

  it("advances from an attached keyboard target", () => {
    const dialogue = box();
    dialogue.update(LINES);
    dialogue.attach(document);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(dialogue.visibleText).toBe(LINES[0]!.text);
    dialogue.destroy();
  });

  it("advances on a click, and shows the affordance once the line is out", () => {
    const dialogue = box();
    dialogue.update(LINES);
    const advance = dialogue.el.querySelector(".gf-dialogue-advance");
    expect(advance?.classList.contains("is-ready")).toBe(false);

    dialogue.el.click();
    expect(dialogue.visibleText).toBe(LINES[0]!.text);
    expect(advance?.classList.contains("is-ready")).toBe(true);

    dialogue.el.click();
    expect(dialogue.lineIndex).toBe(1);
    expect(dialogue.el.querySelector(".gf-dialogue-count")?.textContent).toBe("2 / 2");
  });

  it("dominates the frame for a scene and stays a card for a callout", () => {
    const dialogue = box();
    dialogue.update(LINES);
    expect(dialogue.el.classList.contains("is-scene")).toBe(true);

    // One line is a shout across the yard, not a scene.
    dialogue.update([{ speaker: "Watch Sergeant", text: "The cell is going up." }]);
    expect(dialogue.el.classList.contains("is-scene")).toBe(false);
  });

  it("gives the frame back the moment the last line is out", () => {
    const dialogue = box();
    dialogue.update(LINES);
    for (let i = 0; i < 4; i += 1) dialogue.advance();
    expect(dialogue.el.classList.contains("is-scene")).toBe(false);
    expect(dialogue.el.classList.contains("is-hidden")).toBe(true);
  });

  it("shows the whole 4:5 plate rather than the head chip", () => {
    const dialogue = box();
    dialogue.update(LINES);
    const slot = dialogue.el.querySelector(".gf-dialogue-portrait .gf-portrait");
    expect(slot?.classList.contains("is-large")).toBe(true);
  });

  it("stays hidden with no lines", () => {
    const dialogue = box();
    dialogue.update([]);
    expect(dialogue.el.classList.contains("is-hidden")).toBe(true);
    expect(dialogue.isOpen).toBe(false);
  });
});

// The blind playtest's worst input bug: the Enter that closed a dialogue box also
// confirmed the order the menu underneath was pointing at. One press is one
// instruction, so the box takes the key out of circulation rather than trusting
// whoever else is listening on the document to notice that it was spoken for.
describe("DialogueBox input buffering", () => {
  /** A menu, as far as the keyboard is concerned: it listens on the document. */
  function menuUnderneath(): { presses: () => number; stop: () => void } {
    let presses = 0;
    const listener = (): void => {
      presses += 1;
    };
    document.addEventListener("keydown", listener);
    return {
      presses: () => presses,
      stop: () => document.removeEventListener("keydown", listener),
    };
  }

  const press = (target: EventTarget, key = "Enter", repeat = false): void => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, repeat, bubbles: true, cancelable: true }));
  };

  const release = (target: EventTarget, key = "Enter"): void => {
    target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  };

  it("does not let an advancing Enter through to the menu, whoever listened first", () => {
    // Registered before the box attaches, and reached from a focused element, so
    // only a capture-phase claim can beat it.
    const menu = menuUnderneath();
    const focused = document.createElement("button");
    document.body.append(focused);
    const dialogue = box();
    dialogue.update(LINES);
    dialogue.attach(document);

    press(focused);

    expect(dialogue.visibleText).toBe(LINES[0]!.text);
    expect(menu.presses()).toBe(0);
    menu.stop();
    focused.remove();
    dialogue.destroy();
  });

  it("takes one line per press, not one per repeat", () => {
    const dialogue = box();
    dialogue.update(LINES);
    dialogue.attach(document);

    press(document);
    expect(dialogue.visibleText).toBe(LINES[0]!.text);
    press(document, "Enter", true);
    press(document, "Enter", true);
    expect(dialogue.lineIndex).toBe(0);

    release(document);
    press(document);
    expect(dialogue.lineIndex).toBe(1);
    dialogue.destroy();
  });

  it("drains the press that closed the box before the menu is given its keys", () => {
    const menu = menuUnderneath();
    // Exactly what main.ts does: the box reports the end of the dialogue and the
    // keyboard goes back to the menus inside that same keydown.
    const dialogue: DialogueBox = new DialogueBox({
      charIntervalMs: 10,
      intents: { endDialogue: () => dialogue.detach() },
    });
    dialogue.update([{ speaker: "Watch Sergeant", text: "Go." }]);
    dialogue.attach(document);

    // The first press finishes the reveal; the second closes the box.
    press(document);
    press(document);
    expect(dialogue.isOpen).toBe(false);
    expect(menu.presses()).toBe(0);

    // Still held: the repeats belong to the line that has just closed.
    press(document, "Enter", true);
    expect(menu.presses()).toBe(0);

    // Released, and the keyboard is the menu's again.
    release(document);
    press(document);
    expect(menu.presses()).toBe(1);
    menu.stop();
    dialogue.destroy();
  });

  it("leaves the menu's own keys alone", () => {
    const menu = menuUnderneath();
    const dialogue = box();
    dialogue.update(LINES);
    dialogue.attach(document);

    press(document, "ArrowDown");
    expect(menu.presses()).toBe(1);
    menu.stop();
    dialogue.destroy();
  });

  it("hands the keyboard back once it is detached with nothing held", () => {
    const menu = menuUnderneath();
    const dialogue = box();
    dialogue.update(LINES);
    dialogue.attach(document);
    dialogue.detach();

    press(document);
    expect(menu.presses()).toBe(1);
    menu.stop();
    dialogue.destroy();
  });
});
