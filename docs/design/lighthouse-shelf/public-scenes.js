// The player window receives a single published illustration, card, map or request.
(() => {
  const { esc } = window.LighthouseBoard;
  const locations = [
    'harbor',
    'ship',
    'orchard',
    'library',
    'market',
    'forge',
    'observatory',
    'bells',
    'winter',
    'lighthouse',
  ];
  const heroes = ['finn', 'tess', 'asya', 'mika'];
  const words = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const pin = (p) =>
    p &&
    heroes.includes(p.hero) &&
    words(p.name, 64) &&
    words(p.who, 40) &&
    words(p.place, 80) &&
    [p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1);
  function valid(f) {
    if (!f || !words(f.title, 96)) return false;
    switch (f.type) {
      case 'place':
        return [...locations, 'forge-strike', 'moment'].includes(f.art);
      case 'handout':
        return ['slate', 'paper'].includes(f.style) && words(f.text, 2200) && words(f.task, 320);
      case 'atlas':
        return Array.isArray(f.pins) && f.pins.length <= 40 && f.pins.every(pin);
      case 'check':
        return (
          heroes.includes(f.hero) &&
          words(f.who, 64) &&
          words(f.skill, 45) &&
          (f.total === undefined || (Number.isInteger(f.total) && typeof f.passed === 'boolean'))
        );
      default:
        return false;
    }
  }
  function artwork(f) {
    if (f.art === 'forge-strike')
      return '<div class="forge-space"><div class="forge-plane"><img class="anvil-art" src="art/forge-anvil.webp" alt=""><img class="hammer-art" src="art/forge-hammer.webp" alt=""><i class="forge-contact"></i><i class="forge-echo"></i></div></div>';
    const src = f.art === 'moment' ? 'moment' : 'place-' + f.art;
    return '<img class="show-landscape" src="art/' + src + '.webp" alt="">';
  }
  function atlas(f) {
    const groups = new Map();
    for (const p of f.pins) {
      const key = p.x + '/' + p.y;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    return (
      '<div class="atlas-extent"><img class="atlas-art" src="art/archipelago.webp" alt="Карта парящих островов">' +
      [...groups.values()]
        .map((group) => {
          const p = group[0];
          return (
            '<div class="atlas-pin ' +
            (p.x > 0.72 ? 'pin-west' : p.x < 0.26 ? 'pin-east' : '') +
            '" style="left:' +
            p.x * 100 +
            '%;top:' +
            p.y * 100 +
            '%"><i></i><span>' +
            group
              .map((mark) => '<b title="' + esc(mark.who) + '">' + esc(mark.name) + '</b>')
              .join('') +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  function markup(f, preview = false) {
    if (!valid(f)) return '';
    const h = preview ? 'strong' : 'h1';
    if (f.type === 'place')
      return (
        '<div class="show-frame show-place">' +
        artwork(f) +
        '<div class="place-caption"><' +
        h +
        '>' +
        esc(f.title) +
        '</' +
        h +
        '></div></div>'
      );
    if (f.type === 'atlas') return '<div class="show-frame show-atlas">' + atlas(f) + '</div>';
    if (f.type === 'check')
      return (
        '<div class="show-frame show-check"><img src="art/portrait-' +
        f.hero +
        '.webp" alt=""><div><small>Проверка · d20</small><' +
        h +
        '>' +
        esc(f.who) +
        '</' +
        h +
        '><p>' +
        esc(f.skill) +
        '</p>' +
        (f.total === undefined
          ? ''
          : '<p class="public-total">' +
            f.total +
            ' · ' +
            (f.passed ? 'Получилось' : 'Осложнение') +
            '</p>') +
        '</div></div>'
      );
    const slate = f.style === 'slate';
    return (
      '<article class="show-frame show-card ' +
      (slate ? 'chalk-slate' : 'letter-paper') +
      '" tabindex="0" aria-label="' +
      esc(f.title) +
      '"><div class="card-paper"><' +
      h +
      '>' +
      esc(f.title) +
      '</' +
      h +
      '>' +
      (slate
        ? '<div class="chalk-rings" aria-label="Четыре сигнала">' +
          ['Течение', 'Рост', 'Голоса', 'Направление']
            .map((t) => '<span><i></i>' + t + '</span>')
            .join('') +
          '</div>'
        : '') +
      '<p>' +
      esc(f.text) +
      '</p><p class="card-question">' +
      esc(f.task) +
      '</p></div></article>'
    );
  }
  window.LighthouseShow = { valid, markup, atlas };
})();
