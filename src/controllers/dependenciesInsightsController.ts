import * as vscode from "vscode";
import { NpmDepsService } from "../services/npmDepsService";
import { UnusedDependencyDetectorService, UnusedDependenciesResult } from "../services/unusedDependencyDetectorService";
import { GraphData } from "../services/npmDependenciesService";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  workspace: string;
}

/**
 * Controller for the Dependencies Insights view
 * Orchestrates data retrieval, caching, and file watching
 */
export class DependenciesInsightsController {
  private graphCache = new Map<string, CacheEntry<GraphData>>();
  private unusedCache = new Map<string, CacheEntry<UnusedDependenciesResult>>();
  private fileWatcher: vscode.FileSystemWatcher | undefined;

  private readonly npmDepsService = new NpmDepsService();
  private readonly unusedService = new UnusedDependencyDetectorService();

  constructor(private context: vscode.ExtensionContext) {
    this.setupFileWatcher();
  }

  /**
   * Get graph data for selected packages in a workspace
   */
  async getGraphData(
    packageNames: string[],
    workspaceFolder?: vscode.WorkspaceFolder,
    maxDepth: number = 2,
    maxNodes: number = 50,
    clearCache: boolean = false,
    token?: vscode.CancellationToken
  ): Promise<GraphData> {
    const wsPath = workspaceFolder?.uri.fsPath || "default";
    const cacheKey = `${wsPath}-${packageNames.join(",")}`;

    if (!clearCache) {
      const cached = this.graphCache.get(cacheKey);
      if (cached) {
        return cached.data;
      }
    }

    const data = await this.npmDepsService.buildGraph(packageNames, maxDepth, maxNodes, token);

    this.graphCache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      workspace: wsPath
    });

    return data;
  }

  /**
   * Get unused dependencies for a workspace
   */
  async getUnusedData(
    workspaceFolder?: vscode.WorkspaceFolder,
    clearCache: boolean = false,
    token?: vscode.CancellationToken
  ): Promise<UnusedDependenciesResult> {
    const folder = workspaceFolder || this.getDefaultWorkspaceFolder();
    
    if (!folder) {
      return {
        unused: [],
        checked: 0,
        workspace: "No workspace",
        timestamp: Date.now()
      };
    }

    const wsPath = folder.uri.fsPath;

    if (!clearCache) {
      const cached = this.unusedCache.get(wsPath);
      if (cached) {
        return cached.data;
      }
    }

    const data = await this.unusedService.detectUnusedDependencies(folder, token);

    this.unusedCache.set(wsPath, {
      data,
      timestamp: Date.now(),
      workspace: wsPath
    });

    return data;
  }

  /**
   * Refresh all cached data
   */
  refreshAll(): void {
    this.graphCache.clear();
    this.unusedCache.clear();
    this.npmDepsService.clearCache();
  }

  /**
   * Set up file watcher for package.json changes
   */
  private setupFileWatcher(): void {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/package.json");

    this.fileWatcher.onDidChange(() => {
      this.refreshAll();
    });

    this.fileWatcher.onDidCreate(() => {
      this.refreshAll();
    });

    this.fileWatcher.onDidDelete(() => {
      this.refreshAll();
    });

    this.context.subscriptions.push(this.fileWatcher);
  }

  /**
   * Get the default workspace folder (first one)
   */
  private getDefaultWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders && folders.length > 0 ? folders[0] : undefined;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
  }
}
