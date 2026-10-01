// Deterministic notifications: same data in both builds.
const NAMES = ['Anna', 'Piotr', 'Zofia', 'Léa', 'Omar', 'Yuki', 'Mateo', 'Amara', 'Noah', 'Sofia',
  'Karim', 'Ines', 'Lukas', 'Maya', 'Hugo', 'Aisha', 'Jonas', 'Chloé', 'Ravi', 'Elena',
  'Tomasz', 'Nadia', 'Louis', 'Hana', 'Diego', 'Fatima', 'Emil', 'Clara', 'Samir', 'Julia'];

function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0; // eslint-disable-line no-bitwise
    return seed / 4294967296;
  };
}

export function makeFeed(count, now) {
  const r = rng(42);
  const items = [];
  for (let i = 0; i < count; i++) {
    const people = 1 + Math.floor(r() * 2);
    const names = [];
    while (names.length < people) {
      const name = NAMES[Math.floor(r() * NAMES.length)];
      if (!names.includes(name)) names.push(name);
    }
    // Ages from a few seconds to three years, spread on a log scale.
    const ageSeconds = Math.floor(Math.exp(r() * Math.log(3 * 365 * 86400)));
    items.push({
      id: String(i),
      kind: ['liked', 'commented', 'followed'][Math.floor(r() * 3)],
      names,
      others: r() < 0.5 ? 0 : Math.floor(r() * 40),
      likes: Math.floor(Math.exp(r() * Math.log(5000))) - 1,
      time: now - ageSeconds * 1000,
    });
  }
  return items;
}
