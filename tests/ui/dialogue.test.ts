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

  it("stays hidden with no lines", () => {
    const dialogue = box();
    dialogue.update([]);
    expect(dialogue.el.classList.contains("is-hidden")).toBe(true);
    expect(dialogue.isOpen).toBe(false);
  });
});
