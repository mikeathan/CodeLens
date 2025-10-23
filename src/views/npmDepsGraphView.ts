import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  NpmDependenciesService,
  GraphData,
} from "../services/npmDependenciesService";

export class NpmDepsGraphView {
  private panel: vscode.WebviewPanel | undefined;
  private npmService: NpmDependenciesService;

  constructor(private context: vscode.ExtensionContext) {
    this.npmService = new NpmDependenciesService();
  }

  /**
   * Show the npm dependency graph view
   */
  async show(): Promise<void> {
    try {
      // Get package names from user or workspace
      const packageNames = await this.getPackageNames();
      
      if (!packageNames || packageNames.length === 0) {
        vscode.window.showWarningMessage("No packages selected");
        return;
      }

      // Show progress while building graph
      const graphData = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Building npm dependency graph...",
          cancellable: false
        },
        async () => {
          return await this.npmService.buildGraph(packageNames, 3, 100);
        }
      );

      // Create or show panel
      if (this.panel) {
        this.panel.reveal(vscode.ViewColumn.One);
      } else {
        this.panel = vscode.window.createWebviewPanel(
          "npmDepsGraph",
          "NPM Dependency Graph",
          vscode.ViewColumn.One,
          {
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );

        this.panel.onDidDispose(() => {
          this.panel = undefined;
        });

        // Handle messages from webview
        this.panel.webview.onDidReceiveMessage(
          async (message) => {
            switch (message.command) {
              case "refresh":
                await this.refresh();
                break;
              case "openPackage":
                await this.openPackageInBrowser(message.packageName);
                break;
            }
          },
          undefined,
          this.context.subscriptions
        );
      }

      // Update webview content
      this.panel.webview.html = this.getWebviewContent(graphData);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to show npm dependency graph: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Refresh the graph
   */
  private async refresh(): Promise<void> {
    if (!this.panel) {
      return;
    }

    try {
      const packageNames = await this.getPackageNames();
      
      if (!packageNames || packageNames.length === 0) {
        return;
      }

      const graphData = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Refreshing npm dependency graph...",
          cancellable: false
        },
        async () => {
          this.npmService.clearCache();
          return await this.npmService.buildGraph(packageNames, 3, 100);
        }
      );

      this.panel.webview.html = this.getWebviewContent(graphData);
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to refresh graph: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get package names from user input or workspace package.json
   */
  private async getPackageNames(): Promise<string[]> {
    // Try to find package.json in workspace
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let defaultPackages: string[] = [];

    if (workspaceFolders && workspaceFolders.length > 0) {
      const packageJsonPath = path.join(
        workspaceFolders[0].uri.fsPath,
        "package.json"
      );

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );

          // Show quick pick to ask if user wants to include devDependencies
          const includeDevDeps = await vscode.window.showQuickPick(
            ["No", "Yes"],
            {
              placeHolder: "Include devDependencies?"
            }
          );

          const deps = packageJson.dependencies || {};
          const devDeps =
            includeDevDeps === "Yes" ? packageJson.devDependencies || {} : {};

          defaultPackages = [
            ...Object.keys(deps),
            ...Object.keys(devDeps)
          ];
        } catch (error) {
          console.error("Error reading package.json:", error);
        }
      }
    }

    // Ask user for package names
    const input = await vscode.window.showInputBox({
      prompt: "Enter comma-separated package names (or leave empty to use workspace dependencies)",
      placeHolder: "e.g., express, lodash, react",
      value: defaultPackages.length > 0 ? defaultPackages.join(", ") : ""
    });

    if (input === undefined) {
      return [];
    }

    if (input.trim() === "") {
      return defaultPackages;
    }

    return input.split(",").map(p => p.trim()).filter(p => p.length > 0);
  }

  /**
   * Open package page on npmjs.com
   */
  private async openPackageInBrowser(packageName: string): Promise<void> {
    const url = `https://www.npmjs.com/package/${encodeURIComponent(packageName)}`;
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  /**
   * Generate webview HTML content
   */
  private getWebviewContent(graphData: GraphData): string {
    const nodesJson = JSON.stringify(graphData.nodes);
    const edgesJson = JSON.stringify(graphData.edges);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NPM Dependency Graph</title>
    <script type="text/javascript" src="https://unpkg.com/vis-network/standalone/umd/vis-network.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        #controls {
            padding: 10px;
            background-color: var(--vscode-sideBar-background);
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 14px;
            cursor: pointer;
            margin-right: 5px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        #mynetwork {
            width: 100%;
            height: calc(100vh - 50px);
            border: 1px solid var(--vscode-panel-border);
        }
        #info {
            padding: 10px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div id="controls">
        <button onclick="refresh()">Refresh</button>
        <button onclick="fitGraph()">Fit to Screen</button>
        <span id="info">Nodes: ${graphData.nodes.length}, Edges: ${graphData.edges.length}</span>
    </div>
    <div id="mynetwork"></div>
    
    <script type="text/javascript">
        const vscode = acquireVsCodeApi();
        
        // Parse graph data
        const nodes = new vis.DataSet(${nodesJson}.map(node => ({
            id: node.id,
            label: node.label + '\\n' + node.version,
            title: node.label + '@' + node.version,
            level: node.level,
            color: getColorForLevel(node.level)
        })));
        
        const edges = new vis.DataSet(${edgesJson}.map(edge => ({
            from: edge.from,
            to: edge.to,
            arrows: 'to'
        })));
        
        // Create network
        const container = document.getElementById('mynetwork');
        const data = { nodes: nodes, edges: edges };
        const options = {
            layout: {
                hierarchical: {
                    direction: 'UD',
                    sortMethod: 'directed',
                    nodeSpacing: 150,
                    levelSeparation: 150
                }
            },
            physics: {
                enabled: false
            },
            nodes: {
                shape: 'box',
                margin: 10,
                widthConstraint: {
                    maximum: 200
                },
                font: {
                    size: 14,
                    color: '#ffffff'
                }
            },
            edges: {
                color: {
                    color: '#848484',
                    highlight: '#3498db'
                },
                width: 2,
                smooth: {
                    type: 'cubicBezier',
                    forceDirection: 'vertical'
                }
            },
            interaction: {
                hover: true,
                navigationButtons: true,
                keyboard: true
            }
        };
        
        const network = new vis.Network(container, data, options);
        
        // Handle node click
        network.on('click', function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodes.get(nodeId);
                vscode.postMessage({
                    command: 'openPackage',
                    packageName: node.label.split('\\n')[0]
                });
            }
        });
        
        function getColorForLevel(level) {
            const colors = [
                '#3498db', // blue
                '#2ecc71', // green
                '#f39c12', // orange
                '#e74c3c', // red
                '#9b59b6'  // purple
            ];
            return colors[level % colors.length];
        }
        
        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }
        
        function fitGraph() {
            network.fit();
        }
        
        // Fit graph on load
        network.once('stabilizationIterationsDone', function() {
            network.fit();
        });
    </script>
</body>
</html>`;
  }

  /**
   * Dispose the view
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}
