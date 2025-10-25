import * as vscode from "vscode";
import { NpmDependenciesService, GraphData } from "./npmDependenciesService";

/**
 * Service for building NPM dependency graphs
 * Extracted from NpmDepsGraphView for reusability
 */
export class NpmDepsService {
  private readonly npmService = new NpmDependenciesService();

  /**
   * Build a dependency graph for selected packages
   * @param packageNames Array of package names to analyze
   * @param maxDepth Maximum depth to traverse
   * @param maxNodes Maximum number of nodes
   * @param token Optional cancellation token
   * @returns GraphData containing nodes and edges
   */
  async buildGraph(
    packageNames: string[],
    maxDepth: number,
    maxNodes: number,
    token?: vscode.CancellationToken
  ): Promise<GraphData> {
    return await this.npmService.buildGraph(packageNames, maxDepth, maxNodes, token);
  }

  /**
   * Clear the npm registry cache
   */
  clearCache(): void {
    this.npmService.clearCache();
  }
}
