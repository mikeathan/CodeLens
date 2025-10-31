import * as fs from "fs";
import * as path from "path";
import { Dependency } from "./types";

/**
 * Parses package.json files
 * Single Responsibility: Package.json parsing
 */
export class PackageJsonParser {
  parseDependencies(packageJsonPath: string): Dependency[] {
    const dependencies: Dependency[] = [];

    try {
      const content = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = JSON.parse(content);

      // Parse regular dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({ name, version: version as string, type: "dependency" });
        }
      }

      // Parse dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({ name, version: version as string, type: "devDependency" });
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse package.json: ${errorMessage}`);
    }

    return dependencies;
  }

  exists(packageJsonPath: string): boolean {
    return fs.existsSync(packageJsonPath) && fs.statSync(packageJsonPath).isFile();
  }

  getPackageJsonPath(workspacePath: string): string {
    return path.join(workspacePath, "package.json");
  }
}
