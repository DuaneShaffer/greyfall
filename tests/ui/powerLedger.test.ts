/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { PowerLedger } from "../../src/ui/battle/powerLedger.js";

const entries = [
  { objectId: "floor-nine-mains", name: "Floor Nine Mains", powered: true },
  { objectId: "press-line-north", name: "Blanking Press, Number One", powered: false },
  { objectId: "press-line-mid", name: "Blanking Press, Number Two", powered: false },
];

describe("PowerLedger", () => {
  it("names each machine and whether it is live", () => {
    const ledger = new PowerLedger();
    ledger.update({ entries });

    const rows = [...ledger.el.querySelectorAll(".gf-power-entry")];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.querySelector(".gf-power-name")?.textContent).toBe("Floor Nine Mains");
    expect(rows[0]?.querySelector(".gf-power-state")?.textContent).toBe("Live");
    expect(rows[0]?.classList.contains("is-live")).toBe(true);
    expect(rows[1]?.querySelector(".gf-power-state")?.textContent).toBe("Dead");
    expect(rows[1]?.classList.contains("is-dead")).toBe(true);
  });

  it("stamps the count of live machines on the plate", () => {
    const ledger = new PowerLedger();
    ledger.update({ entries });
    expect(ledger.el.querySelector(".gf-plate-stamp")?.textContent).toBe("1/3");
  });

  it("hides itself on a map that switches nothing", () => {
    const ledger = new PowerLedger();
    ledger.update(undefined);
    expect(ledger.el.classList.contains("is-empty")).toBe(true);
    expect(ledger.el.querySelectorAll(".gf-power-entry")).toHaveLength(0);

    ledger.update({ entries });
    expect(ledger.el.classList.contains("is-empty")).toBe(false);
  });
});
