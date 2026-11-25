import type { SortAlgo, SortOption } from '../server/engine.ts';
import type {
  BrowsingHistoryItem,
  CategoryInfo,
  GraphRecommendation,
  Order,
  PersonalizedRecommendation,
  Product,
  SalesReport,
  SearchTelemetry,
} from '../types.ts';
import { ProductGraph } from './Graph.ts';
import { HashTable, InvertedIndex } from './HashTable.ts';
import { extractTopK } from './Heap.ts';
import { binarySearchPriceRange, searchProductsWithIndex } from './Searching.ts';
import { CustomSet } from './Sets.ts';
import { mergeSort, quickSort } from './Sorting.ts';

/**
 * Client-side DSA Engine executing directly over live Cloud Firestore data.
 * Unifies:
 * 1. JavaScript Map + custom HashTable + InvertedIndex (O(1) lookup & keyword indexing)
 * 2. Binary Max-Heap (Top-K highest-rated, popular, and best-selling products)
 * 3. Weighted Undirected Co-Purchase & Attribute Graph (2-hop BFS recommendations)
 * 4. Merge Sort & Randomized Quick Sort (catalog and sales ledger ordering)
 * 5. Binary Search on price-sorted catalog + Fuzzy/Prefix Search
 * 6. JavaScript Set + CustomSet (unique categories, unique product sets, Jaccard similarity)
 */

export interface ClientCatalogQuery {
  q?: string;
  category?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortOption;
  sortAlgo?: SortAlgo;
}

export class ClientDSAEngine {
  public productMap: Map<string, Product>;
  public productTable: HashTable<Product>;
  public invertedIndex: InvertedIndex;
  public coPurchaseGraph: ProductGraph;
  public uniqueCategories: Set<string>;
  public uniqueProductIds: Set<string>;

  constructor(products: Product[] = [], orders: Order[] = []) {
    this.productMap = new Map<string, Product>();
    this.productTable = new HashTable<Product>(Math.max(32, products.length * 2));
    this.invertedIndex = new InvertedIndex();
    this.coPurchaseGraph = new ProductGraph();
    this.uniqueCategories = new Set<string>();
    this.uniqueProductIds = new Set<string>();
    this.rebuild(products, orders);
  }

  rebuild(products: Product[], orders: Order[]): void {
    this.productMap = new Map<string, Product>();
    this.productTable = new HashTable<Product>(Math.max(32, products.length * 2));
    this.invertedIndex = new InvertedIndex();
    this.coPurchaseGraph = new ProductGraph();
    this.uniqueCategories = new Set<string>();
    this.uniqueProductIds = new Set<string>();

    for (const product of products) {
      this.productMap.set(product.id, product);
      this.productTable.set(product.id, product);
      this.uniqueProductIds.add(product.id);
      this.uniqueCategories.add(product.category);
      this.coPurchaseGraph.addVertex(product.id);

      const tokens = [
        product.sku,
        ...product.name.split(/\s+/),
        ...product.category.split(/\s+/),
        ...product.tags,
        ...product.material.split(/\s+/),
      ];
      this.invertedIndex.addDocument(product.id, tokens);
    }

    // Attribute & category similarity edges
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const a = products[i];
        const b = products[j];
        const setA = new CustomSet<string>(a.tags);
        const setB = new CustomSet<string>(b.tags);
        const sharedTags = setA.intersection(setB).size();
        if (a.category === b.category || sharedTags >= 2) {
          const weight = (a.category === b.category ? 1.5 : 0) + sharedTags * 0.6;
          const reason =
            a.category === b.category
              ? `Same collection (${a.category})`
              : `${sharedTags} shared attributes`;
          this.coPurchaseGraph.addOrStrengthenEdge(a.id, b.id, Number(weight.toFixed(2)), reason);
        }
      }
    }

    // Co-purchase edges from real Firestore orders
    for (const order of orders) {
      const uniqueIds = Array.from(new Set(order.items.map((item) => item.productId)));
      for (let i = 0; i < uniqueIds.length; i++) {
        for (let j = i + 1; j < uniqueIds.length; j++) {
          this.coPurchaseGraph.addOrStrengthenEdge(
            uniqueIds[i],
            uniqueIds[j],
            3.0,
            'Frequently bought together'
          );
        }
      }
    }
  }

  getProductById(id: string): Product | undefined {
    return this.productMap.get(id) ?? this.productTable.get(id);
  }

  getAllTags(): string[] {
    const tagSet = new Set<string>();
    for (const product of this.productMap.values()) {
      for (const tag of product.tags) {
        tagSet.add(tag.toLowerCase());
      }
    }
    return Array.from(tagSet).sort();
  }

  getTopRated(k = 4): Product[] {
    const all = Array.from(this.productMap.values());
    return extractTopK(all, k, (a, b) => {
      if (a.rating !== b.rating) return a.rating - b.rating;
      return a.reviewCount - b.reviewCount;
    });
  }

  getMostPopular(k = 4): Product[] {
    const all = Array.from(this.productMap.values());
    return extractTopK(all, k, (a, b) => {
      const popA = a.salesCount * 2 + a.rating * 10;
      const popB = b.salesCount * 2 + b.rating * 10;
      return popA - popB;
    });
  }

  queryCatalog(query: ClientCatalogQuery): { items: Product[]; telemetry: SearchTelemetry } {
    const start = performance.now();
    const allProducts = Array.from(this.productMap.values());

    let working: Product[];
    let searchAlgorithm = 'HashMap Scan (Map + HashTable)';

    if (query.q && query.q.trim().length > 0) {
      working = searchProductsWithIndex(query.q, this.productTable, this.invertedIndex);
      searchAlgorithm = 'HashMap Inverted Index + Levenshtein';
    } else {
      working = allProducts;
    }

    let filterAlgorithm = 'Direct Predicate';
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = query.minPrice ?? 0;
      const max = query.maxPrice ?? Number.MAX_SAFE_INTEGER;
      const priceMatches = binarySearchPriceRange(working, min, max);
      const allowedSet = new Set(priceMatches.map((p) => p.id));
      working = working.filter((p) => allowedSet.has(p.id));
      filterAlgorithm = 'Binary Search Price Range';
    }

    if (query.category && query.category !== 'All') {
      working = working.filter((p) => p.category.toLowerCase() === query.category!.toLowerCase());
    }

    if (query.tags && query.tags.length > 0) {
      const requiredTags = new CustomSet<string>(query.tags);
      working = working.filter((p) => {
        const prodTags = new CustomSet<string>(p.tags);
        return prodTags.intersection(requiredTags).size() > 0;
      });
      filterAlgorithm =
        filterAlgorithm === 'Binary Search Price Range'
          ? 'Binary Search + Set Intersection'
          : 'Set Tag Intersection';
    }

    const sortBy = query.sortBy ?? 'popular';
    const sortAlgo = query.sortAlgo ?? 'merge';

    const comparator = (a: Product, b: Product): number => {
      switch (sortBy) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'rating':
          return b.rating - a.rating || b.reviewCount - a.reviewCount;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'popular':
        default:
          return b.salesCount - a.salesCount || b.rating - a.rating;
      }
    };

    const sorted =
      sortAlgo === 'quick' ? quickSort(working, comparator) : mergeSort(working, comparator);

    const end = performance.now();
    return {
      items: sorted,
      telemetry: {
        searchAlgorithm,
        filterAlgorithm,
        sortAlgorithm: sortAlgo === 'quick' ? 'Randomized Quick Sort' : 'Merge Sort (O(N log N))',
        executionMs: Number(Math.max(0.05, end - start).toFixed(2)),
        candidatesEvaluated: allProducts.length,
        matchedCount: sorted.length,
      },
    };
  }

  getRelatedProducts(productId: string, limit = 4): GraphRecommendation[] {
    const relatedNodes = this.coPurchaseGraph.getRelated(productId, limit);
    const results: GraphRecommendation[] = [];
    for (const node of relatedNodes) {
      const product = this.productMap.get(node.productId);
      if (product) {
        results.push({
          product,
          score: node.score,
          hopDistance: node.hopDistance,
          reasons: node.reasons,
        });
      }
    }
    return results;
  }

  /**
   * Personalized Recommendations combining:
   * - Explicit preference Set
   * - Purchased product categories & tags Set
   * - Browsing history categories & viewed product tags Set
   * - Graph co-purchase neighbor boost
   */
  getPersonalizedRecommendations(
    userPreferences: string[],
    purchasedIds: string[],
    browsingHistory: BrowsingHistoryItem[],
    wishlistIds: string[],
    limit = 4
  ): PersonalizedRecommendation[] {
    const allProducts = Array.from(this.productMap.values());
    if (allProducts.length === 0) return [];

    const purchasedSet = new CustomSet<string>(purchasedIds);
    let interestSet = new CustomSet<string>(userPreferences);
    const preferredCategorySet = new Set<string>();

    // Absorb purchased product tags & categories
    for (const pid of purchasedIds) {
      const prod = this.productMap.get(pid);
      if (prod) {
        preferredCategorySet.add(prod.category.toLowerCase());
        interestSet = interestSet.union(
          new CustomSet<string>([...prod.tags, prod.category.toLowerCase()])
        );
      }
    }

    // Absorb browsing history tags & categories
    for (const entry of browsingHistory) {
      preferredCategorySet.add(entry.category.toLowerCase());
      const prod = this.productMap.get(entry.productId);
      if (prod) {
        interestSet = interestSet.union(
          new CustomSet<string>([...prod.tags, prod.category.toLowerCase()])
        );
      }
    }

    // Absorb wishlist items
    for (const wid of wishlistIds) {
      const prod = this.productMap.get(wid);
      if (prod) {
        preferredCategorySet.add(prod.category.toLowerCase());
        interestSet = interestSet.union(
          new CustomSet<string>([...prod.tags, prod.category.toLowerCase()])
        );
      }
    }

    // Cold-start fallback using Max-Heap Popularity
    if (interestSet.size() === 0) {
      return this.getMostPopular(limit).map((product) => ({
        product,
        similarityScore: Number((product.rating / 5).toFixed(2)),
        matchedTags: product.tags.slice(0, 2),
        reason: 'Popular across studio orders',
      }));
    }

    // Graph-connected neighbors of purchased/viewed products
    const graphBoostMap = new Map<string, number>();
    for (const seedId of [...purchasedIds, ...browsingHistory.map((b) => b.productId)]) {
      for (const edge of this.coPurchaseGraph.getNeighbors(seedId)) {
        graphBoostMap.set(
          edge.targetId,
          Math.max(graphBoostMap.get(edge.targetId) ?? 0, edge.weight)
        );
      }
    }

    const candidateIds = new CustomSet<string>(allProducts.map((p) => p.id)).difference(purchasedSet);
    const scored: PersonalizedRecommendation[] = [];

    for (const pid of candidateIds.toArray()) {
      const product = this.productMap.get(pid);
      if (!product) continue;

      const productSet = new CustomSet<string>([
        ...product.tags,
        product.category.toLowerCase(),
      ]);
      const matched = interestSet.intersection(productSet).toArray();
      const jaccard = interestSet.jaccardSimilarity(productSet);
      const categoryMatchBoost = preferredCategorySet.has(product.category.toLowerCase()) ? 0.1 : 0;
      const graphBoost = Math.min(0.18, (graphBoostMap.get(product.id) ?? 0) * 0.03);
      const popularityBoost = Math.min(0.12, product.salesCount / 500);

      const combinedScore = Number(
        Math.min(0.99, jaccard * 0.68 + categoryMatchBoost + graphBoost + popularityBoost).toFixed(3)
      );

      let reason = 'Complements your studio profile';
      if (matched.length > 0) {
        reason = `Matches ${matched.slice(0, 3).join(', ')}`;
      } else if (graphBoost > 0) {
        reason = 'Co-purchased with your viewed objects';
      }

      scored.push({
        product,
        similarityScore: combinedScore,
        matchedTags: matched,
        reason,
      });
    }

    const ranked = mergeSort(scored, (a, b) => b.similarityScore - a.similarityScore);
    return ranked.slice(0, limit);
  }

  generateSalesReport(orders: Order[], categories: CategoryInfo[]): SalesReport {
    let totalRevenue = 0;
    let totalUnitsSold = 0;

    const categoryStats = new Map<
      string,
      { category: string; revenue: number; unitsSold: number; orderIds: Set<string> }
    >();

    for (const cat of categories) {
      categoryStats.set(cat.name, {
        category: cat.name,
        revenue: 0,
        unitsSold: 0,
        orderIds: new Set<string>(),
      });
    }

    const productSales = new Map<
      string,
      {
        productId: string;
        sku: string;
        name: string;
        category: string;
        unitsSold: number;
        revenue: number;
        rating: number;
      }
    >();

    const dailyMap = new Map<string, { date: string; revenue: number; orders: number }>();

    for (const order of orders) {
      totalRevenue += order.total;
      const dateKey = order.createdAt.slice(0, 10);
      const dayEntry = dailyMap.get(dateKey) ?? { date: dateKey, revenue: 0, orders: 0 };
      dayEntry.revenue += order.total;
      dayEntry.orders += 1;
      dailyMap.set(dateKey, dayEntry);

      for (const item of order.items) {
        totalUnitsSold += item.quantity;
        const itemRev = item.price * item.quantity;

        const catEntry = categoryStats.get(item.category) ?? {
          category: item.category,
          revenue: 0,
          unitsSold: 0,
          orderIds: new Set<string>(),
        };
        catEntry.revenue += itemRev;
        catEntry.unitsSold += item.quantity;
        catEntry.orderIds.add(order.id);
        categoryStats.set(item.category, catEntry);

        const liveProd = this.productMap.get(item.productId);
        const prodEntry = productSales.get(item.productId) ?? {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          category: item.category,
          unitsSold: 0,
          revenue: 0,
          rating: liveProd?.rating ?? 4.7,
        };
        prodEntry.unitsSold += item.quantity;
        prodEntry.revenue += itemRev;
        productSales.set(item.productId, prodEntry);
      }
    }

    // Binary Max-Heap for Top-Selling Products
    const topSellingProducts = extractTopK(
      Array.from(productSales.values()),
      6,
      (a, b) => a.revenue - b.revenue || a.unitsSold - b.unitsSold
    );

    const categoryBreakdown = mergeSort(
      Array.from(categoryStats.values())
        .filter((c) => c.unitsSold > 0 || categories.some((cat) => cat.name === c.category))
        .map((c) => ({
          category: c.category,
          revenue: Number(c.revenue.toFixed(2)),
          unitsSold: c.unitsSold,
          orderCount: c.orderIds.size,
          sharePercent: totalRevenue > 0 ? Number(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0,
        })),
      (a, b) => b.revenue - a.revenue
    );

    const dailyRevenue = mergeSort(Array.from(dailyMap.values()), (a, b) =>
      a.date.localeCompare(b.date)
    );
    const recentOrders = mergeSort(orders, (a, b) => b.createdAt.localeCompare(a.createdAt));

    return {
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalOrders: orders.length,
      totalUnitsSold,
      averageOrderValue: orders.length > 0 ? Number((totalRevenue / orders.length).toFixed(2)) : 0,
      topSellingProducts,
      categoryBreakdown,
      dailyRevenue,
      recentOrders,
    };
  }

  getDiagnostics(): {
    hashTable: { size: number; capacity: number; loadFactor: number; maxBucketDepth: number };
    invertedIndexTokens: number;
    graph: { vertices: number; edges: number };
    uniqueCategoriesCount: number;
    uniqueProductsCount: number;
  } {
    return {
      hashTable: this.productTable.getStats(),
      invertedIndexTokens: this.invertedIndex.tokenCount(),
      graph: this.coPurchaseGraph.getGraphStats(),
      uniqueCategoriesCount: this.uniqueCategories.size,
      uniqueProductsCount: this.uniqueProductIds.size,
    };
  }
}
