import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { DependenciesInsightsController } from "../controllers/dependenciesInsightsController";

interface PackageInfo {
  name: string;
  version: string;
  type: string;
  selected?: boolean;
}

/**
 * WebviewView provider for the unified Dependencies Insights view
 * Displays Graph and Unused tabs in a sidebar webview
 */
export class DependenciesInsightsView implements vscode.WebviewViewProvider {
  public static readonly viewType = "codelens.dependenciesInsights";

  private view?: vscode.WebviewView;
  private currentTab: "graph" | "unused" = "graph";

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly controller: DependenciesInsightsController
  ) {}

  /**
   * Resolve the webview view
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void | Thenable<void> {
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getWebviewContent(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleMessage(message);
      },
      undefined,
      this.context.subscriptions
    );
  }

  /**
   * Open the view with a specific tab
   */
  public async openTab(tab: "graph" | "unused"): Promise<void> {
    this.currentTab = tab;

    // Show the view
    await vscode.commands.executeCommand(`${DependenciesInsightsView.viewType}.focus`);

    // If view is already resolved, switch to the tab
    if (this.view) {
      this.view.webview.postMessage({
        type: "init",
        tab: tab,
        workspaces: await this.getWorkspaces(),
        packages: await this.getPackages()
      });
    }
  }

  /**
   * Handle messages from webview
   */
  private async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case "ready":
        await this.initialize();
        break;

      case "tabChanged":
        this.currentTab = message.tab;
        break;

      case "refresh":
        await this.handleRefresh(message.tab);
        break;

      case "buildGraph":
        await this.handleBuildGraph(message.packages, message.workspace);
        break;

      case "scanUnused":
        await this.handleScanUnused(message.workspace);
        break;

      case "workspaceChanged":
        await this.handleWorkspaceChanged(message.workspace);
        break;

      case "export":
        await this.handleExport(message.tab);
        break;
    }
  }

  /**
   * Initialize the view with data
   */
  private async initialize(): Promise<void> {
    const workspaces = await this.getWorkspaces();
    const packages = await this.getPackages();

    this.view?.webview.postMessage({
      type: "init",
      tab: this.currentTab,
      workspaces,
      packages
    });
  }

  /**
   * Handle refresh request
   */
  private async handleRefresh(tab: string): Promise<void> {
    this.controller.refreshAll();
    
    if (tab === "graph") {
      const packages = await this.getPackages();
      this.view?.webview.postMessage({
        type: "setPackages",
        packages
      });
      this.view?.webview.postMessage({
        type: "setStatus",
        text: "Refreshed - ready to build graph"
      });
    } else {
      this.view?.webview.postMessage({
        type: "setStatus",
        text: "Refreshed - ready to scan"
      });
    }

    this.view?.webview.postMessage({ type: "hideLoading" });
  }

  /**
   * Handle build graph request
   */
  private async handleBuildGraph(packageNames: string[], workspacePath?: string): Promise<void> {
    try {
      const workspace = this.getWorkspaceByPath(workspacePath);
      
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Building dependency graph...",
          cancellable: true
        },
        async (progress, token) => {
          const graphData = await this.controller.getGraphData(
            packageNames,
            workspace,
            2,
            50,
            false,
            token
          );

          if (!token.isCancellationRequested) {
            this.view?.webview.postMessage({
              type: "setGraphData",
              data: graphData
            });
          }
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to build graph: ${message}`);
      this.view?.webview.postMessage({
        type: "error",
        message
      });
    }
  }

  /**
   * Handle scan unused request
   */
  private async handleScanUnused(workspacePath?: string): Promise<void> {
    try {
      const workspace = this.getWorkspaceByPath(workspacePath);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Scanning for unused dependencies...",
          cancellable: true
        },
        async (progress, token) => {
          const result = await this.controller.getUnusedData(workspace, false, token);

          if (!token.isCancellationRequested) {
            this.view?.webview.postMessage({
              type: "setUnusedData",
              data: result
            });
          }
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to scan for unused dependencies: ${message}`);
      this.view?.webview.postMessage({
        type: "error",
        message
      });
    }
  }

  /**
   * Handle workspace change
   */
  private async handleWorkspaceChanged(workspacePath: string): Promise<void> {
    const packages = await this.getPackages(workspacePath);
    this.view?.webview.postMessage({
      type: "setPackages",
      packages
    });
  }

  /**
   * Handle export request
   */
  private async handleExport(tab: string): Promise<void> {
    vscode.window.showInformationMessage("Export functionality coming soon!");
  }

  /**
   * Get available workspaces
   */
  private async getWorkspaces(): Promise<Array<{ name: string; path: string }>> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return [];
    }

    const workspaces: Array<{ name: string; path: string }> = [];
    for (const folder of folders) {
      const packageJsonPath = path.join(folder.uri.fsPath, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        workspaces.push({
          name: folder.name,
          path: folder.uri.fsPath
        });
      }
    }

    return workspaces;
  }

  /**
   * Get packages from workspace
   */
  private async getPackages(workspacePath?: string): Promise<PackageInfo[]> {
    let targetPath = workspacePath;
    
    if (!targetPath) {
      const folders = vscode.workspace.workspaceFolders;
      if (!folders || folders.length === 0) {
        return [];
      }
      targetPath = folders[0].uri.fsPath;
    }

    const packageJsonPath = path.join(targetPath, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      return [];
    }

    try {
      const content = await fs.promises.readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(content);

      const packages: PackageInfo[] = [];
      const sections = {
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies
      };

      for (const [type, deps] of Object.entries(sections)) {
        if (deps && typeof deps === "object") {
          for (const [name, version] of Object.entries(deps)) {
            packages.push({
              name,
              version: typeof version === "string" ? version : "unknown",
              type,
              selected: type === "dependencies" // Auto-select production deps
            });
          }
        }
      }

      packages.sort((a, b) => a.name.localeCompare(b.name));
      return packages;
    } catch (error) {
      console.error("Error reading package.json:", error);
      return [];
    }
  }

  /**
   * Get workspace folder by path
   */
  private getWorkspaceByPath(workspacePath?: string): vscode.WorkspaceFolder | undefined {
    if (!workspacePath) {
      const folders = vscode.workspace.workspaceFolders;
      return folders && folders.length > 0 ? folders[0] : undefined;
    }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return undefined;
    }

    return folders.find(f => f.uri.fsPath === workspacePath);
  }

  /**
   * Get webview HTML content
   */
  private getWebviewContent(webview: vscode.Webview): string {
    const htmlPath = path.join(
      this.context.extensionPath,
      "src",
      "views",
      "dependenciesInsights.html"
    );
    const cssPath = path.join(
      this.context.extensionPath,
      "src",
      "views",
      "styles",
      "dependenciesInsights.css"
    );
    const jsPath = path.join(
      this.context.extensionPath,
      "src",
      "views",
      "scripts",
      "dependenciesInsightsWebview.js"
    );

    let html = fs.readFileSync(htmlPath, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    const js = fs.readFileSync(jsPath, "utf8");

    const nonce = this.getNonce();
    const cspSource = webview.cspSource;

    html = html.replace(/{{nonce}}/g, nonce);
    html = html.replace(/{{cspSource}}/g, cspSource);
    html = html.replace(/{{styles}}/g, css);
    html = html.replace(/{{script}}/g, js);

    return html;
  }

  /**
   * Generate a nonce for CSP
   */
  private getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  }

  /**
   * Dispose of the view
   */
  public dispose(): void {
    // Cleanup if needed
  }
}
