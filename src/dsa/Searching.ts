import type { Product } from '../types.ts';
import { HashTable, InvertedIndex } from './HashTable.ts';
import { mergeSort } from './Sorting.ts';

/**
 * Custom Searching Algorithms:
 * - Binary Search lower/upper bound on price-sorted products: O(log N)
 * - Inverted Index + Levenshtein fuzzy token search
 */

export function binarySearchPriceRange(
  products: Product[],
  minPrice: number,
  maxPrice: number
): Product[] {
  if (products.length === 0) return [];
  const sorted = mergeSort(products, (a, b) => a.price - b.price);

  const lowerBound = (target: number): number => {
    let left = 0;
    let right = sorted.length;
    while (left < right) {
      const mid = left + Math.floor((right - left) / 2);
      if (sorted[mid].price < target) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  };

  const upperBound = (target: number): number => {
    let left = 0;
    let right = sorted.length;
    while (left < right) {
      const mid = left + Math.floor((right - left) / 2);
      if (sorted[mid].price <= target) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    return left;
  };

  const startIdx = lowerBound(minPrice);
  const endIdx = upperBound(maxPrice);
  if (startIdx >= endIdx) return [];
  return sorted.slice(startIdx, endIdx);
}

export function binarySearchByExactPrice(sortedByPrice: Product[], targetPrice: number): Product | null {
  let left = 0;
  let right = sortedByPrice.length - 1;
  while (left <= right) {
    const mid = left + Math.floor((right - left) / 2);
    if (sortedByPrice[mid].price === targetPrice) return sortedByPrice[mid];
    if (sortedByPrice[mid].price < targetPrice) left = mid + 1;
    else right = mid - 1;
  }
  return null;
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function searchProductsWithIndex(
  query: string,
  productTable: HashTable<Product>,
  invertedIndex: InvertedIndex
): Product[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return productTable.values();

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const scoreById = new HashTable<number>(32);

  for (const token of tokens) {
    // 1. Direct Hash Table SKU lookup
    const skuMatch = productTable.values().find((p) => p.sku.toLowerCase() === token);
    if (skuMatch) {
      scoreById.set(skuMatch.id, (scoreById.get(skuMatch.id) ?? 0) + 10);
    }

    // 2. Inverted Index exact & prefix lookup
    const exactIds = invertedIndex.lookupExact(token);
    for (const id of exactIds) {
      scoreById.set(id, (scoreById.get(id) ?? 0) + 5);
    }

    const prefixIds = invertedIndex.lookupPrefix(token);
    for (const id of prefixIds) {
      scoreById.set(id, (scoreById.get(id) ?? 0) + 2);
    }
  }

  // 3. Fallback fuzzy match if zero exact/prefix matches found
  if (scoreById.size() === 0) {
    for (const product of productTable.values()) {
      const words = `${product.name} ${product.category} ${product.tags.join(' ')}`
        .toLowerCase()
        .split(/\s+/);
      for (const token of tokens) {
        for (const word of words) {
          if (token.length >= 3 && levenshteinDistance(token, word) <= 2) {
            scoreById.set(product.id, (scoreById.get(product.id) ?? 0) + 1);
          }
        }
      }
    }
  }

  const matched: Array<{ product: Product; score: number }> = [];
  for (const [id, score] of scoreById.entries()) {
    const prod = productTable.get(id);
    if (prod) matched.push({ product: prod, score });
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.map((m) => m.product);
}
