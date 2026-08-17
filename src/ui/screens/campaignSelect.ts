import { Component, el, plate, replaceChildren } from "../dom.js";
import { MenuDef, MenuStack } from "../menu.js";

const CAMPAIGN_MENU_ID = "campaign-select";

/** What is on file for one campaign, if anything is. */
export interface CampaignFileView {
  /** Engagements closed on the save, out of the campaign's own count. */
  engagementsClosed: number;
}

export interface CampaignEntryView {
  campaignId: string;
  name: string;
  description: string;
  encounterCount: number;
  file: CampaignFileView | null;
}

export interface CampaignSelectView {
  campaigns: readonly CampaignEntryView[];
}

export interface CampaignSelectOptions {
  onPick?: (campaignId: string) => void;
}

const engagements = (count: number): string =>
  count === 1 ? "1 engagement" : `${String(count)} engagements`;

/**
 * The register the game opens on: every campaign on file, and which of them
 * already has a record. Picking one is the only way into a campaign, so the
 * page says plainly what each is and how far it got.
 */
export class CampaignSelectScreen implements Component<CampaignSelectView> {
  readonly el: HTMLElement;
  readonly menus: MenuStack;
  private readonly options: CampaignSelectOptions;
  private readonly detail: HTMLElement;
  private view: CampaignSelectView = { campaigns: [] };

  constructor(options: CampaignSelectOptions = {}) {
    this.options = options;
    this.menus = new MenuStack();
    this.detail = el("aside", { class: "gf-panel gf-campaign-detail" });
    this.el = el("section", {
      class: "gf-screen gf-campaign-select",
      children: [
        el("header", {
          class: "gf-screen-head",
          children: [
            el("div", {
              class: "gf-screen-head-text",
              children: [
                el("h1", { class: "gf-screen-title", text: "Campaign Register" }),
                el("p", {
                  class: "gf-screen-note",
                  text: "Every campaign on file. Each keeps its own record.",
                }),
              ],
            }),
          ],
        }),
        el("div", {
          class: "gf-screen-cols",
          children: [el("div", { class: "gf-screen-col", children: [this.menus.el] }), this.detail],
        }),
        el("footer", {
          class: "gf-screen-foot",
          children: [
            el("p", {
              class: "gf-hint",
              text: "Confirm a campaign to open it. A campaign with a record on file resumes where it stopped.",
            }),
          ],
        }),
      ],
    });
  }

  update(view: CampaignSelectView): void {
    this.view = view;
    const menu = this.campaignMenu(view);
    if (this.menus.depth === 0) this.menus.push(menu);
    else this.menus.refresh(menu);
    this.renderDetail(view.campaigns[Math.max(0, this.menus.cursor)] ?? null);
  }

  attach(target: EventTarget = document): void {
    this.menus.attach(target);
  }

  destroy(): void {
    this.menus.destroy();
    this.el.remove();
  }

  private campaignMenu(view: CampaignSelectView): MenuDef {
    return {
      id: CAMPAIGN_MENU_ID,
      title: "Campaigns",
      cancellable: false,
      entries: view.campaigns.map((entry) => ({
        id: entry.campaignId,
        label: entry.name,
        detail: entry.file === null ? "New file" : "Filed",
      })),
      onCursor: (entry) =>
        this.renderDetail(
          this.view.campaigns.find((candidate) => candidate.campaignId === entry.id) ?? null,
        ),
      onSelect: (entry) => this.options.onPick?.(entry.id),
    };
  }

  private renderDetail(entry: CampaignEntryView | null): void {
    if (entry === null) {
      replaceChildren(this.detail, [
        plate("File"),
        el("p", { class: "gf-empty-note", text: "No campaign on file." }),
      ]);
      return;
    }
    const closed = entry.file === null ? 0 : entry.file.engagementsClosed;
    replaceChildren(this.detail, [
      plate("File", entry.file === null ? "NEW" : "FILED"),
      el("div", {
        class: "gf-panel-body",
        children: [
          el("h2", { class: "gf-detail-title", text: entry.name }),
          el("p", { class: "gf-detail-text", text: entry.description }),
          el("dl", {
            class: "gf-ledger",
            children: [
              el("dt", { text: "Engagements" }),
              el("dd", { text: engagements(entry.encounterCount) }),
              el("dt", { text: "Record" }),
              el("dd", {
                text:
                  entry.file === null
                    ? "Nothing on file"
                    : `${String(closed)} of ${String(entry.encounterCount)} closed`,
              }),
            ],
          }),
        ],
      }),
    ]);
  }
}
