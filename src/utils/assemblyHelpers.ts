import * as fs from "fs";
import * as path from "path";

/**
 * Cleans up temporary file if it exists
 */
export function cleanupTempFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Cleans up temporary directory if it exists
 */
export function cleanupTempDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Generates C# reflection script for analyzing .NET assemblies using dotnet-script
 */
export function getReflectionScript(assemblyPath: string): string {
  const escapedPath = assemblyPath.replace(/\\/g, "\\\\");
  return `
using System;
using System.IO;
using System.Reflection;
using System.Linq;

try {
	var assembly = Assembly.LoadFrom(@"${escapedPath}");
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
}

/**
 * Returns .csproj template for temporary console project
 */
export function getProjectContent(): string {
  return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>`;
}

/**
 * Generates C# Program.cs content for fallback assembly analysis
 */
export function getProgramContent(assemblyPath: string): string {
  const escapedPath = assemblyPath.replace(/\\/g, "\\\\");
  return `
using System;
using System.IO;
using System.Reflection;
using System.Linq;

try {
    var assemblyPath = @"${escapedPath}";
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
}

/**
 * Returns basic file information message when assembly analysis fails
 */
export function getBasicFileInfoMessage(assemblyPath: string): string {
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
