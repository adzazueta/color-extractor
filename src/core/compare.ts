/**
 * Orders two values: negative when `a` goes first, positive when `b` goes first, and zero when
 * neither does. Comparators in this package never return `NaN`.
 */
export type Comparator<T> = (a: T, b: T) => number;

/**
 * Total order on numbers, ascending: −Infinity, negative numbers, −0, +0, positive numbers,
 * +Infinity, and `NaN` last. Two `NaN` values are equal.
 *
 * Unlike `a - b`, it never returns `NaN` and it does not treat −0 and +0 as equal, so a sort
 * with it depends only on the values, never on their initial order.
 */
export function compareNumbers(a: number, b: number): -1 | 0 | 1 {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  if (a === b) {
    // Equal values, except that −0 goes before +0.
    if (a !== 0) {
      return 0;
    }
    const aIsNegativeZero = Object.is(a, -0);
    if (aIsNegativeZero === Object.is(b, -0)) {
      return 0;
    }
    return aIsNegativeZero ? -1 : 1;
  }
  // At least one is NaN, and NaN goes after every number.
  const aIsNaN = Number.isNaN(a);
  if (aIsNaN === Number.isNaN(b)) {
    return 0;
  }
  return aIsNaN ? 1 : -1;
}

/** Orders values by a numeric key, ascending, with {@link compareNumbers}. */
export function compareBy<T>(key: (value: T) => number): Comparator<T> {
  return (a, b) => compareNumbers(key(a), key(b));
}

/** Reverses a comparator by swapping its arguments, for example to sort descending. */
export function reverseComparator<T>(comparator: Comparator<T>): Comparator<T> {
  return (a, b) => comparator(b, a);
}

/**
 * Combines comparators for multi-key ordering: they are tried in the given order, and the
 * first nonzero result wins. End with a key that no two values share, such as an index, so
 * that no ties remain.
 */
export function chainComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const comparator of comparators) {
      const order = comparator(a, b);
      if (order !== 0) {
        return order;
      }
    }
    return 0;
  };
}
