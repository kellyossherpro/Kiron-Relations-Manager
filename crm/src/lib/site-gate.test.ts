import { describe, expect, it } from "vitest";
import { gateToken, passwordMatches, safeNext } from "./site-gate";

describe("test-site password gate", () => {
  it("accepts only the right password", () => {
    expect(passwordMatches("open sesame", "open sesame")).toBe(true);
    expect(passwordMatches("open sesame ", "open sesame")).toBe(false);
    expect(passwordMatches("", "open sesame")).toBe(false);
    expect(gateToken("a")).not.toBe(gateToken("b"));
  });

  it("only sends people back to pages on this site", () => {
    expect(safeNext("/deals?who=all")).toBe("/deals?who=all");
    expect(safeNext("https://evil.example.test")).toBe("/");
    expect(safeNext("//evil.example.test")).toBe("/");
    expect(safeNext("/\\evil.example.test")).toBe("/");
    expect(safeNext(null)).toBe("/");
  });
});
