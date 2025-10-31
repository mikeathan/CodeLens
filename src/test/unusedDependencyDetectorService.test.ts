import * as assert from 'assert';
import { UnusedDependencyDetectorService, Dependency } from '../services/dependency';

const mockOutputChannel = { appendLine: () => {}, show: () => {} } as any;

suite('UnusedDependencyDetectorService', () => {
    let service: UnusedDependencyDetectorService;

    setup(() => {
        service = new UnusedDependencyDetectorService(mockOutputChannel);
    });

    test('should detect unused dependencies correctly', () => {
        const dependencies: Dependency[] = [
            { name: 'dep1', version: '1.0.0', type: 'dependency' },
            { name: 'dep2', version: '1.0.0', type: 'dependency' },
            { name: 'dep3', version: '1.0.0', type: 'dependency' }
        ];
        const usedDependencies = new Set(['dep1']);
        const result = service.identifyUnusedDependencies(dependencies, usedDependencies);
        assert.deepStrictEqual(result.map(d => d.name), ['dep2', 'dep3']);
    });

    test('should return an empty array if all dependencies are used', () => {
        const dependencies: Dependency[] = [
            { name: 'dep1', version: '1.0.0', type: 'dependency' },
            { name: 'dep2', version: '1.0.0', type: 'dependency' }
        ];
        const usedDependencies = new Set(['dep1', 'dep2']);
        const result = service.identifyUnusedDependencies(dependencies, usedDependencies);
        assert.deepStrictEqual(result, []);
    });

    test('should handle no dependencies', () => {
        const dependencies: Dependency[] = [];
        const usedDependencies = new Set<string>();
        const result = service.identifyUnusedDependencies(dependencies, usedDependencies);
        assert.deepStrictEqual(result, []);
    });
});
