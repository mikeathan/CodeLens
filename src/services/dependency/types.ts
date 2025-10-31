/**
 * Represents a dependency found in package.json
 */
export interface Dependency {
  name: string;
  version: string;
  type: "dependency" | "devDependency";
}

/**
 * Result of the unused dependency analysis
 */
export interface UnusedDependencyReport {
  unusedDependencies: Dependency[];
  totalDependencies: number;
  scannedFiles: number;
  projectPath: string;
}
