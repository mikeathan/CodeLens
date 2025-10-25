import { CacheEntry } from "./types";

/**
 * Manages caching of npm package information
 */
export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly cacheTTL: number;

  /**
   * @param cacheTTL Time-to-live for cache entries in milliseconds (default: 10 minutes)
   */
  constructor(cacheTTL: number = 1000 * 60 * 10) {
    this.cacheTTL = cacheTTL;
  }

  /**
   * Get cached data for a package
   * @param key Package name
   * @returns Cached entry or undefined if not found or expired
   */
  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    if (this.isCacheValid(entry)) {
      return entry.data;
    }

    // Remove expired entry
    this.cache.delete(key);
    return undefined;
  }

  /**
   * Store data in cache
   * @param key Package name
   * @param data Package information
   */
  set(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Check if cache entry is still valid
   * @param entry Cache entry to validate
   * @returns true if entry is still valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp < this.cacheTTL;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries
   */
  size(): number {
    return this.cache.size;
  }
}