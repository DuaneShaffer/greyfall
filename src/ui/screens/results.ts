import { Child, Component, el, plate, portrait, replaceChildren } from "../dom.js";
import { MenuDef, MenuStack } from "../menu.js";
import { BattleResultsView, ChapterCloseView, FallenEntryView } from "../state.js";

const ADVANCE_ID = "record-advance";

export interface RecordScreenOptions {
  /** Advancing a filed record is the player's act. Nothing here runs on a timer. */
  onAdvance?: () => void;
}

/** The roll of the dead, as a panel. `compact` drops the portraits for a list. */
export function fallenPanel(
  entries: readonly FallenEntryView[],
  options: { compact?: boolean; className?: string } = {},
): HTMLElement {
  const compact = options.compact ?? false;
  const body: Child[] =
    entries.length === 0
      ? [el("p", { class: "gf-empty-note", text: "Nobody was left behind." })]
      : [
          el("ul", {
            class: `gf-fallen-roll${compact ? " is-compact" : ""}`,
            children: entries.map((entry) =>
              el("li", {
                class: "gf-fallen-entry",
                data: { unit: entry.unitId },
                children: [
                  compact
                    ? null
                    : portrait(undefined, entry.name, {
                        size: "large",
                        team: "player",
                        jobName: entry.jobName,
                      }),
                  el("div", {
                    class: "gf-fallen-text",
                    children: [
                      el("p", { class: "gf-fallen-name", text: entry.name }),
                      el("p", {
                        class: "gf-fallen-job",
                        text: `${entry.jobName} · Level ${entry.level}`,
                      }),
                      el("p", { class: "gf-fallen-where", text: `Fell at ${entry.encounterName}` }),
                    ],
                  }),
                ],
              }),
            ),
          }),
          el("p", {
            class: "gf-fallen-note",
            text: "Struck from the roster. Their kit came back; they did not.",
          }),
        ];

  return el("section", {
    class: `gf-panel gf-fallen${entries.length === 0 ? " is-quiet" : ""}${
      options.className === undefined ? "" : ` ${options.className}`
    }`,
    children: [
      plate("The fallen", entries.length === 0 ? "NONE" : `${entries.length} STRUCK`),
      el("div", { class: "gf-panel-body", children: body }),
    ],
  });
}

function record(title: string, stamp: string | undefined, children: Child[]): HTMLElement {
  return el("section", {
    class: "gf-panel gf-record",
    children: [plate(title, stamp), el("div", { class: "gf-panel-body", children })],
  });
}

/**
 * The page between the battle and the roster: what the engagement banked, and
 * who is not coming back from it. A win banks and buries (PROGRESSION §3), and
 * burying somebody is not a three-second toast — the player files this record
 * themselves.
 */
export class BattleResultsScreen implements Component<BattleResultsView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly options: RecordScreenOptions;
  private readonly title: HTMLElement;
  private readonly note: HTMLElement;
  private readonly cols: HTMLElement;
  private readonly stamp: HTMLElement;

  constructor(options: RecordScreenOptions = {}) {
    this.options = options;
    this.menus = new MenuStack();
    this.title = el("h1", { class: "gf-screen-title" });
    this.note = el("p", { class: "gf-screen-note" });
    this.stamp = el("span", { class: "gf-record-serial" });
    this.cols = el("div", { class: "gf-screen-cols" });
    this.el = el("section", {
      class: "gf-screen gf-results",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", { class: "gf-screen-head-text", children: [this.title, this.note] }),
          ],
        }),
        this.cols,
        el("footer", { class: "gf-screen-foot", children: [this.menus.el, this.stamp] }),
      ],
    });
    this.menus.push(advanceMenu("File the record", () => this.options.onAdvance?.()));
  }

  update(view: BattleResultsView): void {
    this.el.classList.toggle("is-loss", view.result === "loss");
    this.title.textContent = view.headline;
    this.note.textContent = `${view.encounterName} · ${view.note}`;
    this.stamp.textContent = `FILED · ${view.encounterId}`;
    replaceChildren(this.cols, [this.ledger(view), this.aftermath(view)]);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private ledger(view: BattleResultsView): HTMLElement {
    if (view.result === "loss") {
      return record("Nothing banked", "0", [
        el("p", {
          class: "gf-detail-text",
          text: "A loss changes nothing. No Standing banked, no kit spent, nobody struck from the roster.",
        }),
      ]);
    }

    const rows: Child[] =
      view.standing.length === 0
        ? [el("p", { class: "gf-empty-note", text: "No Standing was earned out there." })]
        : [
            el("ul", {
              class: "gf-record-list",
              children: view.standing.map((award) =>
                el("li", {
                  class: `gf-record-row${award.struck ? " is-struck" : ""}`,
                  data: { unit: award.unitId },
                  children: [
                    el("span", { class: "gf-record-name", text: award.name }),
                    el("span", { class: "gf-record-amount", text: `+${award.amount}` }),
                    el("span", {
                      class: "gf-record-note",
                      children: [
                        el("span", {
                          text: award.struck
                            ? `${award.jobName} · struck from the roster`
                            : `${award.jobName} level ${award.jobLevel}`,
                        }),
                        award.jobLevelsGained > 0 && !award.struck
                          ? el("span", {
                              class: "gf-record-gain",
                              text: ` +${award.jobLevelsGained}`,
                            })
                          : null,
                      ],
                    }),
                  ],
                }),
              ),
            }),
          ];

    const kit: Child[] =
      view.consumed.length === 0
        ? []
        : [
            el("p", { class: "gf-panel-subtitle", text: "Field kit spent" }),
            el("ul", {
              class: "gf-record-list is-kit",
              children: view.consumed.map((stack) =>
                el("li", {
                  class: "gf-record-row",
                  data: { item: stack.itemId },
                  children: [
                    el("span", { class: "gf-record-name", text: stack.name }),
                    el("span", { class: "gf-record-amount", text: `-${stack.count}` }),
                  ],
                }),
              ),
            }),
          ];

    return record("Standing banked", String(view.standingTotal), [...rows, ...kit]);
  }

  /** The other half of a win: who paid for it. */
  private aftermath(view: BattleResultsView): HTMLElement {
    if (view.result === "loss") {
      return record("The line", "OPEN", [
        el("p", {
          class: "gf-detail-text",
          text: "The party comes back as it went out. The engagement stands open; return to it when the roster is ready.",
        }),
      ]);
    }
    return fallenPanel(view.fallen);
  }
}

/** The chapter's last page: engagements won, Standing banked, names struck. */
export class ChapterCloseScreen implements Component<ChapterCloseView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly options: RecordScreenOptions;
  private readonly note: HTMLElement;
  private readonly cols: HTMLElement;
  private readonly stamp: HTMLElement;

  constructor(options: RecordScreenOptions = {}) {
    this.options = options;
    this.menus = new MenuStack();
    this.note = el("p", { class: "gf-screen-note" });
    this.stamp = el("span", { class: "gf-record-serial" });
    this.cols = el("div", { class: "gf-screen-cols" });
    this.el = el("section", {
      class: "gf-screen gf-results gf-chapter-close",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [
                el("h1", { class: "gf-screen-title", text: "Chapter Closed" }),
                this.note,
              ],
            }),
          ],
        }),
        this.cols,
        el("footer", { class: "gf-screen-foot", children: [this.menus.el, this.stamp] }),
      ],
    });
    this.menus.push(advanceMenu("Close the record", () => this.options.onAdvance?.()));
  }

  update(view: ChapterCloseView): void {
    this.note.textContent = `${view.chapterName} · ${view.note}`;
    this.stamp.textContent = `FILED · ${view.engagements.length} ENGAGEMENTS`;
    replaceChildren(this.cols, [
      record("The chapter's account", String(view.standingTotal), [
        el("ul", {
          class: "gf-record-list",
          children: view.engagements.map((entry) =>
            el("li", {
              class: "gf-record-row",
              data: { encounter: entry.encounterId },
              children: [el("span", { class: "gf-record-name", text: entry.name })],
            }),
          ),
        }),
        el("p", { class: "gf-panel-subtitle", text: "Still standing" }),
        view.survivors.length === 0
          ? el("p", { class: "gf-empty-note", text: "Nobody came back." })
          : el("ul", {
              class: "gf-record-list",
              children: view.survivors.map((unit) =>
                el("li", {
                  class: "gf-record-row",
                  data: { unit: unit.unitId },
                  children: [
                    el("span", { class: "gf-record-name", text: unit.name }),
                    el("span", {
                      class: "gf-record-note",
                      text: `${unit.jobName} · Level ${unit.level}`,
                    }),
                  ],
                }),
              ),
            }),
      ]),
      fallenPanel(view.fallen),
    ]);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }
}

function advanceMenu(label: string, onSelect: () => void): MenuDef {
  return {
    id: ADVANCE_ID,
    cancellable: false,
    entries: [{ id: "advance", label, note: "Back to the roster" }],
    onSelect,
  };
}
