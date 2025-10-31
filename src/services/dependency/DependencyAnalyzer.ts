import { Dependency } from "./types";

/**
 * Analyzes dependencies to identify unused ones
 * Single Responsibility: Dependency comparison logic
 */
export class DependencyAnalyzer {
  identifyUnusedDependencies(
    allDependencies: Dependency[],
    usedDependencies: Set<string>
  ): Dependency[] {
    return allDependencies.filter((dep) => !usedDependencies.has(dep.name));
  }

  categorizeByType(dependencies: Dependency[]): {
    regular: Dependency[];
    dev: Dependency[];
  } {
    return {
      regular: dependencies.filter((d) => d.type === "dependency"),
      dev: dependencies.filter((d) => d.type === "devDependency"),
    };
  }
}
