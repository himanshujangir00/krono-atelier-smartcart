/**
 * Custom Set implementation supporting algebraic set operations
 * (Union, Intersection, Difference, Jaccard Similarity) for attribute
 * filtering and user-preference recommendation scoring.
 */

export class CustomSet<T extends string | number> {
  private items: Record<string, T>;
  private length: number;

  constructor(initial: Iterable<T> = []) {
    this.items = {};
    this.length = 0;
    for (const item of initial) {
      this.add(item);
    }
  }

  private keyOf(value: T): string {
    return `${typeof value}:${String(value).toLowerCase()}`;
  }

  add(value: T): boolean {
    const key = this.keyOf(value);
    if (Object.prototype.hasOwnProperty.call(this.items, key)) {
      return false;
    }
    this.items[key] = value;
    this.length++;
    return true;
  }

  has(value: T): boolean {
    return Object.prototype.hasOwnProperty.call(this.items, this.keyOf(value));
  }

  delete(value: T): boolean {
    const key = this.keyOf(value);
    if (!Object.prototype.hasOwnProperty.call(this.items, key)) {
      return false;
    }
    delete this.items[key];
    this.length--;
    return true;
  }

  size(): number {
    return this.length;
  }

  toArray(): T[] {
    return Object.values(this.items);
  }

  union(other: CustomSet<T>): CustomSet<T> {
    const result = new CustomSet<T>(this.toArray());
    for (const item of other.toArray()) {
      result.add(item);
    }
    return result;
  }

  intersection(other: CustomSet<T>): CustomSet<T> {
    const result = new CustomSet<T>();
    for (const item of this.toArray()) {
      if (other.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  difference(other: CustomSet<T>): CustomSet<T> {
    const result = new CustomSet<T>();
    for (const item of this.toArray()) {
      if (!other.has(item)) {
        result.add(item);
      }
    }
    return result;
  }

  /**
   * Jaccard Similarity J(A, B) = |A ∩ B| / |A ∪ B| in [0, 1].
   */
  jaccardSimilarity(other: CustomSet<T>): number {
    const unionSet = this.union(other);
    if (unionSet.size() === 0) return 0;
    const interSet = this.intersection(other);
    return Number((interSet.size() / unionSet.size()).toFixed(4));
  }
}
