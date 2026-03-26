import { describe, it, expect } from "vitest";
import {
  detectCycle,
  canAddEdge,
  topologicalSort,
  getTransitiveDependents,
  getDirectDependencies,
  getDirectDependents,
} from "./dag.js";
import type { DagEdge } from "./dag.js";

describe("dag", () => {
  describe("detectCycle", () => {
    it("returns null for an empty graph", () => {
      expect(detectCycle([])).toBeNull();
    });

    it("returns null for a linear chain", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ];
      expect(detectCycle(edges)).toBeNull();
    });

    it("returns null for a diamond DAG", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "A", to: "C" },
        { from: "B", to: "D" },
        { from: "C", to: "D" },
      ];
      expect(detectCycle(edges)).toBeNull();
    });

    it("detects a simple cycle", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "B", to: "A" },
      ];
      const cycle = detectCycle(edges);
      expect(cycle).not.toBeNull();
      expect(cycle!.length).toBeGreaterThanOrEqual(2);
    });

    it("detects a longer cycle", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "C", to: "A" },
      ];
      const cycle = detectCycle(edges);
      expect(cycle).not.toBeNull();
    });

    it("detects a self-loop", () => {
      const edges: DagEdge[] = [{ from: "A", to: "A" }];
      const cycle = detectCycle(edges);
      expect(cycle).not.toBeNull();
    });

    it("ignores acyclic subgraphs when one cycle exists", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" }, // acyclic
        { from: "C", to: "D" },
        { from: "D", to: "C" }, // cycle
      ];
      const cycle = detectCycle(edges);
      expect(cycle).not.toBeNull();
    });
  });

  describe("canAddEdge", () => {
    it("allows adding an edge to an empty graph", () => {
      expect(canAddEdge([], { from: "A", to: "B" })).toBe(true);
    });

    it("rejects a self-loop", () => {
      expect(canAddEdge([], { from: "A", to: "A" })).toBe(false);
    });

    it("rejects an edge that would create a cycle", () => {
      const existing: DagEdge[] = [{ from: "A", to: "B" }];
      expect(canAddEdge(existing, { from: "B", to: "A" })).toBe(false);
    });

    it("allows an edge that does not create a cycle", () => {
      const existing: DagEdge[] = [{ from: "A", to: "B" }];
      expect(canAddEdge(existing, { from: "A", to: "C" })).toBe(true);
    });

    it("rejects a transitive cycle", () => {
      const existing: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ];
      expect(canAddEdge(existing, { from: "C", to: "A" })).toBe(false);
    });
  });

  describe("topologicalSort", () => {
    it("returns an empty array for empty input", () => {
      expect(topologicalSort([])).toEqual([]);
    });

    it("sorts a linear chain", () => {
      const edges: DagEdge[] = [
        { from: "B", to: "A" },
        { from: "C", to: "B" },
      ];
      const sorted = topologicalSort(edges);
      expect(sorted.indexOf("A")).toBeLessThan(sorted.indexOf("B"));
      expect(sorted.indexOf("B")).toBeLessThan(sorted.indexOf("C"));
    });

    it("sorts a diamond DAG", () => {
      const edges: DagEdge[] = [
        { from: "C", to: "A" },
        { from: "C", to: "B" },
        { from: "D", to: "C" },
      ];
      const sorted = topologicalSort(edges);
      expect(sorted.indexOf("A")).toBeLessThan(sorted.indexOf("C"));
      expect(sorted.indexOf("B")).toBeLessThan(sorted.indexOf("C"));
      expect(sorted.indexOf("C")).toBeLessThan(sorted.indexOf("D"));
    });

    it("throws on circular dependency", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "B", to: "A" },
      ];
      expect(() => topologicalSort(edges)).toThrow("Circular dependency");
    });
  });

  describe("getTransitiveDependents", () => {
    it("returns empty for node with no dependents", () => {
      const edges: DagEdge[] = [{ from: "A", to: "B" }];
      expect(getTransitiveDependents("A", edges)).toEqual([]);
    });

    it("returns direct dependents", () => {
      const edges: DagEdge[] = [{ from: "A", to: "B" }];
      const result = getTransitiveDependents("B", edges);
      expect(result).toContain("A");
    });

    it("returns transitive dependents", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ];
      const result = getTransitiveDependents("C", edges);
      expect(result).toContain("B");
      expect(result).toContain("A");
    });

    it("handles diamond dependencies", () => {
      const edges: DagEdge[] = [
        { from: "B", to: "A" },
        { from: "C", to: "A" },
        { from: "D", to: "B" },
        { from: "D", to: "C" },
      ];
      const result = getTransitiveDependents("A", edges);
      expect(result).toContain("B");
      expect(result).toContain("C");
      expect(result).toContain("D");
    });
  });

  describe("getDirectDependencies", () => {
    it("returns direct dependencies", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "B" },
        { from: "A", to: "C" },
        { from: "B", to: "C" },
      ];
      expect(getDirectDependencies("A", edges)).toEqual(["B", "C"]);
    });

    it("returns empty for node with no dependencies", () => {
      const edges: DagEdge[] = [{ from: "A", to: "B" }];
      expect(getDirectDependencies("B", edges)).toEqual([]);
    });
  });

  describe("getDirectDependents", () => {
    it("returns direct dependents", () => {
      const edges: DagEdge[] = [
        { from: "A", to: "C" },
        { from: "B", to: "C" },
      ];
      expect(getDirectDependents("C", edges)).toEqual(["A", "B"]);
    });

    it("returns empty for node with no dependents", () => {
      const edges: DagEdge[] = [{ from: "A", to: "B" }];
      expect(getDirectDependents("A", edges)).toEqual([]);
    });
  });
});
