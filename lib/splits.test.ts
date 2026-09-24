import { describe, expect, it } from "vitest";
import { computeSplits, hasNegativeShare, splitsSumMatches } from "./splits";

describe("computeSplits", () => {
  it("divides evenly with no remainder", () => {
    const splits = computeSplits({ method: "equal", amount: 300, participantIds: ["a", "b", "c"] });
    expect(splits).toEqual([
      { userId: "a", amount: 100 },
      { userId: "b", amount: 100 },
      { userId: "c", amount: 100 },
    ]);
  });

  it("hands out the remainder one paisa at a time, sum always exact", () => {
    // 1000 / 3 = 333.33... — the classic case that breaks naive division.
    const splits = computeSplits({ method: "equal", amount: 1000, participantIds: ["a", "b", "c"] });
    const sum = splits.reduce((acc, s) => acc + s.amount, 0);
    expect(Math.round(sum * 100) / 100).toBe(1000);
    // Remainder goes to the last participants first.
    expect(splits).toEqual([
      { userId: "a", amount: 333.33 },
      { userId: "b", amount: 333.33 },
      { userId: "c", amount: 333.34 },
    ]);
  });

  it("stays exact across a wide range of participant counts", () => {
    for (let n = 1; n <= 11; n++) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`);
      const splits = computeSplits({ method: "equal", amount: 1003, participantIds: ids });
      const sum = splits.reduce((acc, s) => acc + s.amount, 0);
      expect(Math.round(sum * 100) / 100).toBe(1003);
    }
  });

  it("returns nothing for an empty participant list", () => {
    expect(computeSplits({ method: "equal", amount: 500, participantIds: [] })).toEqual([]);
  });

  it("uses the custom shares as-is, rounded to paisa", () => {
    const splits = computeSplits({
      method: "custom",
      amount: 500,
      participantIds: ["a", "b"],
      customShares: { a: 199.999, b: 300.001 },
    });
    expect(splits).toEqual([
      { userId: "a", amount: 200 },
      { userId: "b", amount: 300 },
    ]);
  });

  it("select method splits evenly among only the chosen participants", () => {
    // "select" and "equal" go through the same branch in computeSplits —
    // the UI is what restricts which ids are passed in.
    const splits = computeSplits({ method: "select", amount: 200, participantIds: ["a", "b"] });
    expect(splits).toEqual([
      { userId: "a", amount: 100 },
      { userId: "b", amount: 100 },
    ]);
  });
});

describe("splitsSumMatches", () => {
  it("accepts shares that sum exactly to the amount", () => {
    expect(splitsSumMatches({ a: 100, b: 200 }, ["a", "b"], 300)).toBe(true);
  });

  it("tolerates paisa-level floating point dust", () => {
    expect(splitsSumMatches({ a: 0.1, b: 0.2 }, ["a", "b"], 0.3)).toBe(true);
  });

  it("rejects shares that don't add up", () => {
    expect(splitsSumMatches({ a: 100, b: 150 }, ["a", "b"], 300)).toBe(false);
  });

  it("treats a missing share as zero", () => {
    expect(splitsSumMatches({ a: 300 }, ["a", "b"], 300)).toBe(true);
  });
});

describe("hasNegativeShare", () => {
  it("flags any negative share, even if the total still balances", () => {
    // -200 and 700 sum to the right 500 total, but -200 isn't a real split.
    expect(hasNegativeShare({ a: -200, b: 700 }, ["a", "b"])).toBe(true);
  });

  it("passes for all-non-negative shares", () => {
    expect(hasNegativeShare({ a: 0, b: 500 }, ["a", "b"])).toBe(false);
  });
});
