import { ProductGraph } from '../dsa/Graph.ts';
import { HashTable, InvertedIndex } from '../dsa/HashTable.ts';
import { extractTopK } from '../dsa/Heap.ts';
import { binarySearchPriceRange, searchProductsWithIndex } from '../dsa/Searching.ts';
import { CustomSet } from '../dsa/Sets.ts';
import { mergeSort, quickSort } from '../dsa/Sorting.ts';
import type {
  CategoryInfo,
  GraphRecommendation,
  Order,
  PersonalizedRecommendation,
  Product,
  SalesReport,
  SearchTelemetry,
} from '../types.ts';

export type SortOption = 'popular' | 'rating' | 'price-asc' | 'price-desc' | 'name';
export type SortAlgo = 'merge' | 'quick';

export interface CatalogQuery {
  q?: string;
  category?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  sortBy?: SortOption;
  sortAlgo?: SortAlgo;
}

export class CommerceDSAEngine {
  public productTable: HashTable<Product>;
  public categoryTable: HashTable<CategoryInfo>;
  public invertedIndex: InvertedIndex;
  public coPurchaseGraph: ProductGraph;

  constructor() {
    this.productTable = new HashTable<Product>(32);
    this.categoryTable = new HashTable<CategoryInfo>(16);
    this.invertedIndex = new InvertedIndex();
    this.coPurchaseGraph = new ProductGraph();
  }

  rebuild(products: Product[], categories: CategoryInfo[], orders: Order[]): void {
    this.productTable = new HashTable<Product>(Math.max(32, products.length * 2));
    this.categoryTable = new HashTable<CategoryInfo>(Math.max(16, categories.length * 2));
    this.invertedIndex = new InvertedIndex();
    this.coPurchaseGraph = new ProductGraph();

    for (const cat of categories) {
      this.categoryTable.set(cat.name, { ...cat, productCount: 0 });
    }

    for (const product of products) {
      this.productTable.set(product.id, product);
      this.coPurchaseGraph.addVertex(product.id);

      const catEntry = this.categoryTable.get(product.category);
      if (catEntry) {
        catEntry.productCount = (catEntry.productCount ?? 0) + 1;
      } else {
        this.categoryTable.set(product.category, {
          name: product.category,
          description: `${product.category} collection`,
          productCount: 1,
        });
      }

      const tokens = [
        product.sku,
        ...product.name.split(/\s+/),
        ...product.category.split(/\s+/),
        ...product.tags,
        ...product.material.split(/\s+/),
      ];
      this.invertedIndex.addDocument(product.id, tokens);
    }

    // Build baseline attribute-similarity edges (light weight)
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
              : `${sharedTags} shared material/use tags`;
          this.coPurchaseGraph.addOrStrengthenEdge(a.id, b.id, Number(weight.toFixed(2)), reason);
        }
      }
    }

    // Strengthen Graph edges from historical and live co-purchases
    for (const order of orders) {
      this.recordOrderInGraph(order);
    }
  }

  recordOrderInGraph(order: Order): void {
    const ids = Array.from(new Set(order.items.map((item) => item.productId)));
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        this.coPurchaseGraph.addOrStrengthenEdge(ids[i], ids[j], 3.0, 'Frequently bought together');
      }
    }
  }

  getTopRated(k = 4): Product[] {
    const all = this.productTable.values();
    return extractTopK(all, k, (a, b) => {
      if (a.rating !== b.rating) return a.rating - b.rating;
      return a.reviewCount - b.reviewCount;
    });
  }

  getMostPopular(k = 4): Product[] {
    const all = this.productTable.values();
    return extractTopK(all, k, (a, b) => {
      const popA = a.salesCount * 2 + a.rating * 10;
      const popB = b.salesCount * 2 + b.rating * 10;
      return popA - popB;
    });
  }

  queryCatalog(query: CatalogQuery): { items: Product[]; telemetry: SearchTelemetry } {
    const start = performance.now();
    const allProducts = this.productTable.values();

    let working: Product[];
    let searchAlgorithm = 'Full Hash Table Scan';

    // 1. Searching: Inverted Index + HashTable lookup
    if (query.q && query.q.trim().length > 0) {
      working = searchProductsWithIndex(query.q, this.productTable, this.invertedIndex);
      searchAlgorithm = 'HashTable Inverted Index + Levenshtein';
    } else {
      working = allProducts;
    }

    // 2. Filtering: Binary Search on Price Range + Set Intersection on Tags/Category
    let filterAlgorithm = 'Direct Predicate';
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const min = query.minPrice ?? 0;
      const max = query.maxPrice ?? Number.MAX_SAFE_INTEGER;
      const priceMatches = binarySearchPriceRange(working, min, max);
      const allowedIds = new CustomSet<string>(priceMatches.map((p) => p.id));
      working = working.filter((p) => allowedIds.has(p.id));
      filterAlgorithm = 'Binary Search Price Range';
    }

    if (query.category && query.category !== 'All') {
      working = working.filter((p) => p.category.toLowerCase() === query.category!.toLowerCase());
    }

    if (query.tags && query.tags.length > 0) {
      const requiredTags = new CustomSet<string>(query.tags);
      working = working.filter((p) => {
        const productTags = new CustomSet<string>(p.tags);
        return productTags.intersection(requiredTags).size() > 0;
      });
      filterAlgorithm =
        filterAlgorithm === 'Binary Search Price Range'
          ? 'Binary Search + Set Intersection'
          : 'CustomSet Tag Intersection';
    }

    // 3. Sorting: Merge Sort or Quick Sort
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
      const product = this.productTable.get(node.productId);
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
   * Personalized recommendations via Set Algebra (Union, Intersection, Difference)
   * & Jaccard Similarity combined with popularity weighting.
   */
  getPersonalizedRecommendations(
    userPreferences: string[],
    purchasedIds: string[],
    limit = 4
  ): PersonalizedRecommendation[] {
    const allProducts = this.productTable.values();
    const purchasedSet = new CustomSet<string>(purchasedIds);

    // Build composite user interest Set from explicit preferences + tags of past purchases
    let interestSet = new CustomSet<string>(userPreferences);
    for (const pid of purchasedIds) {
      const purchasedProduct = this.productTable.get(pid);
      if (purchasedProduct) {
        const prodTagSet = new CustomSet<string>([
          ...purchasedProduct.tags,
          purchasedProduct.category.toLowerCase(),
        ]);
        interestSet = interestSet.union(prodTagSet);
      }
    }

    // If cold start (no preferences & no purchases), fall back to Max-Heap Popularity
    if (interestSet.size() === 0) {
      const popular = this.getMostPopular(limit);
      return popular.map((product) => ({
        product,
        similarityScore: Number((product.rating / 5).toFixed(2)),
        matchedTags: product.tags.slice(0, 2),
        reason: 'Popular across studio orders',
      }));
    }

    const candidateIds = new CustomSet<string>(allProducts.map((p) => p.id)).difference(purchasedSet);
    const scored: PersonalizedRecommendation[] = [];

    for (const pid of candidateIds.toArray()) {
      const product = this.productTable.get(pid);
      if (!product) continue;

      const productSet = new CustomSet<string>([
        ...product.tags,
        product.category.toLowerCase(),
      ]);
      const matched = interestSet.intersection(productSet).toArray();
      const jaccard = interestSet.jaccardSimilarity(productSet);
      const popularityBoost = Math.min(0.15, product.salesCount / 400);
      const combinedScore = Number((jaccard * 0.85 + popularityBoost).toFixed(3));

      scored.push({
        product,
        similarityScore: combinedScore,
        matchedTags: matched,
        reason:
          matched.length > 0
            ? `Matches ${matched.slice(0, 3).join(', ')}`
            : `Complements your studio profile`,
      });
    }

    const ranked = mergeSort(scored, (a, b) => b.similarityScore - a.similarityScore);
    return ranked.slice(0, limit);
  }

  generateSalesReport(orders: Order[]): SalesReport {
    let totalRevenue = 0;
    let totalUnitsSold = 0;

    // HashTable aggregation for category revenue and per-product sales
    const categoryStats = new HashTable<{
      category: string;
      revenue: number;
      unitsSold: number;
      orderIds: Set<string>;
    }>(16);

    const productSales = new HashTable<{
      productId: string;
      sku: string;
      name: string;
      category: string;
      unitsSold: number;
      revenue: number;
      rating: number;
    }>(32);

    const dailyMap = new HashTable<{ date: string; revenue: number; orders: number }>(32);

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

        const liveProd = this.productTable.get(item.productId);
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

    // Max-Heap to extract top-selling products
    const topSellingProducts = extractTopK(
      productSales.values(),
      6,
      (a, b) => a.revenue - b.revenue || a.unitsSold - b.unitsSold
    );

    const categoryBreakdown = mergeSort(
      categoryStats.values().map((c) => ({
        category: c.category,
        revenue: Number(c.revenue.toFixed(2)),
        unitsSold: c.unitsSold,
        orderCount: c.orderIds.size,
        sharePercent: totalRevenue > 0 ? Number(((c.revenue / totalRevenue) * 100).toFixed(1)) : 0,
      })),
      (a, b) => b.revenue - a.revenue
    );

    const dailyRevenue = mergeSort(dailyMap.values(), (a, b) => a.date.localeCompare(b.date));
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
  } {
    return {
      hashTable: this.productTable.getStats(),
      invertedIndexTokens: this.invertedIndex.tokenCount(),
      graph: this.coPurchaseGraph.getGraphStats(),
    };
  }
}
