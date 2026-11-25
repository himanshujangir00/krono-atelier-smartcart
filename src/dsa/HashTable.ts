/**
 * Custom Separate-Chaining Hash Table with dynamic resizing.
 * Average O(1) insertion, lookup, and deletion.
 */

interface BucketEntry<V> {
  key: string;
  value: V;
}

export class HashTable<V> {
  private buckets: Array<Array<BucketEntry<V>>>;
  private count: number;
  private capacity: number;
  private readonly loadFactorThreshold = 0.75;

  constructor(initialCapacity = 32) {
    this.capacity = Math.max(8, initialCapacity);
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.count = 0;
  }

  /**
   * FNV-1a 32-bit string hash mapped to [0, capacity - 1].
   */
  private hash(key: string): number {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % this.capacity;
  }

  private resize(newCapacity: number): void {
    const oldEntries = this.entries();
    this.capacity = newCapacity;
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.count = 0;
    for (const [key, value] of oldEntries) {
      this.set(key, value);
    }
  }

  set(key: string, value: V): void {
    if ((this.count + 1) / this.capacity > this.loadFactorThreshold) {
      this.resize(this.capacity * 2);
    }
    const idx = this.hash(key);
    const bucket = this.buckets[idx];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].key === key) {
        bucket[i].value = value;
        return;
      }
    }
    bucket.push({ key, value });
    this.count++;
  }

  get(key: string): V | undefined {
    const idx = this.hash(key);
    const bucket = this.buckets[idx];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].key === key) {
        return bucket[i].value;
      }
    }
    return undefined;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    const idx = this.hash(key);
    const bucket = this.buckets[idx];
    for (let i = 0; i < bucket.length; i++) {
      if (bucket[i].key === key) {
        bucket.splice(i, 1);
        this.count--;
        return true;
      }
    }
    return false;
  }

  size(): number {
    return this.count;
  }

  getStats(): { size: number; capacity: number; loadFactor: number; maxBucketDepth: number } {
    let maxBucketDepth = 0;
    for (const bucket of this.buckets) {
      if (bucket.length > maxBucketDepth) {
        maxBucketDepth = bucket.length;
      }
    }
    return {
      size: this.count,
      capacity: this.capacity,
      loadFactor: Number((this.count / this.capacity).toFixed(3)),
      maxBucketDepth,
    };
  }

  keys(): string[] {
    const result: string[] = [];
    for (const bucket of this.buckets) {
      for (const entry of bucket) {
        result.push(entry.key);
      }
    }
    return result;
  }

  values(): V[] {
    const result: V[] = [];
    for (const bucket of this.buckets) {
      for (const entry of bucket) {
        result.push(entry.value);
      }
    }
    return result;
  }

  entries(): Array<[string, V]> {
    const result: Array<[string, V]> = [];
    for (const bucket of this.buckets) {
      for (const entry of bucket) {
        result.push([entry.key, entry.value]);
      }
    }
    return result;
  }
}

/**
 * Inverted Keyword Index backed by HashTable for fast token-to-ID lookup.
 */
export class InvertedIndex {
  private index: HashTable<string[]>;

  constructor() {
    this.index = new HashTable<string[]>(64);
  }

  addDocument(docId: string, tokens: string[]): void {
    const seen = new Set<string>();
    for (const raw of tokens) {
      const token = raw.trim().toLowerCase();
      if (!token || seen.has(token)) continue;
      seen.add(token);
      const existing = this.index.get(token);
      if (existing) {
        if (!existing.includes(docId)) {
          existing.push(docId);
        }
      } else {
        this.index.set(token, [docId]);
      }
    }
  }

  lookupExact(token: string): string[] {
    return this.index.get(token.trim().toLowerCase()) ?? [];
  }

  lookupPrefix(prefix: string): string[] {
    const normalized = prefix.trim().toLowerCase();
    if (!normalized) return [];
    const matched = new Set<string>();
    for (const [key, docIds] of this.index.entries()) {
      if (key.startsWith(normalized) || key.includes(normalized)) {
        for (const id of docIds) {
          matched.add(id);
        }
      }
    }
    return Array.from(matched);
  }

  tokenCount(): number {
    return this.index.size();
  }
}
