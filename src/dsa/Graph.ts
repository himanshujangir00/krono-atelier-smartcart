import { HashTable } from './HashTable.ts';

/**
 * Weighted Undirected Co-Purchase & Attribute Graph using Adjacency Lists.
 * Supports BFS multi-hop traversal for related product recommendations.
 */

export interface GraphEdge {
  targetId: string;
  weight: number;
  reasons: string[];
}

export interface RelatedNodeResult {
  productId: string;
  score: number;
  hopDistance: 1 | 2;
  reasons: string[];
}

export class ProductGraph {
  private adjacency: HashTable<GraphEdge[]>;

  constructor() {
    this.adjacency = new HashTable<GraphEdge[]>(32);
  }

  addVertex(productId: string): void {
    if (!this.adjacency.has(productId)) {
      this.adjacency.set(productId, []);
    }
  }

  removeVertex(productId: string): void {
    this.adjacency.delete(productId);
    for (const [id, edges] of this.adjacency.entries()) {
      this.adjacency.set(
        id,
        edges.filter((edge) => edge.targetId !== productId)
      );
    }
  }

  addOrStrengthenEdge(sourceId: string, targetId: string, weightDelta: number, reason: string): void {
    if (sourceId === targetId) return;
    this.addVertex(sourceId);
    this.addVertex(targetId);

    this.upsertDirectedEdge(sourceId, targetId, weightDelta, reason);
    this.upsertDirectedEdge(targetId, sourceId, weightDelta, reason);
  }

  private upsertDirectedEdge(from: string, to: string, weightDelta: number, reason: string): void {
    const edges = this.adjacency.get(from) ?? [];
    const existing = edges.find((e) => e.targetId === to);
    if (existing) {
      existing.weight += weightDelta;
      if (!existing.reasons.includes(reason)) {
        existing.reasons.push(reason);
      }
    } else {
      edges.push({
        targetId: to,
        weight: weightDelta,
        reasons: [reason],
      });
    }
    this.adjacency.set(from, edges);
  }

  getNeighbors(productId: string): GraphEdge[] {
    return this.adjacency.get(productId) ?? [];
  }

  /**
   * 2-hop Weighted Graph Traversal (BFS) to surface directly co-purchased
   * items first and second-degree related items with decayed score.
   */
  getRelated(productId: string, limit = 4): RelatedNodeResult[] {
    const directEdges = this.adjacency.get(productId) ?? [];
    const scoreMap = new HashTable<{ score: number; hopDistance: 1 | 2; reasons: string[] }>(32);

    // 1-hop neighbors
    for (const edge of directEdges) {
      scoreMap.set(edge.targetId, {
        score: edge.weight,
        hopDistance: 1,
        reasons: [...edge.reasons],
      });
    }

    // 2-hop neighbors via BFS expansion (decay factor 0.45)
    for (const edge of directEdges) {
      const secondHopEdges = this.adjacency.get(edge.targetId) ?? [];
      for (const second of secondHopEdges) {
        if (second.targetId === productId) continue;
        const decayedScore = Math.min(edge.weight, second.weight) * 0.45;
        const existing = scoreMap.get(second.targetId);
        if (!existing) {
          scoreMap.set(second.targetId, {
            score: Number(decayedScore.toFixed(2)),
            hopDistance: 2,
            reasons: ['2-hop studio pairing'],
          });
        } else if (existing.hopDistance === 2) {
          existing.score = Number((existing.score + decayedScore).toFixed(2));
        }
      }
    }

    const results: RelatedNodeResult[] = [];
    for (const [id, info] of scoreMap.entries()) {
      results.push({
        productId: id,
        score: Number(info.score.toFixed(2)),
        hopDistance: info.hopDistance,
        reasons: info.reasons,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getGraphStats(): { vertices: number; edges: number } {
    let directedCount = 0;
    for (const edges of this.adjacency.values()) {
      directedCount += edges.length;
    }
    return {
      vertices: this.adjacency.size(),
      edges: Math.floor(directedCount / 2),
    };
  }
}
