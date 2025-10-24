import * as https from "https";
import * as vscode from "vscode";

export interface GraphNode {
  id: string;
  label: string;
  version: string;
  level: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface CacheEntry {
  data: any;
  timestamp: number;
}

export class NpmDependenciesService {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL = 1000 * 60 * 10; // 10 minutes
  private visitedNodes: Set<string> = new Set();
  private cycleDetected: Set<string> = new Set();

  /**
   * Build a dependency graph for the given packages
   * @param packageNames Array of package names to analyze
   * @param maxDepth Maximum depth to traverse (default: 3)
   * @param maxNodes Maximum number of nodes to include (default: 100)
   * @param cancellationToken Optional cancellation token
   * @returns GraphData object containing nodes and edges
   */
  async buildGraph(
    packageNames: string[],
    maxDepth: number = 3,
    maxNodes: number = 100,
    cancellationToken?: vscode.CancellationToken
  ): Promise<GraphData> {
    console.log(`Building graph for packages: ${packageNames.join(", ")}`);
    console.log(`Max depth: ${maxDepth}, Max nodes: ${maxNodes}`);
    
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    this.visitedNodes = new Set();
    this.cycleDetected = new Set();

    for (const packageName of packageNames) {
      if (cancellationToken?.isCancellationRequested) {
        console.log("Cancellation requested, stopping graph build");
        break;
      }

      console.log(`Processing package: ${packageName}`);
      
      await this.traverseDependencies(
        packageName.trim(),
        0,
        maxDepth,
        maxNodes,
        nodes,
        edges,
        cancellationToken
      );
      
      if (nodes.length >= maxNodes) {
        console.log(`Reached max nodes limit: ${maxNodes}`);
        break;
      }
    }

    console.log(`Graph built: ${nodes.length} nodes, ${edges.length} edges`);
    return { nodes, edges };
  }

  /**
   * Recursively traverse dependencies
   */
  private async traverseDependencies(
    packageName: string,
    currentDepth: number,
    maxDepth: number,
    maxNodes: number,
    nodes: GraphNode[],
    edges: GraphEdge[],
    cancellationToken?: vscode.CancellationToken
  ): Promise<void> {
    if (currentDepth > maxDepth || nodes.length >= maxNodes) {
      return;
    }

    if (cancellationToken?.isCancellationRequested) {
      return;
    }

    // Check for cycles using a Set of nodeIds to handle different versions
    const nodeId = `${packageName}`;
    if (this.visitedNodes.has(nodeId)) {
      this.cycleDetected.add(nodeId);
      return;
    }

    this.visitedNodes.add(nodeId);

    try {
      const packageInfo = await this.fetchPackageInfo(packageName);
      
      if (!packageInfo) {
        this.visitedNodes.delete(nodeId);
        return;
      }

      const version = packageInfo["dist-tags"]?.latest || "unknown";
      const fullNodeId = `${packageName}@${version}`;

      // Add node if not already present
      if (!nodes.find(n => n.id === fullNodeId)) {
        nodes.push({
          id: fullNodeId,
          label: packageName,
          version: version,
          level: currentDepth
        });
      }

      // Get dependencies from the latest version
      const versionData = packageInfo.versions?.[version];
      const dependencies = versionData?.dependencies || {};

      // Limit number of dependencies processed at each level to prevent explosion
      const depEntries = Object.entries(dependencies).slice(0, 10);

      // Process dependencies
      for (const [depName] of depEntries) {
        if (nodes.length >= maxNodes || cancellationToken?.isCancellationRequested) {
          break;
        }

        const depInfo = await this.fetchPackageInfo(depName);
        if (depInfo) {
          const depLatestVersion = depInfo["dist-tags"]?.latest || "unknown";
          const depFullNodeId = `${depName}@${depLatestVersion}`;

          // Add dependency node if not present
          if (!nodes.find(n => n.id === depFullNodeId)) {
            nodes.push({
              id: depFullNodeId,
              label: depName,
              version: depLatestVersion,
              level: currentDepth + 1
            });
          }

          // Add edge
          if (!edges.find(e => e.from === fullNodeId && e.to === depFullNodeId)) {
            edges.push({
              from: fullNodeId,
              to: depFullNodeId
            });
          }

          // Recursively traverse only if not too deep
          if (currentDepth < maxDepth - 1) {
            await this.traverseDependencies(
              depName,
              currentDepth + 1,
              maxDepth,
              maxNodes,
              nodes,
              edges,
              cancellationToken
            );
          }
        }
      }
    } catch (error) {
      console.error(`Error traversing ${packageName}:`, error);
    }

    this.visitedNodes.delete(nodeId);
  }

  /**
   * Fetch package information from npm registry
   */
  private async fetchPackageInfo(packageName: string): Promise<any> {
    // Check cache first
    const cached = this.cache.get(packageName);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    return new Promise((resolve, reject) => {
      const options = {
        hostname: "registry.npmjs.org",
        path: `/${encodeURIComponent(packageName)}`,
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": "VSCode-CodeLens-Extension"
        }
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              // Cache the result
              this.cache.set(packageName, {
                data: parsed,
                timestamp: Date.now()
              });
              resolve(parsed);
            } catch (error) {
              console.error(`Error parsing response for ${packageName}:`, error);
              resolve(null);
            }
          } else {
            console.error(`Failed to fetch ${packageName}: ${res.statusCode}`);
            resolve(null);
          }
        });
      });

      req.on("error", (error) => {
        console.error(`Request error for ${packageName}:`, error);
        resolve(null);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        console.error(`Request timeout for ${packageName}`);
        resolve(null);
      });

      req.end();
    });
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
