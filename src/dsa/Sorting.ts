/**
 * Custom Sorting Algorithms:
 * - Merge Sort: O(N log N) worst-case, stable.
 * - Quick Sort: O(N log N) average-case with randomized pivot partitioning.
 */

export type SortComparator<T> = (a: T, b: T) => number;

export function mergeSort<T>(items: T[], compare: SortComparator<T>): T[] {
  if (items.length <= 1) return [...items];

  const mid = Math.floor(items.length / 2);
  const left = mergeSort(items.slice(0, mid), compare);
  const right = mergeSort(items.slice(mid), compare);

  return merge(left, right, compare);
}

function merge<T>(left: T[], right: T[], compare: SortComparator<T>): T[] {
  const result: T[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length && j < right.length) {
    if (compare(left[i], right[j]) <= 0) {
      result.push(left[i]);
      i++;
    } else {
      result.push(right[j]);
      j++;
    }
  }

  while (i < left.length) {
    result.push(left[i]);
    i++;
  }
  while (j < right.length) {
    result.push(right[j]);
    j++;
  }

  return result;
}

export function quickSort<T>(items: T[], compare: SortComparator<T>): T[] {
  const arr = [...items];
  quickSortInPlace(arr, 0, arr.length - 1, compare);
  return arr;
}

function quickSortInPlace<T>(arr: T[], low: number, high: number, compare: SortComparator<T>): void {
  if (low >= high) return;

  const pivotIndex = partition(arr, low, high, compare);
  quickSortInPlace(arr, low, pivotIndex - 1, compare);
  quickSortInPlace(arr, pivotIndex + 1, high, compare);
}

function partition<T>(arr: T[], low: number, high: number, compare: SortComparator<T>): number {
  const randomIdx = low + Math.floor(Math.random() * (high - low + 1));
  const tmpSwap = arr[randomIdx];
  arr[randomIdx] = arr[high];
  arr[high] = tmpSwap;

  const pivot = arr[high];
  let i = low - 1;

  for (let j = low; j < high; j++) {
    if (compare(arr[j], pivot) <= 0) {
      i++;
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  const tmpEnd = arr[i + 1];
  arr[i + 1] = arr[high];
  arr[high] = tmpEnd;
  return i + 1;
}
