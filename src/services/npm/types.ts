import * as vscode from "vscode";

export interface GraphNode {
  id: string;
  label: string;
  version: string;
  level: number;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CacheEntry {
  data: any;
  timestamp: number;
}

export interface PackageInfo {
  name: string;
  "dist-tags"?: {
    latest?: string;
  };
  versions?: {
    [version: string]: {
      dependencies?: {
        [name: string]: string;
      };
    };
  };
}

export interface TraversalContext {
  currentDepth: number;
  maxDepth: number;
  maxNodes: number;
  cancellationToken?: vscode.CancellationToken;
}