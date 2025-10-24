import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  NpmDependenciesService,
  GraphData,
} from "../services/npmDependenciesService";

type DependencyType =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies"
  | "optionalDependencies"
  | "bundledDependencies"
  | "custom";

interface WorkspacePackage {
  name: string;
  version: string;
  type: DependencyType;
}

interface WorkspacePackageSnapshot {
  projectName: string;
  packages: WorkspacePackage[];
}

const DEFAULT_MAX_DEPTH = 2;
const DEFAULT_MAX_NODES = 50;

export class NpmDepsGraphView {
  private panel: vscode.WebviewPanel | undefined;
  private readonly npmService = new NpmDependenciesService();
  private packageSnapshot: WorkspacePackageSnapshot | undefined;
  private currentSelection: string[] = [];
  private lastGraphData: GraphData = { nodes: [], edges: [] };
  private webviewReady = false;
  private currentCancellation: vscode.CancellationTokenSource | undefined;

  constructor(private readonly context: vscode.ExtensionContext) {}

  /**
   * Show the npm dependency graph view with filtering controls
   */
  async show(): Promise<void> {
    try {
      const snapshot = await this.getWorkspacePackageSnapshot();

      if (!snapshot || snapshot.packages.length === 0) {
        vscode.window.showErrorMessage(
          "No package.json found in workspace. Please open a folder containing a Node.js project with a package.json file."
        );
        return;
      } else {
        this.packageSnapshot = snapshot;
      }

      this.ensureSelectionDefaults();

      if (!this.panel) {
        this.createPanel();
      } else {
        this.panel.reveal(vscode.ViewColumn.One);
      }

      // Don't auto-generate graph on open - let user select packages and click "Update Graph"
      await this.sendInitMessage();
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(
        `Failed to show npm dependency graph: ${details}`
      );
    }
  }

  /**
   * Dispose the view
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }

  /**
   * Ensure we have a valid selection (defaulting to dependencies)
   */
  private ensureSelectionDefaults(): void {
    if (!this.packageSnapshot) {
      this.currentSelection = [];
      return;
    }

    const availableNames = new Set(
      this.packageSnapshot.packages.map((pkg) => pkg.name)
    );

    // Remove packages that are no longer available
    this.currentSelection = this.currentSelection.filter((name) =>
      availableNames.has(name)
    );

    if (this.currentSelection.length === 0) {
      const defaultTypes: DependencyType[] = ["dependencies"];

      this.currentSelection = this.packageSnapshot.packages
        .filter((pkg) => defaultTypes.includes(pkg.type))
        .map((pkg) => pkg.name);

      if (this.currentSelection.length === 0) {
        this.currentSelection = Array.from(availableNames);
      }
    }
  }

  /**
   * Create the webview panel
   */
  private createPanel(): void {
    const iconPath = vscode.Uri.file(
      path.join(this.context.extensionPath, "icon.png")
    );

    this.panel = vscode.window.createWebviewPanel(
      "npmDepsGraph",
      "NPM Dependency Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    // Set the icon for the panel
    this.panel.iconPath = iconPath;

    this.webviewReady = false;

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      this.webviewReady = false;
    });

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "webviewReady":
            this.webviewReady = true;
            await this.sendInitMessage();
            break;
          case "changeSelection":
            await this.handleSelectionChange(message.packageNames ?? []);
            break;
          case "refresh":
            await this.handleRefreshRequest(message.packageNames ?? []);
            break;
          case "stop":
            this.handleStopRequest();
            break;
          case "openPackage":
            await this.openPackageInBrowser(message.packageName);
            break;
        }
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.webview.html = this.getWebviewContent();
  }

  /**
   * Handle selection changes from the webview
   */
  private async handleSelectionChange(packageNames: unknown): Promise<void> {
    const names = this.normalizePackageNames(packageNames);
    await this.updateGraphForSelection(names, {
      title: "Updating npm dependency graph...",
    });
  }

  /**
   * Handle refresh request
   */
  private async handleRefreshRequest(packageNames: unknown): Promise<void> {
    const names = this.normalizePackageNames(packageNames);
    await this.updateGraphForSelection(names, {
      title: "Refreshing npm dependency graph...",
      clearCache: true,
    });
  }

  /**
   * Handle stop request
   */
  private handleStopRequest(): void {
    if (this.currentCancellation) {
      this.currentCancellation.cancel();
      this.currentCancellation.dispose();
      this.currentCancellation = undefined;

      this.postMessageIfReady({
        command: "operationStopped",
        message: "Graph generation stopped by user.",
      });
    }
  }

  /**
   * Normalize package name list
   */
  private normalizePackageNames(names: unknown): string[] {
    if (!Array.isArray(names)) {
      return [];
    }

    return Array.from(
      new Set(
        names
          .map((name) => (typeof name === "string" ? name.trim() : ""))
          .filter((name) => name.length > 0)
      )
    );
  }

  /**
   * Update the graph for the provided selection
   */
  private async updateGraphForSelection(
    packageNames: string[],
    options: { title: string; clearCache?: boolean }
  ): Promise<void> {
    if (!this.panel) {
      return;
    }

    this.currentSelection = packageNames;

    // Cancel any ongoing operation
    if (this.currentCancellation) {
      this.currentCancellation.cancel();
      this.currentCancellation.dispose();
    }

    if (options.clearCache) {
      this.npmService.clearCache();
    }

    if (this.currentSelection.length === 0) {
      this.lastGraphData = { nodes: [], edges: [] };
      await this.postMessageIfReady({
        command: "updateGraph",
        graphData: this.lastGraphData,
        selection: this.currentSelection,
      });
      await this.postMessageIfReady({
        command: "operationComplete",
      });
      return;
    }

    try {
      // Create new cancellation token
      this.currentCancellation = new vscode.CancellationTokenSource();
      const token = this.currentCancellation.token;

      // Notify UI that operation started
      await this.postMessageIfReady({
        command: "operationStarted",
      });

      // Add timeout to prevent infinite hang
      const timeoutPromise = new Promise<GraphData>((_, reject) => {
        setTimeout(() => reject(new Error("Graph generation timed out after 30 seconds")), 30000);
      });

      const graphPromise = vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: options.title,
          cancellable: true,
        },
        async (progress, cancellationToken) => {
          // Link VS Code's cancellation token to our internal one
          cancellationToken.onCancellationRequested(() => {
            if (this.currentCancellation) {
              this.currentCancellation.cancel();
            }
          });

          progress.report({ message: "Fetching package information..." });

          return await this.npmService.buildGraph(
            this.currentSelection,
            DEFAULT_MAX_DEPTH,
            DEFAULT_MAX_NODES,
            token
          );
        }
      );

      const graphData = await Promise.race([graphPromise, timeoutPromise]);

      // Check if cancelled before updating
      if (token.isCancellationRequested) {
        await this.postMessageIfReady({
          command: "operationStopped",
          message: "Graph generation was cancelled.",
        });
        await this.postMessageIfReady({
          command: "operationComplete",
        });
        return;
      }

      this.lastGraphData = graphData;

      await this.postMessageIfReady({
        command: "updateGraph",
        graphData: this.lastGraphData,
        selection: this.currentSelection,
      });

      await this.postMessageIfReady({
        command: "operationComplete",
      });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      console.error("Graph generation error:", error);
      vscode.window.showErrorMessage(
        `Failed to update npm dependency graph: ${details}`
      );
      await this.postMessageIfReady({
        command: "showError",
        message: details,
      });
      await this.postMessageIfReady({
        command: "operationComplete",
      });
    } finally {
      if (this.currentCancellation) {
        this.currentCancellation.dispose();
        this.currentCancellation = undefined;
      }
    }
  }

  /**
   * Send initialization payload to the webview
   */
  private async sendInitMessage(): Promise<void> {
    if (
      !this.panel ||
      !this.packageSnapshot ||
      !this.webviewReady ||
      !this.panel.webview
    ) {
      return;
    }

    await this.panel.webview.postMessage({
      command: "init",
      projectName: this.packageSnapshot.projectName,
      packages: this.packageSnapshot.packages,
      selection: this.currentSelection,
      graphData: this.lastGraphData,
    });
  }

  /**
   * Post message only when webview is ready
   */
  private async postMessageIfReady(message: Record<string, unknown>) {
    if (!this.panel || !this.webviewReady) {
      return;
    }
    await this.panel.webview.postMessage(message);
  }

  /**
   * Prompt the user for package names (fallback when package.json is unavailable)
   */
  private async promptForPackageNames(): Promise<string[] | undefined> {
    const input = await vscode.window.showInputBox({
      prompt:
        "Enter comma-separated package names to visualize (e.g., express, lodash, react)",
      placeHolder: "express, lodash, react",
    });

    if (input === undefined) {
      return undefined;
    }

    return input
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }

  /**
   * Read package.json from the workspace and build a snapshot of packages
   */
  private async getWorkspacePackageSnapshot(): Promise<
    WorkspacePackageSnapshot | undefined
  > {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      console.log("No workspace folder found");
      vscode.window.showErrorMessage("No workspace folder is open. Please open a folder first.");
      return undefined;
    }

    const packageJsonPath = path.join(
      workspaceFolder.uri.fsPath,
      "package.json"
    );

    console.log("Looking for package.json at:", packageJsonPath);

    if (!fs.existsSync(packageJsonPath)) {
      console.log("package.json does not exist at path:", packageJsonPath);
      return undefined;
    }

    try {
      const raw = await fs.promises.readFile(packageJsonPath, "utf8");
      const packageJson = JSON.parse(raw);

      const sectionMap: Record<string, unknown> = {
        dependencies: packageJson.dependencies,
        devDependencies: packageJson.devDependencies,
        peerDependencies: packageJson.peerDependencies,
        optionalDependencies: packageJson.optionalDependencies,
        bundledDependencies:
          packageJson.bundledDependencies ?? packageJson.bundleDependencies,
      };

      const packages: WorkspacePackage[] = [];

      for (const [type, section] of Object.entries(sectionMap)) {
        if (!section) {
          continue;
        }

        if (Array.isArray(section)) {
          for (const name of section) {
            if (typeof name === "string" && name.trim().length > 0) {
              packages.push({
                name,
                version: "(bundled)",
                type: type as DependencyType,
              });
            }
          }
          continue;
        }

        if (typeof section === "object") {
          for (const [name, version] of Object.entries(
            section as Record<string, string>
          )) {
            if (!name || !name.trim()) {
              continue;
            }

            packages.push({
              name,
              version:
                typeof version === "string" && version.trim().length > 0
                  ? version
                  : "(unknown)",
              type: type as DependencyType,
            });
          }
        } else if (
          type === "bundledDependencies" &&
          typeof section === "boolean" &&
          section
        ) {
          packages.push({
            name: "(all dependencies)",
            version: "(bundled)",
            type: type as DependencyType,
          });
        }
      }

      packages.sort((a, b) => a.name.localeCompare(b.name));

      const projectName =
        typeof packageJson.name === "string" && packageJson.name.trim()
          ? packageJson.name.trim()
          : path.basename(workspaceFolder.uri.fsPath);

      return {
        projectName,
        packages,
      };
    } catch (error) {
      console.error("Error reading package.json:", error);
      vscode.window.showWarningMessage(
        "Unable to parse package.json. Falling back to manual package entry."
      );
      return undefined;
    }
  }

  /**
   * Open package page on npmjs.com
   */
  private async openPackageInBrowser(packageName: string): Promise<void> {
    if (!packageName) {
      return;
    }

    const url = `https://www.npmjs.com/package/${encodeURIComponent(
      packageName
    )}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  /**
   * Produce the base webview HTML
   */
  private getWebviewContent(): string {
    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src https: data:; script-src 'nonce-${nonce}' https://unpkg.com; style-src 'unsafe-inline'; font-src https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NPM Dependency Graph</title>
  <script nonce="${nonce}" type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    header {
      padding: 12px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-sideBar-background);
    }
    header h1 {
      font-size: 18px;
      margin: 0 0 4px 0;
    }
    header p {
      margin: 0;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    #layout {
      display: grid;
      grid-template-columns: minmax(260px, 320px) 1fr;
      height: calc(100vh - 64px);
    }
    #sidebar {
      border-right: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-sideBar-background);
      display: flex;
      flex-direction: column;
    }
    #sidebar section {
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    #sidebar h2 {
      font-size: 14px;
      margin: 0 0 8px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--vscode-descriptionForeground);
    }
    #searchInput {
      width: 100%;
      padding: 8px 10px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    #typeFilters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }
    .type-filter {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid var(--vscode-input-border);
      background-color: var(--vscode-input-background);
      font-size: 12px;
    }
    #selectionActions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }
    button {
      padding: 6px 12px;
      border-radius: 4px;
      border: none;
      cursor: pointer;
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      font-size: 12px;
    }
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    #packageList {
      flex: 1;
      overflow-y: auto;
      padding: 0 20px 16px 20px;
    }
    .package-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid var(--vscode-panel-border);
      gap: 8px;
      font-size: 13px;
    }
    .package-item:last-child {
      border-bottom: none;
    }
    .package-details {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .package-name {
      font-weight: 600;
    }
    .package-meta {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
    }
    #selectionSummary {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-top: 8px;
    }
    #graphContainer {
      position: relative;
      height: 100%;
    }
    #graphControls {
      display: flex;
      gap: 8px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background-color: var(--vscode-editor-background);
    }
    #statusMessage {
      padding: 0 20px 8px 20px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      min-height: 18px;
    }
    #graphInfo {
      padding: 0 20px 12px 20px;
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
    }
    #network {
      width: 100%;
      height: calc(100% - 84px);
    }
    .empty-state {
      font-size: 13px;
      color: var(--vscode-descriptionForeground);
      padding: 24px 0;
    }
    @media (max-width: 980px) {
      #layout {
        grid-template-columns: 1fr;
        height: auto;
      }
      #sidebar {
        max-height: 40vh;
      }
      #network {
        height: 60vh;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1 id="projectTitle">NPM Dependency Graph</h1>
    <p>Select dependencies to explore package relationships.</p>
  </header>
  <div id="layout">
    <aside id="sidebar">
      <section>
        <h2>Filter Packages</h2>
        <input id="searchInput" type="search" placeholder="Search packages" />
        <div id="typeFilters"></div>
        <div id="selectionSummary"></div>
        <div id="selectionActions">
          <button id="selectAllBtn" type="button">Select All</button>
          <button id="clearSelectionBtn" type="button" class="secondary">Clear</button>
        </div>
      </section>
      <section>
        <h2>Packages</h2>
        <div id="packageList"></div>
      </section>
    </aside>
    <main id="graphContainer">
      <div id="graphControls">
        <button id="updateGraphBtn" type="button">Update Graph</button>
        <button id="stopGraphBtn" type="button" class="secondary" style="display: none;">Stop</button>
        <button id="refreshGraphBtn" type="button" class="secondary">Refresh Data</button>
        <button id="fitGraphBtn" type="button" class="secondary">Fit to Screen</button>
        <button id="zoomInBtn" type="button" class="secondary">Zoom In</button>
        <button id="zoomOutBtn" type="button" class="secondary">Zoom Out</button>
        <button id="resetZoomBtn" type="button" class="secondary">Reset Zoom</button>
      </div>
      <div id="statusMessage"></div>
      <div id="graphInfo"></div>
      <div id="network"></div>
    </main>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const typeLabels = {
      dependencies: "Dependencies",
      devDependencies: "Dev Dependencies",
      peerDependencies: "Peer Dependencies",
      optionalDependencies: "Optional Dependencies",
      bundledDependencies: "Bundled Dependencies",
      custom: "Custom Packages"
    };

    let packages = [];
    let selectedPackages = new Set();
    let activeTypes = new Set();
    let network;
    let nodes;
    let edges;

    const searchInput = document.getElementById("searchInput");
    const typeFiltersContainer = document.getElementById("typeFilters");
    const packageList = document.getElementById("packageList");
    const selectionSummary = document.getElementById("selectionSummary");
    const statusMessage = document.getElementById("statusMessage");
    const graphInfo = document.getElementById("graphInfo");
    const selectAllBtn = document.getElementById("selectAllBtn");
    const clearSelectionBtn = document.getElementById("clearSelectionBtn");
    const updateGraphBtn = document.getElementById("updateGraphBtn");
    const stopGraphBtn = document.getElementById("stopGraphBtn");
    const refreshGraphBtn = document.getElementById("refreshGraphBtn");
    const fitGraphBtn = document.getElementById("fitGraphBtn");
    const zoomInBtn = document.getElementById("zoomInBtn");
    const zoomOutBtn = document.getElementById("zoomOutBtn");
    const resetZoomBtn = document.getElementById("resetZoomBtn");
    const projectTitle = document.getElementById("projectTitle");

    window.addEventListener("message", (event) => {
      const message = event.data;

      switch (message.command) {
        case "init": {
          packages = Array.isArray(message.packages) ? message.packages : [];
          selectedPackages = new Set(Array.isArray(message.selection) ? message.selection : []);
          activeTypes = new Set(packages.map((pkg) => pkg.type));
          if (activeTypes.size === 0) {
            activeTypes.add("dependencies");
          }
          projectTitle.textContent = message.projectName
            ? \`\${message.projectName} — NPM Dependency Graph\`
            : "NPM Dependency Graph";

          renderTypeFilters();
          renderPackageList();
          renderSelectionSummary();
          
          // Only render graph if we have data
          const initGraphData = message.graphData || { nodes: [], edges: [] };
          if (initGraphData.nodes.length > 0) {
            renderGraph(initGraphData);
          }
          
          statusMessage.textContent = "Select packages and click 'Update Graph' to visualize dependencies.";
          break;
        }
        case "updateGraph":
          if (Array.isArray(message.selection)) {
            selectedPackages = new Set(message.selection);
            renderSelectionSummary();
            updateCheckboxStates();
          }
          renderGraph(message.graphData || { nodes: [], edges: [] });
          statusMessage.textContent = "";
          break;
        case "operationStarted":
          updateGraphBtn.disabled = true;
          refreshGraphBtn.disabled = true;
          stopGraphBtn.style.display = "inline-block";
          statusMessage.textContent = "Building graph... Click Stop to cancel.";
          break;
        case "operationComplete":
          updateGraphBtn.disabled = false;
          refreshGraphBtn.disabled = false;
          stopGraphBtn.style.display = "none";
          break;
        case "operationStopped":
          updateGraphBtn.disabled = false;
          refreshGraphBtn.disabled = false;
          stopGraphBtn.style.display = "none";
          statusMessage.textContent = message.message || "Operation stopped.";
          break;
        case "showError":
          statusMessage.textContent =
            typeof message.message === "string" ? message.message : "An unexpected error occurred.";
          updateGraphBtn.disabled = false;
          refreshGraphBtn.disabled = false;
          stopGraphBtn.style.display = "none";
          break;
      }
    });

    function renderTypeFilters() {
      const types = Array.from(new Set(packages.map((pkg) => pkg.type)));
      activeTypes = new Set(types);

      if (types.length === 0) {
        typeFiltersContainer.innerHTML = "<p class='empty-state'>No dependency entries found.</p>";
        return;
      }

      typeFiltersContainer.innerHTML = "";

      types.forEach((type) => {
        const label = document.createElement("label");
        label.className = "type-filter";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.type = type;

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            activeTypes.add(type);
          } else {
            activeTypes.delete(type);
          }

          if (activeTypes.size === 0) {
            activeTypes.add(type);
            checkbox.checked = true;
          }

          renderPackageList();
        });

        const text = document.createElement("span");
        text.textContent = typeLabels[type] ?? type;

        label.appendChild(checkbox);
        label.appendChild(text);
        typeFiltersContainer.appendChild(label);
      });
    }

    function renderPackageList() {
      const query = searchInput.value.trim().toLowerCase();

      const filtered = packages.filter((pkg) => {
        if (!activeTypes.has(pkg.type)) {
          return false;
        }
        if (!query) {
          return true;
        }
        return (
          pkg.name.toLowerCase().includes(query) ||
          pkg.version.toLowerCase().includes(query)
        );
      });

      if (filtered.length === 0) {
        packageList.innerHTML = "<p class='empty-state'>No packages match the current filters.</p>";
        return;
      }

      packageList.innerHTML = "";

      filtered.forEach((pkg) => {
        const item = document.createElement("div");
        item.className = "package-item";

        const left = document.createElement("label");
        left.style.display = "flex";
        left.style.gap = "8px";
        left.style.alignItems = "center";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.dataset.package = pkg.name;
        checkbox.checked = selectedPackages.has(pkg.name);

        checkbox.addEventListener("change", () => {
          if (checkbox.checked) {
            selectedPackages.add(pkg.name);
          } else {
            selectedPackages.delete(pkg.name);
          }
          renderSelectionSummary();
        });

        const details = document.createElement("div");
        details.className = "package-details";

        const name = document.createElement("div");
        name.className = "package-name";
        name.textContent = pkg.name;

        const meta = document.createElement("div");
        meta.className = "package-meta";
        meta.textContent = \`\${pkg.version} • \${typeLabels[pkg.type] ?? pkg.type}\`;

        details.appendChild(name);
        details.appendChild(meta);
        left.appendChild(checkbox);
        left.appendChild(details);

        item.appendChild(left);
        packageList.appendChild(item);
      });
    }

    function updateCheckboxStates() {
      const checkboxes = packageList.querySelectorAll("input[type='checkbox']");
      checkboxes.forEach((checkbox) => {
        const name = checkbox.dataset.package;
        checkbox.checked = selectedPackages.has(name);
      });
    }

    function renderSelectionSummary() {
      const total = packages.length;
      const selected = selectedPackages.size;

      if (total === 0) {
        selectionSummary.textContent = "No packages detected.";
      } else {
        selectionSummary.textContent = \`\${selected} of \${total} package\${total === 1 ? "" : "s"} selected\`;
      }
    }

    function renderGraph(graphData) {
      const container = document.getElementById("network");

      // Initialize network if needed
      if (!nodes || !edges) {
        nodes = new vis.DataSet();
        edges = new vis.DataSet();

        const data = { nodes, edges };
        const options = {
          layout: {
            hierarchical: false
          },
          physics: { 
            enabled: true,
            stabilization: {
              enabled: true,
              iterations: 200,
              fit: true
            },
            barnesHut: {
              gravitationalConstant: -8000,
              centralGravity: 0.3,
              springLength: 150,
              springConstant: 0.04,
              damping: 0.09
            }
          },
          nodes: {
            shape: "box",
            margin: 10,
            widthConstraint: { maximum: 220 },
            font: { size: 14 }
          },
          edges: {
            arrows: "to",
            color: {
              color: "#848484",
              highlight: "#569CD6"
            },
            smooth: {
              enabled: true,
              type: "continuous"
            }
          },
          interaction: {
            hover: true,
            navigationButtons: false,
            keyboard: true,
            zoomView: true,
            dragView: true
          }
        };

        network = new vis.Network(container, data, options);

        // Stop physics after stabilization
        network.on("stabilizationIterationsDone", () => {
          network.setOptions({ physics: false });
        });

        network.on("click", (params) => {
          if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            const node = nodes.get(nodeId);
            if (node) {
              const packageName = node.originalName ?? node.label.split("\\n")[0];
              vscode.postMessage({
                command: "openPackage",
                packageName
              });
            }
          }
        });
      }

      // CRITICAL: Clear existing nodes and edges before adding new ones
      nodes.clear();
      edges.clear();

      const graphNodes = Array.isArray(graphData.nodes) ? graphData.nodes : [];
      const graphEdges = Array.isArray(graphData.edges) ? graphData.edges : [];

      if (graphNodes.length === 0) {
        statusMessage.textContent =
          statusMessage.textContent || "No graph data available. Select one or more packages and click 'Update Graph' to visualize dependencies.";
        graphInfo.textContent = "";
        return;
      }

      graphInfo.textContent = \`Nodes: \${graphNodes.length}, Edges: \${graphEdges.length}\`;

      // Add new nodes
      const nodePayload = graphNodes.map((node) => ({
        id: node.id,
        label: \`\${node.label}\\n\${node.version}\`,
        title: \`\${node.label}@\${node.version}\`,
        level: node.level,
        originalName: node.label,
        color: getColorForLevel(node.level)
      }));

      nodes.add(nodePayload);

      // Add new edges
      const edgePayload = graphEdges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        arrows: "to"
      }));

      edges.add(edgePayload);

      // Fit the graph after rendering completes
      if (graphNodes.length > 0 && network) {
        setTimeout(() => {
          network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
        }, 300);
      }
    }

    function getColorForLevel(level) {
      const colors = [
        "#569CD6",
        "#4EC9B0",
        "#CE9178",
        "#C586C0",
        "#DCDCAA"
      ];
      return colors[level % colors.length];
    }

    selectAllBtn.addEventListener("click", () => {
      packages
        .filter((pkg) => activeTypes.has(pkg.type))
        .forEach((pkg) => selectedPackages.add(pkg.name));
      renderSelectionSummary();
      renderPackageList();
    });

    clearSelectionBtn.addEventListener("click", () => {
      selectedPackages.clear();
      renderSelectionSummary();
      renderPackageList();
    });

    updateGraphBtn.addEventListener("click", () => {
      vscode.postMessage({
        command: "changeSelection",
        packageNames: Array.from(selectedPackages)
      });
    });

    stopGraphBtn.addEventListener("click", () => {
      vscode.postMessage({
        command: "stop"
      });
    });

    refreshGraphBtn.addEventListener("click", () => {
      vscode.postMessage({
        command: "refresh",
        packageNames: Array.from(selectedPackages)
      });
    });

    fitGraphBtn.addEventListener("click", () => {
      if (network) {
        network.fit({ animation: { duration: 500, easingFunction: "easeInOutQuad" } });
      }
    });

    zoomInBtn.addEventListener("click", () => {
      if (network) {
        const scale = network.getScale();
        network.moveTo({ scale: scale * 1.2, animation: { duration: 300 } });
      }
    });

    zoomOutBtn.addEventListener("click", () => {
      if (network) {
        const scale = network.getScale();
        network.moveTo({ scale: scale * 0.8, animation: { duration: 300 } });
      }
    });

    resetZoomBtn.addEventListener("click", () => {
      if (network) {
        network.moveTo({ scale: 1.0, position: { x: 0, y: 0 }, animation: { duration: 500 } });
      }
    });

    searchInput.addEventListener("input", () => {
      renderPackageList();
    });

    vscode.postMessage({ command: "webviewReady" });
  </script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for Content Security Policy
   */
  private getNonce(): string {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 32 }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  }
}
