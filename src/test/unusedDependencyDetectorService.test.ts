import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { UnusedDependencyDetectorService } from "../services/unusedDependencyDetectorService";

suite("UnusedDependencyDetectorService Test Suite", () => {
  let service: UnusedDependencyDetectorService;
  let testWorkspaceFolder: vscode.WorkspaceFolder;
  let tempDir: string;

  setup(async () => {
    service = new UnusedDependencyDetectorService();
    
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "codelens-test-"));
    
    testWorkspaceFolder = {
      uri: vscode.Uri.file(tempDir),
      name: "test-workspace",
      index: 0
    };
  });

  teardown(() => {
    // Clean up temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("Service should be instantiated", () => {
    assert.ok(service);
  });

  test("detectUnusedDependencies should handle missing package.json", async () => {
    const result = await service.detectUnusedDependencies(testWorkspaceFolder);
    
    assert.ok(result);
    assert.strictEqual(result.unused.length, 0);
    assert.strictEqual(result.checked, 0);
  });

  test("detectUnusedDependencies should detect unused dependencies", async () => {
    // Create a package.json with dependencies
    const packageJson = {
      name: "test-package",
      dependencies: {
        "express": "^4.18.0",
        "lodash": "^4.17.21"
      },
      devDependencies: {
        "jest": "^29.0.0"
      }
    };
    
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );

    // Create a file that uses express but not lodash or jest
    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir);
    fs.writeFileSync(
      path.join(srcDir, "index.js"),
      'const express = require("express");\nconst app = express();'
    );

    const result = await service.detectUnusedDependencies(testWorkspaceFolder);
    
    assert.ok(result);
    assert.strictEqual(result.checked, 3, "Should check 3 dependencies");
    assert.ok(result.unused.length >= 1, "Should find at least one unused dependency");
    
    // lodash should be unused
    const unusedLodash = result.unused.find(d => d.name === "lodash");
    assert.ok(unusedLodash, "lodash should be detected as unused");
    assert.strictEqual(unusedLodash?.type, "dependencies");
  });

  test("detectUnusedDependencies should respect cancellation", async () => {
    const packageJson = {
      name: "test-package",
      dependencies: {
        "express": "^4.18.0"
      }
    };
    
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );

    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.cancel();

    const result = await service.detectUnusedDependencies(testWorkspaceFolder, tokenSource.token);
    
    assert.ok(result);
    // When cancelled, should return early
    assert.strictEqual(result.unused.length, 0);
  });

  test("detectUnusedDependencies should handle scoped packages", async () => {
    const packageJson = {
      name: "test-package",
      dependencies: {
        "@types/node": "^20.0.0"
      }
    };
    
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );

    const result = await service.detectUnusedDependencies(testWorkspaceFolder);
    
    assert.ok(result);
    assert.strictEqual(result.checked, 1);
    // @types/node should be unused since we have no files using it
    assert.strictEqual(result.unused.length, 1);
    assert.strictEqual(result.unused[0].name, "@types/node");
  });

  test("detectUnusedDependencies should detect imports in various formats", async () => {
    const packageJson = {
      name: "test-package",
      dependencies: {
        "express": "^4.18.0",
        "lodash": "^4.17.21",
        "axios": "^1.0.0",
        "moment": "^2.29.0"
      }
    };
    
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify(packageJson, null, 2)
    );

    const srcDir = path.join(tempDir, "src");
    fs.mkdirSync(srcDir);
    
    // File with different import styles
    fs.writeFileSync(
      path.join(srcDir, "index.js"),
      `
      const express = require("express");
      import lodash from 'lodash';
      import { get } from "axios";
      `
    );

    const result = await service.detectUnusedDependencies(testWorkspaceFolder);
    
    assert.ok(result);
    assert.strictEqual(result.checked, 4);
    
    // moment should be unused
    const unusedMoment = result.unused.find(d => d.name === "moment");
    assert.ok(unusedMoment, "moment should be detected as unused");
    
    // express, lodash, and axios should be used
    const unusedExpress = result.unused.find(d => d.name === "express");
    assert.strictEqual(unusedExpress, undefined, "express should not be in unused list");
  });
});
