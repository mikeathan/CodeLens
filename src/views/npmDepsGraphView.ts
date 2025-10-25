import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { NpmDependenciesService, GraphData } from "../services/npmDependenciesService";

interface PackageInfo {
  name: string;
  version: string;
  type: string;
}

interface WorkspaceSnapshot {
  projectName: string;
  packages: PackageInfo[];
  /** The absolute path to the workspace folder containing the package.json */
  folderPath: string;
}

interface WorkspaceFolderInfo {
  name: string;
  path: string;
}

const MAX_DEPTH = 2;
const MAX_NODES = 50;
const LAST_FOLDER_KEY = "npmDeps:lastFolder";

export class NpmDepsGraphView {
  private panel: vscode.WebviewPanel | undefined;
  private readonly npmService = new NpmDependenciesService();
  private snapshot: WorkspaceSnapshot | undefined;
  private selection: string[] = [];
  private cancellation: vscode.CancellationTokenSource | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private getWorkspaceFoldersWithPackageJson(): WorkspaceFolderInfo[] {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      return [];
    }

    return folders
      .filter(folder => {
        const packageJsonPath = path.join(folder.uri.fsPath, "package.json");
        return fs.existsSync(packageJsonPath);
      })
      .map(folder => ({
        name: folder.name,
        path: folder.uri.fsPath
      }));
  }

  async show(): Promise<void> {
    const foldersWithPackageJson = this.getWorkspaceFoldersWithPackageJson();
    
    if (foldersWithPackageJson.length === 0) {
      vscode.window.showErrorMessage(
        "No package.json found. Please open a Node.js project."
      );
      return;
    }

    // Get the last selected folder from globalState
    const lastSelectedFolder = this.context.globalState.get<string>(LAST_FOLDER_KEY);
    
    // Determine which folder to use
    let selectedFolder = foldersWithPackageJson[0];
    if (lastSelectedFolder) {
      const lastFolder = foldersWithPackageJson.find(f => f.path === lastSelectedFolder);
      if (lastFolder) {
        selectedFolder = lastFolder;
      }
    }

    // Load packages for the selected folder (but don't build graph)
    this.snapshot = await this.loadWorkspacePackages(selectedFolder.path);
    
    if (!this.snapshot || this.snapshot.packages.length === 0) {
      vscode.window.showErrorMessage(
        "No dependencies found in package.json"
      );
      return;
    }

    // Default selection: production dependencies
    this.selection = this.snapshot.packages
      .filter(p => p.type === "dependencies")
      .map(p => p.name);

    if (!this.panel) {
      this.createPanel();
    } else {
      this.panel.reveal(vscode.ViewColumn.One);
    }

    this.sendMessage({
      command: "init",
      projectName: this.snapshot.projectName,
      packages: this.snapshot.packages,
      selection: this.selection,
      folders: foldersWithPackageJson,
      lastSelectedFolder: selectedFolder.path
    });
  }

  dispose(): void {
    this.panel?.dispose();
    this.cancellation?.dispose();
  }

  private createPanel(): void {
    this.panel = vscode.window.createWebviewPanel(
      "npmDepsGraph",
      "NPM Dependency Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this.context.extensionUri]
      }
    );

    this.panel.iconPath = vscode.Uri.file(
      path.join(this.context.extensionPath, "icon.png")
    );

    this.panel.webview.html = this.getWebviewContent();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      undefined,
      this.context.subscriptions
    );
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case "ready":
        // Webview is ready
        break;

      case "folderSelected":
        await this.handleFolderSelected(message.folderPath);
        break;

      case "changeSelection":
        this.selection = message.packageNames || [];
        await this.buildGraph(false);
        break;

      case "refresh":
        this.selection = message.packageNames || [];
        await this.buildGraph(true);
        break;

      case "stop":
        this.cancellation?.cancel();
        break;
    }
  }

  private async handleFolderSelected(folderPath: string): Promise<void> {
    // Persist the selected folder
    await this.context.globalState.update(LAST_FOLDER_KEY, folderPath);

    // Load packages for the selected folder
    this.snapshot = await this.loadWorkspacePackages(folderPath);
    
    if (!this.snapshot || this.snapshot.packages.length === 0) {
      vscode.window.showErrorMessage(
        "No dependencies found in package.json"
      );
      return;
    }

    // Update selection: default to production dependencies
    this.selection = this.snapshot.packages
      .filter(p => p.type === "dependencies")
      .map(p => p.name);

    // Send updated packages to webview (but don't build graph)
    this.sendMessage({
      command: "packagesUpdated",
      projectName: this.snapshot.projectName,
      packages: this.snapshot.packages,
      selection: this.selection
    });
  }

  private async buildGraph(clearCache: boolean): Promise<void> {
    if (this.selection.length === 0) {
      this.sendMessage({
        command: "updateGraph",
        graphData: { nodes: [], edges: [] },
        selection: this.selection
      });
      return;
    }

    // Cancel any ongoing operation
    this.cancellation?.cancel();
    this.cancellation?.dispose();
    
    if (clearCache) {
      this.npmService.clearCache();
    }

    this.cancellation = new vscode.CancellationTokenSource();
    const token = this.cancellation.token;

    this.sendMessage({ command: "operationStarted" });

    try {
      const timeoutPromise = new Promise<GraphData>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout after 30 seconds")), 30000);
      });

      const graphPromise = vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Building dependency graph...",
          cancellable: true
        },
        async (_, progressToken) => {
          progressToken.onCancellationRequested(() => {
            this.cancellation?.cancel();
          });

          return await this.npmService.buildGraph(
            this.selection,
            MAX_DEPTH,
            MAX_NODES,
            token
          );
        }
      );

      const graphData = await Promise.race([graphPromise, timeoutPromise]);

      if (!token.isCancellationRequested) {
        this.sendMessage({
          command: "updateGraph",
          graphData,
          selection: this.selection
        });
      } else {
        this.sendMessage({
          command: "operationStopped",
          message: "Operation cancelled"
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to build graph: ${message}`);
      this.sendMessage({
        command: "showError",
        message
      });
    } finally {
      this.sendMessage({ command: "operationComplete" });
      this.cancellation?.dispose();
      this.cancellation = undefined;
    }
  }

  private async loadWorkspacePackages(folderPath: string): Promise<WorkspaceSnapshot | undefined> {
    const packageJsonPath = path.join(folderPath, "package.json");
    
    if (!fs.existsSync(packageJsonPath)) {
      return undefined;
    }

    try {
      const content = await fs.promises.readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(content);

      const packages: PackageInfo[] = [];
      const sections = {
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies,
        peerDependencies: packageJson.peerDependencies,
        optionalDependencies: packageJson.optionalDependencies
      };

      for (const [type, deps] of Object.entries(sections)) {
        if (deps && typeof deps === "object") {
          for (const [name, version] of Object.entries(deps)) {
            packages.push({
              name,
              version: typeof version === "string" ? version : "unknown",
              type
            });
          }
        }
      }

      packages.sort((a, b) => a.name.localeCompare(b.name));

      return {
        projectName: packageJson.name || path.basename(folderPath),
        packages,
        folderPath
      };
    } catch (error) {
      console.error("Error reading package.json:", error);
      return undefined;
    }
  }

  private getWebviewContent(): string {
    const htmlPath = path.join(this.context.extensionPath, "src", "views", "webview.html");
    let html = fs.readFileSync(htmlPath, "utf8");

    const nonce = this.getNonce();
    const cspSource = this.panel!.webview.cspSource;

    html = html.replace(/{{nonce}}/g, nonce);
    html = html.replace(/{{cspSource}}/g, cspSource);

    return html;
  }

  private sendMessage(message: any): void {
    this.panel?.webview.postMessage(message);
  }

  private getNonce(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length))
    ).join("");
  }
}
