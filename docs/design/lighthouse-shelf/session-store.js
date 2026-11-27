// Separate local records keep a new recap, a named place and a private combat edit independent.
(() => {
  const E = window.Lighthouse,
    prefix = 'ltw:design:lighthouse-shelf:play:';
  const cache = new Map(),
    unsaved = new Set();
  function read(key) {
    if (!unsaved.has(key))
      try {
        const raw = localStorage.getItem(prefix + key);
        if (raw !== null) return JSON.parse(raw);
      } catch {
        /* private mode or an unreadable older entry */
      }
    return cache.get(key) ?? null;
  }
  function write(key, value) {
    cache.set(key, value);
    try {
      localStorage.setItem(prefix + key, JSON.stringify(value));
      unsaved.delete(key);
      return true;
    } catch {
      unsaved.add(key);
      return false;
    }
  }
  function list(group) {
    const keys = new Set(cache.keys());
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(prefix + group + '/')) keys.add(k.slice(prefix.length));
      }
    } catch {
      /* memory-only session */
    }
    return [...keys]
      .filter((k) => k.startsWith(group + '/'))
      .map(read)
      .filter(Boolean);
  }
  const recapRows = [
    ['discovery', 'Что выяснили'],
    ['promise', 'Кому что пообещали'],
    ['question', 'Что осталось открытым'],
  ];
  const recaps = () =>
    list('recap')
      .filter(
        (r) =>
          typeof r.id === 'string' &&
          Array.isArray(r.lines) &&
          r.lines.length === 3 &&
          r.lines.every((x) => typeof x === 'string'),
      )
      .sort((a, b) => b.when - a.when);
  function marks() {
    return list('mark').filter(
      (m) =>
        Object.hasOwn(E.places, m.at) &&
        E.people[m.hero]?.kind === 'hero' &&
        typeof m.name === 'string' &&
        m.name.trim().length &&
        m.name.length <= 64,
    );
  }
  function atlas() {
    return {
      type: 'atlas',
      title: 'Карта партии',
      pins: marks().map((m) => ({
        hero: m.hero,
        who: E.people[m.hero].name,
        place: E.places[m.at].name,
        name: m.name,
        x: E.places[m.at].x,
        y: E.places[m.at].y,
      })),
    };
  }
  E.session = { read, write, list, recaps, recapRows, marks, atlas };
})();
