import { describe, it, expect } from "vitest";
import { groupByName } from "./grouping";

const m = (name: string, group: string | null) => ({ name, group });

describe("groupByName", () => {
  it("returns a single null-named group when nothing is grouped", () => {
    const g = groupByName([m("a", null), m("b", null)], (x) => x.group);
    expect(g).toHaveLength(1);
    expect(g[0].name).toBeNull();
    expect(g[0].items.map((i) => i.name)).toEqual(["a", "b"]);
  });

  it("orders named groups alphabetically, ungrouped last", () => {
    const g = groupByName(
      [m("a", "billing"), m("b", null), m("c", "core"), m("d", "billing")],
      (x) => x.group,
    );
    expect(g.map((x) => x.name)).toEqual(["billing", "core", null]);
    expect(g[0].items.map((i) => i.name)).toEqual(["a", "d"]); // order preserved
  });

  it("treats blank/whitespace labels as ungrouped", () => {
    const g = groupByName([m("a", "   "), m("b", "core")], (x) => x.group);
    expect(g.map((x) => x.name)).toEqual(["core", null]);
  });

  it("is case-insensitive for ordering but keeps the original label", () => {
    const g = groupByName([m("a", "Zeta"), m("b", "alpha")], (x) => x.group);
    expect(g.map((x) => x.name)).toEqual(["alpha", "Zeta"]);
  });
});
