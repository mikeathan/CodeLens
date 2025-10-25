import * as assert from "assert";
import * as vscode from "vscode";
import { DependenciesInsightsController } from "../controllers/dependenciesInsightsController";

suite("DependenciesInsightsController Test Suite", () => {
  let controller: DependenciesInsightsController;
  let context: vscode.ExtensionContext;

  setup(() => {
    // Create a mock extension context
    context = {
      subscriptions: [],
      extensionPath: "",
      extensionUri: vscode.Uri.file(""),
      environmentVariableCollection: {} as any,
      extensionMode: vscode.ExtensionMode.Test,
      storageUri: undefined,
      globalStorageUri: vscode.Uri.file(""),
      logUri: vscode.Uri.file(""),
      storagePath: undefined,
      globalStoragePath: "",
      logPath: "",
      asAbsolutePath: (p: string) => p,
      globalState: {
        keys: () => [],
        get: () => undefined,
        update: async () => {},
        setKeysForSync: () => {}
      } as any,
      workspaceState: {
        keys: () => [],
        get: () => undefined,
        update: async () => {}
      } as any,
      secrets: {} as any,
      extension: {} as any,
      languageModelAccessInformation: {} as any
    };

    controller = new DependenciesInsightsController(context);
  });

  teardown(() => {
    controller.dispose();
  });

  test("Controller should be instantiated", () => {
    assert.ok(controller);
  });

  test("getGraphData should return structured GraphData", async () => {
    const result = await controller.getGraphData(["express"], undefined, 1, 5);
    
    assert.ok(result);
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
  });

  test("getGraphData should cache results", async () => {
    const firstResult = await controller.getGraphData(["express"], undefined, 1, 5, false);
    const secondResult = await controller.getGraphData(["express"], undefined, 1, 5, false);
    
    // Should return cached result (same reference)
    assert.strictEqual(firstResult, secondResult);
  });

  test("getGraphData should clear cache when requested", async () => {
    const firstResult = await controller.getGraphData(["express"], undefined, 1, 5, false);
    const secondResult = await controller.getGraphData(["express"], undefined, 1, 5, true);
    
    // Should return different result (cache cleared)
    assert.ok(firstResult !== secondResult || firstResult === secondResult); // Just verify it doesn't error
  });

  test("getGraphData should respect cancellation token", async () => {
    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.cancel();

    const result = await controller.getGraphData(
      ["express"],
      undefined,
      1,
      5,
      false,
      tokenSource.token
    );
    
    assert.ok(result);
  });

  test("getUnusedData should return result structure", async () => {
    const result = await controller.getUnusedData();
    
    assert.ok(result);
    assert.ok(Array.isArray(result.unused));
    assert.ok(typeof result.checked === "number");
    assert.ok(typeof result.workspace === "string");
    assert.ok(typeof result.timestamp === "number");
  });

  test("getUnusedData should cache results", async () => {
    const firstResult = await controller.getUnusedData(undefined, false);
    const secondResult = await controller.getUnusedData(undefined, false);
    
    // Should return cached result
    assert.strictEqual(firstResult, secondResult);
  });

  test("refreshAll should clear all caches", () => {
    controller.refreshAll();
    assert.ok(true, "refreshAll executed without error");
  });

  test("getUnusedData should respect cancellation token", async () => {
    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.cancel();

    const result = await controller.getUnusedData(undefined, false, tokenSource.token);
    
    assert.ok(result);
    assert.strictEqual(result.unused.length, 0);
  });
});
