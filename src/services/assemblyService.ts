import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export class AssemblyService {
  constructor(private outputChannel: vscode.OutputChannel) {}

  async analyzeAssembly(
    context: vscode.ExtensionContext,
    targetUri?: vscode.Uri
  ): Promise<void> {
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
          ".NET Assemblies": ["dll", "exe"],
        },
        title: "Select .NET Assembly",
      });

      if (fileUri && fileUri[0]) {
        assemblyPath = fileUri[0].fsPath;
      } else {
        return;
      }
    }

    if (
      !assemblyPath ||
      (!assemblyPath.endsWith(".dll") && !assemblyPath.endsWith(".exe"))
    ) {
      vscode.window.showErrorMessage(
        "Please select a valid .NET assembly (.dll or .exe file)."
      );
      return;
    }

    // Check if dotnet is installed
    try {
      await execAsync("dotnet --version");
    } catch (error) {
      vscode.window.showErrorMessage(
        ".NET CLI is not installed or not in PATH."
      );
      return;
    }

    this.outputChannel.show();
    this.outputChannel.appendLine(`Analyzing assembly: ${assemblyPath}`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Analyzing assembly...",
          cancellable: false,
        },
        async (
          progress: vscode.Progress<{ increment?: number; message?: string }>
        ) => {
          progress.report({ increment: 0 });

          const assemblyInfo = await this.getAssemblyInfo(
            assemblyPath,
            progress
          );

          if (assemblyInfo) {
            this.outputChannel.appendLine(assemblyInfo);

            // Trigger webview creation through command
            vscode.commands.executeCommand(
              "codelens.showAssemblyInfo",
              assemblyPath,
              assemblyInfo
            );
          }
        }
      );

      vscode.window.showInformationMessage("Assembly analysis completed!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(
        `Failed to analyze assembly: ${errorMessage}`
      );
    }
  }

  private async getAssemblyInfo(
    assemblyPath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<string | null> {
    // Use reflection to get assembly information
    const reflectionScript = `
using System;
using System.IO;
using System.Reflection;
using System.Linq;

try {
	var assembly = Assembly.LoadFrom(@"${assemblyPath.replace(/\\/g, "\\\\")}");
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
    const tempDir = workspaceFolder
      ? workspaceFolder.uri.fsPath
      : path.dirname(assemblyPath);
    const tempFile = path.join(tempDir, "temp_assembly_info.cs");

    try {
      fs.writeFileSync(tempFile, reflectionScript);

      progress.report({ increment: 30 });

      // Run the reflection script
      const { stdout, stderr } = await execAsync(
        `dotnet script "${tempFile}"`,
        {
          cwd: tempDir,
          maxBuffer: 1024 * 1024 * 5,
        }
      );

      progress.report({ increment: 100 });

      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }

      if (stderr) {
        this.outputChannel.appendLine(`Warnings: ${stderr}`);
      }

      return stdout || null;
    } catch (scriptError: any) {
      // Fallback: Create a temporary console app to analyze the assembly
      this.outputChannel.appendLine(
        "dotnet-script not available, using alternative analysis method..."
      );

      try {
        return await this.getAssemblyInfoFallback(
          assemblyPath,
          tempDir,
          progress
        );
      } catch (fallbackError: any) {
        // Final fallback - just show basic file info
        this.outputChannel.appendLine(
          `Advanced analysis failed: ${fallbackError.message}`
        );
        this.outputChannel.appendLine("Showing basic file information...");

        return this.getBasicFileInfo(assemblyPath);
      }
    }
  }

  private async getAssemblyInfoFallback(
    assemblyPath: string,
    tempDir: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<string> {
    // Create a temporary console project
    const tempProjectDir = path.join(tempDir, "temp_assembly_analyzer");
    const tempProjectFile = path.join(
      tempProjectDir,
      "temp_assembly_analyzer.csproj"
    );
    const tempProgramFile = path.join(tempProjectDir, "Program.cs");

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
    var assemblyPath = @"${assemblyPath.replace(/\\/g, "\\\\")}";
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
    const { stdout: runOutput, stderr: runError } = await execAsync(
      `dotnet run`,
      {
        cwd: tempProjectDir,
        maxBuffer: 1024 * 1024 * 5,
      }
    );

    progress.report({ increment: 100 });

    // Clean up temp files
    if (fs.existsSync(tempProjectDir)) {
      fs.rmSync(tempProjectDir, { recursive: true, force: true });
    }

    if (runError) {
      this.outputChannel.appendLine(`Warnings: ${runError}`);
    }

    return runOutput || "";
  }

  private getBasicFileInfo(assemblyPath: string): string {
    const stats = fs.statSync(assemblyPath);
    return `
Assembly Information for: ${path.basename(assemblyPath)}
${"=".repeat(60)}

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
  }
}
