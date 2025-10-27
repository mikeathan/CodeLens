// Comprehensive unit tests for UnusedDependencyDetectorService

import { UnusedDependencyDetectorService } from '../path/to/UnusedDependencyDetectorService';

describe('UnusedDependencyDetectorService', () => {
    let service: UnusedDependencyDetectorService;

    beforeEach(() => {
        service = new UnusedDependencyDetectorService();
    });

    it('should detect unused dependencies correctly', () => {
        const dependencies = ['dep1', 'dep2', 'dep3'];
        const usedDependencies = ['dep1'];
        const result = service.detectUnusedDependencies(dependencies, usedDependencies);
        expect(result).toEqual(['dep2', 'dep3']);
    });

    it('should return an empty array if all dependencies are used', () => {
        const dependencies = ['dep1', 'dep2'];
        const usedDependencies = ['dep1', 'dep2'];
        const result = service.detectUnusedDependencies(dependencies, usedDependencies);
        expect(result).toEqual([]);
    });

    it('should handle no dependencies', () => {
        const dependencies: string[] = [];
        const usedDependencies: string[] = [];
        const result = service.detectUnusedDependencies(dependencies, usedDependencies);
        expect(result).toEqual([]);
    });
});
