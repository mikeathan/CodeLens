import * as https from "https";
import { PackageInfo } from "./types";
import { CacheManager } from "./CacheManager";

/**
 * Handles HTTP communication with the npm registry
 */
export class NpmRegistryClient {
  private static readonly REGISTRY_HOSTNAME = "registry.npmjs.org";
  private static readonly REQUEST_TIMEOUT = 10000; // 10 seconds
  private static readonly USER_AGENT = "VSCode-CodeLens-Extension";

  private cacheManager: CacheManager;

  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }

  /**
   * Fetch package information from npm registry
   * @param packageName Name of the npm package
   * @returns Package information or null if not found
   */
  async fetchPackageInfo(packageName: string): Promise<PackageInfo | null> {
    // Check cache first
    const cached = this.cacheManager.get(packageName);
    if (cached) {
      return cached;
    }

    // Fetch from registry
    const packageInfo = await this.performHttpRequest(packageName);
    
    // Cache the result if successful
    if (packageInfo) {
      this.cacheManager.set(packageName, packageInfo);
    }

    return packageInfo;
  }

  /**
   * Perform HTTP request to npm registry
   * @param packageName Package name to fetch
   * @returns Package information or null
   */
  private async performHttpRequest(packageName: string): Promise<PackageInfo | null> {
    return new Promise((resolve) => {
      const options = {
        hostname: NpmRegistryClient.REGISTRY_HOSTNAME,
        path: `/${encodeURIComponent(packageName)}`,
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent": NpmRegistryClient.USER_AGENT
        }
      };

      const req = https.request(options, (res) => {
        let data = "";

        res.on("data", (chunk) => {
          data += chunk;
        });

        res.on("end", () => {
          if (res.statusCode === 200) {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (error) {
              console.error(`Error parsing response for ${packageName}:`, error);
              resolve(null);
            }
          } else {
            console.error(`Failed to fetch ${packageName}: ${res.statusCode}`);
            resolve(null);
          }
        });
      });

      req.on("error", (error) => {
        console.error(`Request error for ${packageName}:`, error);
        resolve(null);
      });

      req.setTimeout(NpmRegistryClient.REQUEST_TIMEOUT, () => {
        req.destroy();
        console.error(`Request timeout for ${packageName}`);
        resolve(null);
      });

      req.end();
    });
  }
}