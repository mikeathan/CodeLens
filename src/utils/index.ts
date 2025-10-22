import * as path from "path";
import * as fs from "fs";

/**
 * Finds all test projects in the given workspace directory
 */
export async function findTestProjects(
  workspacePath: string
): Promise<string[]> {
  const projects: string[] = [];

  function search(directory: string) {
    if (!fs.existsSync(directory)) {
      return;
    }

    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === "node_modules" ||
        entry.name === "bin" ||
        entry.name === "obj"
      ) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        search(fullPath);
      } else if (
        entry.name.endsWith(".csproj") ||
        entry.name.endsWith(".fsproj")
      ) {
        const content = fs.readFileSync(fullPath, "utf8");
        if (
          content.includes("Microsoft.NET.Test.Sdk") ||
          content.includes("xunit") ||
          content.includes("NUnit") ||
          content.includes("MSTest")
        ) {
          projects.push(fullPath);
        }
      }
    }
  }

  search(workspacePath);
  return projects;
}

/**
 * Finds all coverage files in the given directory
 */
export function findCoverageFiles(dir: string): string[] {
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
      } else if (
        entry.name === "coverage.cobertura.xml" ||
        entry.name.endsWith(".cobertura.xml")
      ) {
        files.push(fullPath);
      }
    }
  }

  search(dir);
  return files;
}

/**
 * Creates a directory if it doesn't exist
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Safely removes a file or directory
 */
export function safeRemove(targetPath: string): void {
  try {
    if (fs.existsSync(targetPath)) {
      const stats = fs.statSync(targetPath);
      if (stats.isDirectory()) {
        fs.rmSync(targetPath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(targetPath);
      }
    }
  } catch (error) {
    // Ignore errors when cleaning up temporary files
    console.log(`Warning: Could not remove ${targetPath}:`, error);
  }
}

/**
 * Formats file size to human readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) {
    return "0 Bytes";
  }
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Formats date to readable string
 */
export function formatDate(date: Date): string {
  return date.toLocaleString();
}

/**
 * Checks if a file has a specific extension
 */
export function hasExtension(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return extensions.some((e) => ext === e.toLowerCase());
}

/**
 * Gets the relative path from workspace root
 */
export function getRelativePath(
  absolutePath: string,
  workspacePath: string
): string {
  return path.relative(workspacePath, absolutePath);
}

/**
 * Validates if a path is a .NET project file
 */
export function isDotNetProject(filePath: string): boolean {
  return hasExtension(filePath, [".csproj", ".fsproj", ".vbproj", ".sln"]);
}

/**
 * Validates if a path is a .NET assembly
 */
export function isDotNetAssembly(filePath: string): boolean {
  return hasExtension(filePath, [".dll", ".exe"]);
}
