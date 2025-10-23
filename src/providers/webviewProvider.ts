import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class CoverageWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  async showCoverageReport(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }

    const reportPath = path.join(
      workspaceFolder.uri.fsPath,
      "coverage",
      "report",
      "index.html"
    );

    if (!fs.existsSync(reportPath)) {
      const generate = await vscode.window.showWarningMessage(
        "Coverage report not found. Would you like to generate it?",
        "Generate Report"
      );
      if (generate === "Generate Report") {
        vscode.commands.executeCommand("dotnet-coverage.generateReport");
      }
      return;
    }

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
    } else {
      this.panel = vscode.window.createWebviewPanel(
        "dotnetCoverage",
        "Code Coverage Report",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, "coverage")),
          ],
        }
      );

      const htmlContent = fs.readFileSync(reportPath, "utf8");
      const reportDir = path.dirname(reportPath);
      const normalizedReportDir = path.resolve(reportDir);

      // Convert local file paths to webview URIs
      const webviewHtml = htmlContent.replace(
        /(src|href)="(?!https?:)([^"]+)"/gi,
        (match: string, attr: string, resourcePath: string) => {
          // Skip data, mailto, protocol-relative, and already transformed URIs
          if (
            /^(data:|mailto:|vscode-resource:|blob:)/i.test(resourcePath) ||
            resourcePath.startsWith("//")
          ) {
            return match;
          }

          let pathPart = resourcePath;
          let queryPart: string | undefined;
          let fragmentPart: string | undefined;

          const hashIndex = pathPart.indexOf("#");
          if (hashIndex !== -1) {
            fragmentPart = pathPart.slice(hashIndex + 1);
            pathPart = pathPart.slice(0, hashIndex);
          }

          const queryIndex = pathPart.indexOf("?");
          if (queryIndex !== -1) {
            queryPart = pathPart.slice(queryIndex + 1);
            pathPart = pathPart.slice(0, queryIndex);
          }

          if (!pathPart.trim()) {
            return match;
          }

          const resolvedPath = path.resolve(reportDir, pathPart);
          const relativeToReport = path.relative(
            normalizedReportDir,
            resolvedPath
          );

          if (
            relativeToReport.startsWith("..") ||
            path.isAbsolute(relativeToReport)
          ) {
            return match;
          }

          if (!fs.existsSync(resolvedPath)) {
            return match;
          }

          const stat = fs.statSync(resolvedPath);
          if (!stat.isFile()) {
            return match;
          }

          let webviewUri = this.panel!.webview.asWebviewUri(
            vscode.Uri.file(resolvedPath)
          );

          if (queryPart || fragmentPart) {
            webviewUri = webviewUri.with({
              query: queryPart || undefined,
              fragment: fragmentPart || undefined,
            });
          }

          return `${attr}="${webviewUri.toString()}"`;
        }
      );

      this.panel.webview.html = webviewHtml;

      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
        },
        undefined,
        this.context.subscriptions
      );
    }
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}

export class AssemblyWebviewProvider {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private context: vscode.ExtensionContext) {}

  showAssemblyInfo(assemblyPath: string, assemblyInfo: string): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      // Update content
      this.panel.webview.html = this.getAssemblyInfoHtml(
        assemblyPath,
        assemblyInfo
      );
    } else {
      this.panel = vscode.window.createWebviewPanel(
        "dotnetAssemblyInfo",
        `Assembly Info - ${path.basename(assemblyPath)}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.webview.html = this.getAssemblyInfoHtml(
        assemblyPath,
        assemblyInfo
      );

      // Handle messages from the webview
      this.panel.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.command) {
            case "showInfo":
              vscode.window.showInformationMessage(message.text);
              break;
            case "refresh":
              // Re-analyze the assembly
              vscode.commands.executeCommand(
                "dotnet-coverage.viewAssemblyInfo",
                vscode.Uri.file(message.path)
              );
              break;
          }
        },
        undefined,
        this.context.subscriptions
      );

      this.panel.onDidDispose(
        () => {
          this.panel = undefined;
        },
        undefined,
        this.context.subscriptions
      );
    }
  }

  private getAssemblyInfoHtml(
    assemblyPath: string,
    assemblyInfo: string
  ): string {
    const fileName = path.basename(assemblyPath);
    const formattedInfo = assemblyInfo
      .replace(/\n/g, "<br>")
      .replace(/  /g, "&nbsp;&nbsp;");

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Assembly Information</title>
        <style>
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                margin: 20px;
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            
            .header {
                border-bottom: 2px solid var(--vscode-textSeparator-foreground);
                padding-bottom: 10px;
                margin-bottom: 20px;
            }
            
            .assembly-name {
                font-size: 24px;
                font-weight: bold;
                color: var(--vscode-textLink-foreground);
                margin: 0;
            }
            
            .assembly-path {
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                margin: 5px 0 0 0;
                word-break: break-all;
            }
            
            .content {
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 13px;
                white-space: pre-wrap;
                background-color: var(--vscode-textCodeBlock-background);
                padding: 15px;
                border-radius: 5px;
                border: 1px solid var(--vscode-panel-border);
                overflow-x: auto;
            }
            
            .toolbar {
                margin-bottom: 15px;
            }
            
            .button {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                padding: 8px 16px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                margin-right: 10px;
            }
            
            .button:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1 class="assembly-name">${fileName}</h1>
            <p class="assembly-path">${assemblyPath}</p>
        </div>
        
        <div class="toolbar">
            <button class="button" onclick="copyToClipboard()">Copy All</button>
            <button class="button" onclick="refreshAnalysis()">Refresh</button>
        </div>
        
        <div class="content" id="assemblyContent">${formattedInfo}</div>

        <script>
            const vscode = acquireVsCodeApi();
            
            function copyToClipboard() {
                const content = document.getElementById('assemblyContent').innerText;
                navigator.clipboard.writeText(content).then(() => {
                    vscode.postMessage({ command: 'showInfo', text: 'Assembly information copied to clipboard!' });
                });
            }
            
            function refreshAnalysis() {
                vscode.postMessage({ command: 'refresh', path: '${assemblyPath}' });
            }
        </script>
    </body>
    </html>
    `;
  }

  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}
