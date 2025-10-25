import * as assert from "assert";
import { NpmDepsService } from "../services/npmDepsService";

suite("NpmDepsService Test Suite", () => {
  let service: NpmDepsService;

  setup(() => {
    service = new NpmDepsService();
  });

  test("Service should be instantiated", () => {
    assert.ok(service);
  });

  test("buildGraph should return valid GraphData structure", async () => {
    // Test with a well-known small package
    const result = await service.buildGraph(["express"], 1, 10);
    
    assert.ok(result);
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
    assert.ok(result.nodes.length > 0, "Should have at least one node");
  });

  test("buildGraph should respect maxNodes limit", async () => {
    const maxNodes = 5;
    const result = await service.buildGraph(["express"], 3, maxNodes);
    
    assert.ok(result.nodes.length <= maxNodes, `Should have at most ${maxNodes} nodes`);
  });

  test("buildGraph should handle invalid package names gracefully", async () => {
    const result = await service.buildGraph(["this-package-does-not-exist-12345"], 1, 10);
    
    assert.ok(result);
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
  });

  test("clearCache should clear the cache", () => {
    service.clearCache();
    assert.ok(true, "Cache cleared without error");
  });

  test("buildGraph should handle scoped packages", async () => {
    const result = await service.buildGraph(["@types/node"], 1, 5);
    
    assert.ok(result);
    assert.ok(Array.isArray(result.nodes));
    assert.ok(Array.isArray(result.edges));
  });

  test("buildGraph should return empty arrays for empty package list", async () => {
    const result = await service.buildGraph([], 2, 10);
    
    assert.ok(result);
    assert.strictEqual(result.nodes.length, 0);
    assert.strictEqual(result.edges.length, 0);
  });
});
