/**
 * Extracts import statements from source code
 * Single Responsibility: Import detection and parsing
 */
export class ImportExtractor {
  private readonly IMPORT_PATTERNS = [
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+['"]([^'"]+)['"]/g,
  ];

  extractImports(content: string): string[] {
    const imports: string[] = [];

    for (const pattern of this.IMPORT_PATTERNS) {
      let match;
      // Reset regex state
      pattern.lastIndex = 0;
      
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  extractPackageName(importPath: string): string | null {
    // Skip relative imports
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      return null;
    }

    // Handle scoped packages (@scope/package)
    if (importPath.startsWith("@")) {
      const parts = importPath.split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    }

    // Handle regular packages
    return importPath.split("/")[0];
  }

  extractAllPackageNames(content: string): Set<string> {
    const packageNames = new Set<string>();
    const imports = this.extractImports(content);

    imports.forEach((imp) => {
      const packageName = this.extractPackageName(imp);
      if (packageName) {
        packageNames.add(packageName);
      }
    });

    return packageNames;
  }
}
