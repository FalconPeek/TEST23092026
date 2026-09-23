import { BYE, type Entry, type EntrySlot } from "./types";

export function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Recursive "standard" seed order for a bracket of `size` (must be a power
 * of two): 2 -> [1,2]; 4 -> [1,4,2,3]; 8 -> [1,8,4,5,2,7,3,6];
 * 16 -> [1,16,8,9,4,13,5,12,2,15,7,10,3,14,6,11]. Position i and i+1 (even i)
 * play each other in round 1.
 */
export function standardSeedOrder(size: number): number[] {
  if (size <= 1) return [1];
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s, n + 1 - s);
    }
    order = next;
  }
  return order;
}

/**
 * Places `entries` (by .seed, ascending = best) into a power-of-two bracket,
 * filling seed numbers beyond entries.length with BYE. Because the standard
 * seed order pairs seed s with (pow2+1-s), byes always land on the highest
 * seed numbers and therefore face the lowest (best) seed numbers first,
 * satisfying "byes go to top seeds".
 */
export function buildBracketSlots(entries: Entry[]): EntrySlot[] {
  const pow2 = nextPow2(entries.length);
  const order = standardSeedOrder(pow2);
  const bySeed = new Map<number, Entry>();
  for (const e of entries) bySeed.set(e.seed, e);
  return order.map((seedNum) => bySeed.get(seedNum)?.id ?? BYE);
}
