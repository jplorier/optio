export interface DagEdge {
  from: string;
  to: string;
}

/**
 * Detect a cycle in a directed graph using DFS.
 * Returns the cycle path (e.g., ["A", "B", "C", "A"]) or null if no cycle exists.
 *
 * Edges represent "from depends on to" (i.e., from → to).
 */
export function detectCycle(edges: DagEdge[]): string[] | null {
  const adjacency = new Map<string, string[]>();
  const nodes = new Set<string>();

  for (const { from, to } of edges) {
    nodes.add(from);
    nodes.add(to);
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push(to);
  }

  const WHITE = 0; // unvisited
  const GRAY = 1; // in current DFS path
  const BLACK = 2; // fully processed

  const color = new Map<string, number>();
  for (const node of nodes) color.set(node, WHITE);

  const parent = new Map<string, string | null>();

  for (const startNode of nodes) {
    if (color.get(startNode) !== WHITE) continue;

    const stack: string[] = [startNode];
    parent.set(startNode, null);

    while (stack.length > 0) {
      const node = stack[stack.length - 1];

      if (color.get(node) === WHITE) {
        color.set(node, GRAY);
        const neighbors = adjacency.get(node) ?? [];
        for (const neighbor of neighbors) {
          if (color.get(neighbor) === GRAY) {
            // Found a cycle — reconstruct the path
            const cycle: string[] = [neighbor];
            let current: string | null | undefined = node;
            while (current && current !== neighbor) {
              cycle.push(current);
              current = parent.get(current);
            }
            cycle.push(neighbor);
            cycle.reverse();
            return cycle;
          }
          if (color.get(neighbor) === WHITE) {
            parent.set(neighbor, node);
            stack.push(neighbor);
          }
        }
      } else {
        stack.pop();
        color.set(node, BLACK);
      }
    }
  }

  return null;
}

/**
 * Check if adding a new edge to an existing graph would create a cycle.
 */
export function canAddEdge(existingEdges: DagEdge[], newEdge: DagEdge): boolean {
  if (newEdge.from === newEdge.to) return false;
  return detectCycle([...existingEdges, newEdge]) === null;
}

/**
 * Topological sort of a DAG. Throws if the graph contains a cycle.
 * Returns nodes in dependency order (dependencies come first).
 */
export function topologicalSort(edges: DagEdge[]): string[] {
  const cycle = detectCycle(edges);
  if (cycle) {
    throw new Error(`Circular dependency: ${cycle.join(" → ")}`);
  }

  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const nodes = new Set<string>();

  for (const { from, to } of edges) {
    nodes.add(from);
    nodes.add(to);
    if (!adjacency.has(to)) adjacency.set(to, []);
    adjacency.get(to)!.push(from);
    inDegree.set(from, (inDegree.get(from) ?? 0) + 1);
    if (!inDegree.has(to)) inDegree.set(to, 0);
  }

  // Nodes with no incoming edges (roots/sources)
  const queue: string[] = [];
  for (const node of nodes) {
    if ((inDegree.get(node) ?? 0) === 0) {
      queue.push(node);
    }
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const dependent of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(dependent) ?? 1) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  return sorted;
}

/**
 * Get all transitive dependents of a node (nodes that depend on it, directly or transitively).
 * "from depends on to" — so dependents of X are all nodes that have X reachable via their "to" chain.
 */
export function getTransitiveDependents(nodeId: string, edges: DagEdge[]): string[] {
  // Build reverse adjacency: for each "to" node, which "from" nodes point to it
  const reverseDeps = new Map<string, string[]>();
  for (const { from, to } of edges) {
    if (!reverseDeps.has(to)) reverseDeps.set(to, []);
    reverseDeps.get(to)!.push(from);
  }

  const visited = new Set<string>();
  const queue = [nodeId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of reverseDeps.get(current) ?? []) {
      if (!visited.has(dependent)) {
        visited.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return Array.from(visited);
}

/**
 * Get direct dependencies of a node (nodes it depends on).
 */
export function getDirectDependencies(nodeId: string, edges: DagEdge[]): string[] {
  return edges.filter((e) => e.from === nodeId).map((e) => e.to);
}

/**
 * Get direct dependents of a node (nodes that depend on it).
 */
export function getDirectDependents(nodeId: string, edges: DagEdge[]): string[] {
  return edges.filter((e) => e.to === nodeId).map((e) => e.from);
}
