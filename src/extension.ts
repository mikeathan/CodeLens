import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let outputChannel: vscode.OutputChannel;
let coveragePanel: vscode.WebviewPanel | undefined;
let assemblyPanel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('CoverLens');
	
	console.log('CoverLens is now active!');

	// Command: Generate Coverage Report
	const generateCoverage = vscode.commands.registerCommand('dotnet-coverage.generateReport', async (uri?: vscode.Uri) => {
		await generateCoverageReport(context, uri);
	});

	// Command: Show Coverage Report
	const showCoverage = vscode.commands.registerCommand('dotnet-coverage.showReport', async () => {
		await showCoverageReport(context);
	});

	// Command: Run Tests with Coverage
	const runTestsWithCoverage = vscode.commands.registerCommand('dotnet-coverage.runTests', async () => {
		await runTestsWithCoverage_impl(context);
	});

	// Command: View Assembly Information
	const viewAssemblyInfo = vscode.commands.registerCommand('dotnet-coverage.viewAssemblyInfo', async (uri?: vscode.Uri) => {
		await viewAssemblyInformation(context, uri);
	});

	context.subscriptions.push(generateCoverage, showCoverage, runTestsWithCoverage, viewAssemblyInfo, outputChannel);
}

async function generateCoverageReport(context: vscode.ExtensionContext, targetUri?: vscode.Uri) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found. Please open a .NET project.');
		return;
	}

	const workspacePath = workspaceFolder.uri.fsPath;
	
	// Determine the target file/directory for testing
	let targetPath: string | undefined;
	let targetDir: string = workspacePath;
	
	if (targetUri) {
		targetPath = targetUri.fsPath;
		const stat = fs.statSync(targetPath);
		
		if (stat.isFile()) {
			// If it's a .sln or .csproj file, use it directly
			if (targetPath && (targetPath.endsWith('.sln') || targetPath.endsWith('.csproj'))) {
				targetDir = path.dirname(targetPath);
			}
		} else if (stat.isDirectory()) {
			targetDir = targetPath;
			targetPath = undefined;
		}
	}
	
	// Check if dotnet is installed
	try {
		await execAsync('dotnet --version');
	} catch (error) {
		vscode.window.showErrorMessage('.NET CLI is not installed or not in PATH.');
		return;
	}

	outputChannel.show();
	outputChannel.appendLine('Starting code coverage report generation...');
	outputChannel.appendLine(`Workspace: ${workspacePath}`);
	if (targetPath) {
		outputChannel.appendLine(`Target: ${targetPath}`);
	}

	try {
		// Find test projects
		const testProjects = await findTestProjects(workspacePath);
		if (testProjects.length === 0) {
			vscode.window.showWarningMessage('No test projects found in the workspace.');
			return;
		}

		outputChannel.appendLine(`Found ${testProjects.length} test project(s)`);

		// Run tests with coverage
		const coverageDir = path.join(workspacePath, 'coverage');
		if (!fs.existsSync(coverageDir)) {
			fs.mkdirSync(coverageDir, { recursive: true });
		}

		outputChannel.appendLine('Running dotnet test with coverage collection...');
		
		// Build the command with the target file if provided
		let command: string;
		if (targetPath && (targetPath.endsWith('.sln') || targetPath.endsWith('.csproj'))) {
			command = `dotnet test "${targetPath}" --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
		} else {
			command = `dotnet test --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
		}
		
		outputChannel.appendLine(`Command: ${command}`);
		outputChannel.appendLine(`Working directory: ${targetDir}`);
		
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Generating coverage report...",
			cancellable: false
		}, async (progress: vscode.Progress<{ increment?: number; message?: string }>) => {
			progress.report({ increment: 0 });
			
			try {
				const { stdout, stderr } = await execAsync(command, { cwd: targetDir, maxBuffer: 1024 * 1024 * 10 });
				
				if (stdout) {
					outputChannel.appendLine(stdout);
				}
				if (stderr) {
					outputChannel.appendLine(`Stderr: ${stderr}`);
				}
			} catch (execError: any) {
				outputChannel.appendLine(`Command failed with exit code: ${execError.code}`);
				if (execError.stdout) {
					outputChannel.appendLine(`Stdout: ${execError.stdout}`);
				}
				if (execError.stderr) {
					outputChannel.appendLine(`Stderr: ${execError.stderr}`);
				}
				throw execError;
			}
			
			progress.report({ increment: 50 });

			// Find the generated coverage file
			const coverageFiles = findCoverageFiles(coverageDir);
			if (coverageFiles.length > 0) {
				outputChannel.appendLine(`Coverage file generated: ${coverageFiles[0]}`);
				
				// Check if reportgenerator is installed
				let reportGeneratorInstalled = false;
				try {
					await execAsync('dotnet tool list --global');
					const { stdout } = await execAsync('dotnet tool list --global');
					reportGeneratorInstalled = stdout.includes('dotnet-reportgenerator-globaltool');
				} catch (error) {
					// Ignore error, we'll try to install
				}

				if (!reportGeneratorInstalled) {
					outputChannel.appendLine('ReportGenerator not found. Installing globally...');
					try {
						const { stdout, stderr } = await execAsync('dotnet tool install --global dotnet-reportgenerator-globaltool');
						outputChannel.appendLine(stdout);
						if (stderr) {
							outputChannel.appendLine(`Stderr: ${stderr}`);
						}
						vscode.window.showInformationMessage('ReportGenerator installed successfully! Running report generation...');
					} catch (installError: any) {
						outputChannel.appendLine(`Installation failed: ${installError.message}`);
						if (installError.stdout) {
							outputChannel.appendLine(`Stdout: ${installError.stdout}`);
						}
						if (installError.stderr) {
							outputChannel.appendLine(`Stderr: ${installError.stderr}`);
						}
						
						// Check if it's already installed
						if (installError.message.includes('already installed') || installError.stderr?.includes('already installed')) {
							outputChannel.appendLine('Tool already installed, continuing...');
							reportGeneratorInstalled = true;
						} else {
							vscode.window.showErrorMessage('Failed to install ReportGenerator. Check output for details.');
							return;
						}
					}
				}
				
				// Generate HTML report
				try {
					outputChannel.appendLine('Generating HTML report...');
					const reportDir = path.join(coverageDir, 'report');
					
					// Use all coverage files found - join with semicolon for ReportGenerator
					const reportsArg = coverageFiles.join(';');
					const reportCommand = `reportgenerator "-reports:${reportsArg}" "-targetdir:${reportDir}" "-reporttypes:Html"`;
					
					outputChannel.appendLine(`Report command: ${reportCommand}`);
					
					const { stdout, stderr } = await execAsync(reportCommand, { cwd: workspacePath, maxBuffer: 1024 * 1024 * 10 });
					
					if (stdout) {
						outputChannel.appendLine(stdout);
					}
					if (stderr) {
						outputChannel.appendLine(`Report generation stderr: ${stderr}`);
					}
					
					outputChannel.appendLine(`HTML report generated at: ${reportDir}`);
					
					progress.report({ increment: 100 });
					
					const showReport = await vscode.window.showInformationMessage(
						'Coverage report generated successfully!',
						'Show Report',
						'Open Folder'
					);
					
					if (showReport === 'Show Report') {
						await showCoverageReport(context);
					} else if (showReport === 'Open Folder') {
						vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(reportDir));
					}
				} catch (error: any) {
					outputChannel.appendLine(`HTML report generation failed: ${error.message}`);
					if (error.stdout) {
						outputChannel.appendLine(`Stdout: ${error.stdout}`);
					}
					if (error.stderr) {
						outputChannel.appendLine(`Stderr: ${error.stderr}`);
					}
					vscode.window.showErrorMessage('Failed to generate HTML report. Check output for details.');
				}
			} else {
				vscode.window.showWarningMessage('No coverage file was generated.');
			}
		});

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Error: ${errorMessage}`);
		vscode.window.showErrorMessage(`Failed to generate coverage report: ${errorMessage}`);
	}
}

async function runTestsWithCoverage_impl(context: vscode.ExtensionContext) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found.');
		return;
	}

	const workspacePath = workspaceFolder.uri.fsPath;
	outputChannel.show();
	outputChannel.appendLine('Running tests with coverage...');

	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Running tests...",
			cancellable: false
		}, async (progress: vscode.Progress<{ increment?: number; message?: string }>) => {
			const command = `dotnet test --collect:"XPlat Code Coverage"`;
			const { stdout, stderr } = await execAsync(command, { cwd: workspacePath });
			
			if (stdout) {
				outputChannel.appendLine(stdout);
			}
			if (stderr) {
				outputChannel.appendLine(stderr);
			}
			
			vscode.window.showInformationMessage('Tests completed. Generate report to view coverage.');
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Error: ${errorMessage}`);
		vscode.window.showErrorMessage(`Failed to run tests: ${errorMessage}`);
	}
}

async function showCoverageReport(context: vscode.ExtensionContext) {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	if (!workspaceFolder) {
		vscode.window.showErrorMessage('No workspace folder found.');
		return;
	}

	const reportPath = path.join(workspaceFolder.uri.fsPath, 'coverage', 'report', 'index.html');
	
	if (!fs.existsSync(reportPath)) {
		const generate = await vscode.window.showWarningMessage(
			'Coverage report not found. Would you like to generate it?',
			'Generate Report'
		);
		if (generate === 'Generate Report') {
			await generateCoverageReport(context);
		}
		return;
	}

	if (coveragePanel) {
		coveragePanel.reveal(vscode.ViewColumn.One);
	} else {
		coveragePanel = vscode.window.createWebviewPanel(
			'dotnetCoverage',
			'Code Coverage Report',
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, 'coverage'))]
			}
		);

		const htmlContent = fs.readFileSync(reportPath, 'utf8');
		const reportDir = path.dirname(reportPath);
		
		// Convert local file paths to webview URIs
		const webviewHtml = htmlContent.replace(
			/(src|href)="(?!http)([^"]+)"/g,
			(match: string, attr: string, filePath: string) => {
				const fullPath = path.join(reportDir, filePath);
				const webviewUri = coveragePanel!.webview.asWebviewUri(vscode.Uri.file(fullPath));
				return `${attr}="${webviewUri}"`;
			}
		);

		coveragePanel.webview.html = webviewHtml;

		coveragePanel.onDidDispose(
			() => {
				coveragePanel = undefined;
			},
			undefined,
			context.subscriptions
		);
	}
}

function findCoverageFiles(dir: string): string[] {
	const files: string[] = [];
	
	function search(directory: string) {
		if (!fs.existsSync(directory)) {
			return;
		}
		
		const entries = fs.readdirSync(directory, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				search(fullPath);
			} else if (entry.name === 'coverage.cobertura.xml' || entry.name.endsWith('.cobertura.xml')) {
				files.push(fullPath);
			}
		}
	}
	
	search(dir);
	return files;
}

async function findTestProjects(workspacePath: string): Promise<string[]> {
	const projects: string[] = [];
	
	function search(directory: string) {
		if (!fs.existsSync(directory)) {
			return;
		}
		
		const entries = fs.readdirSync(directory, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name === 'node_modules' || entry.name === 'bin' || entry.name === 'obj') {
				continue;
			}
			
			const fullPath = path.join(directory, entry.name);
			if (entry.isDirectory()) {
				search(fullPath);
			} else if (entry.name.endsWith('.csproj') || entry.name.endsWith('.fsproj')) {
				const content = fs.readFileSync(fullPath, 'utf8');
				if (content.includes('Microsoft.NET.Test.Sdk') || 
					content.includes('xunit') || 
					content.includes('NUnit') || 
					content.includes('MSTest')) {
					projects.push(fullPath);
				}
			}
		}
	}
	
	search(workspacePath);
	return projects;
}

async function viewAssemblyInformation(context: vscode.ExtensionContext, targetUri?: vscode.Uri) {
	let assemblyPath: string | undefined;

	if (targetUri) {
		assemblyPath = targetUri.fsPath;
	} else {
		// If no URI provided, ask user to select a DLL
		const fileUri = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			canSelectFolders: false,
			canSelectMany: false,
			filters: {
				'.NET Assemblies': ['dll', 'exe']
			},
			title: 'Select .NET Assembly'
		});

		if (fileUri && fileUri[0]) {
			assemblyPath = fileUri[0].fsPath;
		} else {
			return;
		}
	}

	if (!assemblyPath || (!assemblyPath.endsWith('.dll') && !assemblyPath.endsWith('.exe'))) {
		vscode.window.showErrorMessage('Please select a valid .NET assembly (.dll or .exe file).');
		return;
	}

	// Check if dotnet is installed
	try {
		await execAsync('dotnet --version');
	} catch (error) {
		vscode.window.showErrorMessage('.NET CLI is not installed or not in PATH.');
		return;
	}

	outputChannel.show();
	outputChannel.appendLine(`Analyzing assembly: ${assemblyPath}`);

	try {
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Analyzing assembly...",
			cancellable: false
		}, async (progress: vscode.Progress<{ increment?: number; message?: string }>) => {
			progress.report({ increment: 0 });

			// Use reflection to get assembly information
			const reflectionScript = `
using System;
using System.IO;
using System.Reflection;
using System.Linq;

try {
	var assembly = Assembly.LoadFrom(@"${assemblyPath.replace(/\\/g, '\\\\')}");
	var name = assembly.GetName();
	
	Console.WriteLine("=== ASSEMBLY INFORMATION ===");
	Console.WriteLine($"Name: {name.Name}");
	Console.WriteLine($"Version: {name.Version}");
	Console.WriteLine($"Culture: {(string.IsNullOrEmpty(name.CultureName) ? "Neutral" : name.CultureName)}");
	Console.WriteLine($"Public Key Token: {(name.GetPublicKeyToken()?.Length > 0 ? BitConverter.ToString(name.GetPublicKeyToken()).Replace("-", "") : "None")}");
	Console.WriteLine($"Location: {assembly.Location}");
	Console.WriteLine($"Framework: {assembly.ImageRuntimeVersion}");
	
	var fileInfo = new FileInfo(assembly.Location);
	Console.WriteLine($"File Size: {fileInfo.Length:N0} bytes");
	Console.WriteLine($"Created: {fileInfo.CreationTime}");
	Console.WriteLine($"Modified: {fileInfo.LastWriteTime}");
	
	Console.WriteLine();
	Console.WriteLine("=== REFERENCED ASSEMBLIES ===");
	var refs = assembly.GetReferencedAssemblies().OrderBy(r => r.Name);
	foreach (var refAssembly in refs) {
		Console.WriteLine($"{refAssembly.Name} ({refAssembly.Version})");
	}
	
	Console.WriteLine();
	Console.WriteLine("=== EXPORTED TYPES ===");
	var types = assembly.GetExportedTypes().Take(20).OrderBy(t => t.FullName);
	foreach (var type in types) {
		Console.WriteLine($"{type.FullName} [{type.BaseType?.Name}]");
	}
	
	var totalTypes = assembly.GetExportedTypes().Length;
	if (totalTypes > 20) {
		Console.WriteLine($"... and {totalTypes - 20} more types");
	}
	
	Console.WriteLine();
	Console.WriteLine("=== CUSTOM ATTRIBUTES ===");
	var attributes = assembly.GetCustomAttributes().Take(10);
	foreach (var attr in attributes) {
		Console.WriteLine($"{attr.GetType().Name}");
	}
	
} catch (Exception ex) {
	Console.WriteLine($"Error: {ex.Message}");
}
`;

			// Create temporary C# file
			const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
			const tempDir = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(assemblyPath);
			const tempFile = path.join(tempDir, 'temp_assembly_info.cs');

			try {
				fs.writeFileSync(tempFile, reflectionScript);
				
				progress.report({ increment: 30 });

				// Run the reflection script
				const { stdout, stderr } = await execAsync(`dotnet script "${tempFile}"`, { 
					cwd: tempDir,
					maxBuffer: 1024 * 1024 * 5 
				});

				progress.report({ increment: 100 });

				// Clean up temp file
				if (fs.existsSync(tempFile)) {
					fs.unlinkSync(tempFile);
				}

				if (stdout) {
					outputChannel.appendLine(stdout);
					
					// Show assembly info in a new document
					const doc = await vscode.workspace.openTextDocument({
						content: `Assembly Information for: ${path.basename(assemblyPath)}\n${'='.repeat(60)}\n\n${stdout}`,
						language: 'plaintext'
					});
					await vscode.window.showTextDocument(doc);
				}

				if (stderr) {
					outputChannel.appendLine(`Warnings: ${stderr}`);
				}

			} catch (scriptError: any) {
				// Fallback: Create a temporary console app to analyze the assembly
				outputChannel.appendLine('dotnet-script not available, using alternative analysis method...');
				
				try {
					// Create a temporary console project
					const tempProjectDir = path.join(tempDir, 'temp_assembly_analyzer');
					const tempProjectFile = path.join(tempProjectDir, 'temp_assembly_analyzer.csproj');
					const tempProgramFile = path.join(tempProjectDir, 'Program.cs');
					
					// Create directory if it doesn't exist
					if (!fs.existsSync(tempProjectDir)) {
						fs.mkdirSync(tempProjectDir, { recursive: true });
					}
					
					// Create a simple console project
					const projectContent = `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;

					const programContent = `
using System;
using System.IO;
using System.Reflection;
using System.Linq;

try {
    var assemblyPath = @"${assemblyPath.replace(/\\/g, '\\\\')}";
    var assembly = Assembly.LoadFrom(assemblyPath);
    var name = assembly.GetName();
    
    Console.WriteLine("=== ASSEMBLY INFORMATION ===");
    Console.WriteLine($"Name: {name.Name}");
    Console.WriteLine($"Version: {name.Version}");
    Console.WriteLine($"Culture: {(string.IsNullOrEmpty(name.CultureName) ? "Neutral" : name.CultureName)}");
    Console.WriteLine($"Public Key Token: {(name.GetPublicKeyToken()?.Length > 0 ? BitConverter.ToString(name.GetPublicKeyToken()).Replace("-", "") : "None")}");
    Console.WriteLine($"Location: {assembly.Location}");
    Console.WriteLine($"Framework: {assembly.ImageRuntimeVersion}");
    
    var fileInfo = new FileInfo(assembly.Location);
    Console.WriteLine($"File Size: {fileInfo.Length:N0} bytes");
    Console.WriteLine($"Created: {fileInfo.CreationTime}");
    Console.WriteLine($"Modified: {fileInfo.LastWriteTime}");
    
    Console.WriteLine();
    Console.WriteLine("=== REFERENCED ASSEMBLIES ===");
    var refs = assembly.GetReferencedAssemblies().OrderBy(r => r.Name);
    foreach (var refAssembly in refs) {
        Console.WriteLine($"{refAssembly.Name} ({refAssembly.Version})");
    }
    
    Console.WriteLine();
    Console.WriteLine("=== EXPORTED TYPES (first 20) ===");
    var types = assembly.GetExportedTypes().Take(20).OrderBy(t => t.FullName);
    foreach (var type in types) {
        Console.WriteLine($"{type.FullName} [{type.BaseType?.Name ?? "Object"}]");
    }
    
    var totalTypes = assembly.GetExportedTypes().Length;
    if (totalTypes > 20) {
        Console.WriteLine($"... and {totalTypes - 20} more types");
    }
    
    Console.WriteLine();
    Console.WriteLine("=== CUSTOM ATTRIBUTES ===");
    var attributes = assembly.GetCustomAttributes().Take(10);
    foreach (var attr in attributes) {
        Console.WriteLine($"{attr.GetType().Name}");
    }
    
} catch (Exception ex) {
    Console.WriteLine($"Error: {ex.Message}");
}
`;

					fs.writeFileSync(tempProjectFile, projectContent);
					fs.writeFileSync(tempProgramFile, programContent);
					
					progress.report({ increment: 60 });
					
					// Run the console app
					const { stdout: runOutput, stderr: runError } = await execAsync(`dotnet run`, { 
						cwd: tempProjectDir,
						maxBuffer: 1024 * 1024 * 5 
					});
					
					progress.report({ increment: 100 });
					
					// Clean up temp files
					if (fs.existsSync(tempProjectDir)) {
						fs.rmSync(tempProjectDir, { recursive: true, force: true });
					}
					
				if (runOutput) {
					outputChannel.appendLine(runOutput);
					
					// Show assembly info in a webview
					await showAssemblyInfoWebview(context, assemblyPath, runOutput);
				}					if (runError) {
						outputChannel.appendLine(`Warnings: ${runError}`);
					}
					
				} catch (fallbackError: any) {
					// Final fallback - just show basic file info
					outputChannel.appendLine(`Advanced analysis failed: ${fallbackError.message}`);
					outputChannel.appendLine('Showing basic file information...');
					
					const stats = fs.statSync(assemblyPath);
					const basicInfo = `
Assembly Information for: ${path.basename(assemblyPath)}
${'='.repeat(60)}

=== FILE INFORMATION ===
Path: ${assemblyPath}
Size: ${stats.size.toLocaleString()} bytes
Created: ${stats.birthtime}
Modified: ${stats.mtime}

=== ANALYSIS ===
Could not load assembly for detailed analysis.
This might be due to:
- Missing dependencies
- Different target framework
- Assembly is obfuscated or protected

Try installing dotnet-script for better analysis:
    dotnet tool install -g dotnet-script
`;
					
					await showAssemblyInfoWebview(context, assemblyPath, basicInfo);
				}
			}
		});

		vscode.window.showInformationMessage('Assembly analysis completed!');

	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		outputChannel.appendLine(`Error: ${errorMessage}`);
		vscode.window.showErrorMessage(`Failed to analyze assembly: ${errorMessage}`);
	}
}

async function showAssemblyInfoWebview(context: vscode.ExtensionContext, assemblyPath: string, assemblyInfo: string) {
	if (assemblyPanel) {
		assemblyPanel.reveal(vscode.ViewColumn.One);
		// Update content
		assemblyPanel.webview.html = getAssemblyInfoHtml(assemblyPath, assemblyInfo);
	} else {
		assemblyPanel = vscode.window.createWebviewPanel(
			'dotnetAssemblyInfo',
			`Assembly Info - ${path.basename(assemblyPath)}`,
			vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		assemblyPanel.webview.html = getAssemblyInfoHtml(assemblyPath, assemblyInfo);

		// Handle messages from the webview
		assemblyPanel.webview.onDidReceiveMessage(
			async (message) => {
				switch (message.command) {
					case 'showInfo':
						vscode.window.showInformationMessage(message.text);
						break;
					case 'refresh':
						// Re-analyze the assembly
						await viewAssemblyInformation(context, vscode.Uri.file(message.path));
						break;
				}
			},
			undefined,
			context.subscriptions
		);

		assemblyPanel.onDidDispose(
			() => {
				assemblyPanel = undefined;
			},
			undefined,
			context.subscriptions
		);
	}
}

function getAssemblyInfoHtml(assemblyPath: string, assemblyInfo: string): string {
	const fileName = path.basename(assemblyPath);
	const formattedInfo = assemblyInfo.replace(/\n/g, '<br>').replace(/  /g, '&nbsp;&nbsp;');
	
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

export function deactivate() {
	if (outputChannel) {
		outputChannel.dispose();
	}
	if (coveragePanel) {
		coveragePanel.dispose();
	}
	if (assemblyPanel) {
		assemblyPanel.dispose();
	}
}
