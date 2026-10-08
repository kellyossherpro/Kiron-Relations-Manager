import { describe, expect, it } from "vitest";
import { isShown } from "./conditions";

describe("fields that only apply for some answers", () => {
  const server = { key: "p.server_name", showWhen: { field: "p.dedicated_server", values: ["Yes"] } };
  const ggr = { key: "p.based_on_ggr_ngr", showWhen: { field: "p.fee_rate_type", values: ["Flat Rate", "Variable Rate"] } };

  it("shows them only when the other field has one of the answers", () => {
    expect(isShown(server, {})).toBe(false);
    expect(isShown(server, { "p.dedicated_server": false })).toBe(false);
    expect(isShown(server, { "p.dedicated_server": true })).toBe(true);
    expect(isShown(ggr, { "p.fee_rate_type": "Variable Rate" })).toBe(true);
    expect(isShown(ggr, { "p.fee_rate_type": "Flat Fee" })).toBe(false);
    expect(isShown({ key: "p.anything" }, {})).toBe(true);
  });

  it("never hides something that's already filled in", () => {
    expect(isShown(server, { "p.dedicated_server": false, "p.server_name": "srv-01" })).toBe(true);
  });
});
