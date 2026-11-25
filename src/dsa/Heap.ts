/**
 * Custom Binary Heap (MaxHeap & MinHeap) with O(N) Floyd heapify
 * and O(N + K log N) Top-K extraction for product ranking.
 */

export type HeapComparator<T> = (a: T, b: T) => number;

export class BinaryHeap<T> {
  private data: T[];
  private readonly compare: HeapComparator<T>;

  /**
   * For a Max-Heap, compare(a, b) > 0 means `a` has higher priority than `b`.
   */
  constructor(compare: HeapComparator<T>, initialItems: T[] = []) {
    this.compare = compare;
    this.data = [...initialItems];
    if (this.data.length > 1) {
      this.heapify();
    }
  }

  private heapify(): void {
    for (let i = Math.floor(this.data.length / 2) - 1; i >= 0; i--) {
      this.siftDown(i);
    }
  }

  private siftUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parent = Math.floor((idx - 1) / 2);
      if (this.compare(this.data[idx], this.data[parent]) > 0) {
        const tmp = this.data[idx];
        this.data[idx] = this.data[parent];
        this.data[parent] = tmp;
        idx = parent;
      } else {
        break;
      }
    }
  }

  private siftDown(index: number): void {
    let idx = index;
    const len = this.data.length;
    while (true) {
      const left = 2 * idx + 1;
      const right = 2 * idx + 2;
      let highest = idx;

      if (left < len && this.compare(this.data[left], this.data[highest]) > 0) {
        highest = left;
      }
      if (right < len && this.compare(this.data[right], this.data[highest]) > 0) {
        highest = right;
      }
      if (highest === idx) break;

      const tmp = this.data[idx];
      this.data[idx] = this.data[highest];
      this.data[highest] = tmp;
      idx = highest;
    }
  }

  push(item: T): void {
    this.data.push(item);
    this.siftUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  peek(): T | undefined {
    return this.data[0];
  }

  size(): number {
    return this.data.length;
  }
}

export function extractTopK<T>(items: T[], k: number, compare: HeapComparator<T>): T[] {
  if (k <= 0 || items.length === 0) return [];
  const heap = new BinaryHeap<T>(compare, items);
  const limit = Math.min(k, items.length);
  const result: T[] = [];
  for (let i = 0; i < limit; i++) {
    const next = heap.pop();
    if (next !== undefined) {
      result.push(next);
    }
  }
  return result;
}
