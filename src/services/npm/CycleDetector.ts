/**
 * Detects circular dependencies in the dependency graph
 */
export class CycleDetector {
  private visitedNodes: Set<string> = new Set();
  private cycleDetected: Set<string> = new Set();

  /**
   * Mark a node as currently being visited
   * @param nodeId Node identifier
   */
  markVisited(nodeId: string): void {
    this.visitedNodes.add(nodeId);
  }

  /**
   * Check if a node is currently being visited
   * @param nodeId Node identifier
   * @returns true if node is in the current traversal path
   */
  isVisited(nodeId: string): boolean {
    return this.visitedNodes.has(nodeId);
  }

  /**
   * Mark a node as part of a cycle
   * @param nodeId Node identifier
   */
  markCycle(nodeId: string): void {
    this.cycleDetected.add(nodeId);
  }

  /**
   * Check if a node is part of a detected cycle
   * @param nodeId Node identifier
   * @returns true if node is part of a cycle
   */
  isCycle(nodeId: string): boolean {
    return this.cycleDetected.has(nodeId);
  }

  /**
   * Remove a node from the visited set (for backtracking)
   * @param nodeId Node identifier
   */
  removeVisited(nodeId: string): void {
    this.visitedNodes.delete(nodeId);
  }

  /**
   * Reset all tracking state
   */
  reset(): void {
    this.visitedNodes.clear();
    this.cycleDetected.clear();
  }

  /**
   * Get all detected cycles
   */
  getCycles(): string[] {
    return Array.from(this.cycleDetected);
  }

  /**
   * Get count of detected cycles
   */
  getCycleCount(): number {
    return this.cycleDetected.size;
  }
}