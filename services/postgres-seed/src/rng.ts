// Seeded Mulberry32 RNG. Deterministic for identical seeds across runs.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededRng(seed: number) {
  const rand = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T,>(arr: readonly T[]): T => arr[int(0, arr.length - 1)]!;
  const choice = <T,>(arr: readonly T[], weights: readonly number[]): T => {
    const total = weights.reduce((s, w) => s + w, 0);
    let r = rand() * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return arr[i]!;
    }
    return arr[arr.length - 1]!;
  };
  const uuid = () => {
    // Deterministic uuid-ish from the rng.
    const hex = () => int(0, 0xffff).toString(16).padStart(4, "0");
    return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${hex()}-${hex()}${hex()}${hex()}`;
  };
  return { rand, int, pick, choice, uuid };
}
