/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { recordingIntents } from "../../src/ui/intents.js";
import { mockJobsView } from "../../src/ui/mock.js";
import { JobScreen } from "../../src/ui/screens/jobs.js";

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
}

describe("JobScreen", () => {
  it("names the level as the job's, on a page that also shows the unit's", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView());
    const enforcer = screen.el.querySelector<HTMLElement>('.gf-menu-entry[data-entry="enforcer"]');
    expect(enforcer?.textContent).toContain("Job level 3");
    expect(enforcer?.textContent).toContain("Standing: 320 here");
  });

  it("says what primary and secondary actually are, on the rows", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView());
    expect(
      screen.el.querySelector('.gf-menu-entry[data-entry="enforcer"]')?.textContent,
    ).toContain("stat curve and skillset are the unit's own");
    expect(
      screen.el.querySelector('.gf-menu-entry[data-entry="conduit"]')?.textContent,
    ).toContain("on loan to the Act menu");
  });

  it("says where Standing comes from and what it belongs to", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView());
    const rule = screen.el.querySelector(".gf-standing-rule")?.textContent ?? "";
    expect(rule).toContain("10 for every action");
    expect(rule).toContain("Each job spends only its own");
  });

  it("puts the job level and its banked Standing in the record", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView());
    const detail = screen.el.querySelector(".gf-jobs-detail")?.textContent ?? "";
    expect(detail).toContain("Job level");
    expect(detail).toContain("3 of 8");
    expect(detail).toContain("Standing banked here");
    expect(screen.el.querySelector(".gf-detail-standing")?.textContent).toBe("320");
  });

  it("states the consequence of each choice on the choice itself", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView());
    screen.menus.handleKey(key("Enter"));
    const secondary = screen.el.querySelector<HTMLElement>(
      '.gf-menu-entry[data-entry="secondary"]',
    );
    expect(secondary?.textContent).toContain("join the Act menu");
    expect(
      screen.el.querySelector('.gf-menu-entry[data-entry="primary"]')?.textContent,
    ).toContain("stays with that job");
  });

  it("still commits the pick through the intents, and keeps the context menu", () => {
    const { intents, calls } = recordingIntents();
    const screen = new JobScreen({ intents });
    screen.update(mockJobsView());

    screen.menus.handleKey(key("ArrowDown"));
    screen.menus.handleKey(key("Enter"));
    expect(screen.menus.path).toEqual(["jobs-list", "jobs-actions-conduit"]);
    screen.menus.handleKey(key("Enter"));
    expect(calls.at(-1)).toEqual({ name: "changeJob", args: ["rowen", "conduit"] });
  });

  it("names both tracks in the header rather than one slash-separated pair", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView());
    const head = screen.el.querySelector(".gf-jobs .gf-screen-note")?.textContent ?? "";
    expect(head).toContain("Primary: Enforcer");
    expect(head).toContain("Secondary: Conduit");
  });

  it("says plainly when nothing is borrowed", () => {
    const screen = new JobScreen();
    screen.update(mockJobsView({ secondaryJobName: null }));
    expect(screen.el.querySelector(".gf-jobs .gf-screen-note")?.textContent).toContain(
      "Secondary: none borrowed",
    );
  });
});
