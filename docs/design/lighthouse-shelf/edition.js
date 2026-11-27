(() => {
  const { esc } = window.LighthouseBoard;
  const icon = window.shelfIcon;
  const romans = 'I II III IV V VI VII VIII IX X XI XII'.split(' ');
  const initialPlace = { chapter: 5, scene: 2 };
  const storageKey = 'ltw:design:lighthouse-shelf:v1';
  let stored;
  try {
    stored = JSON.parse(localStorage.getItem(storageKey) ?? '{}') ?? {};
  } catch {
    stored = {};
  }
  const validPlace = (p) =>
    p &&
    Number.isInteger(p.chapter) &&
    p.chapter >= 0 &&
    p.chapter < 12 &&
    Number.isInteger(p.scene) &&
    p.scene >= 0 &&
    p.scene < 3;
  const state = {
    place: validPlace(stored.place) ? stored.place : initialPlace,
    reading: initialPlace,
    played: [0, 1, 2, 4],
    notes:
      stored.notes && typeof stored.notes === 'object' && !Array.isArray(stored.notes)
        ? stored.notes
        : {},
    view: 'shelf',
  };
  state.reading = { ...state.place };

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ place: state.place, notes: state.notes }));
      return true;
    } catch {
      return false;
    }
  }

  let timer;
  function notify(message) {
    const out = document.getElementById('notice');
    out.textContent = message;
    clearTimeout(timer);
    timer = setTimeout(() => {
      out.textContent = '';
    }, 4200);
  }
  function button(action, text, symbol, style = 'text-button') {
    return `<button type="button" class="${style}" data-do="${action}">${symbol ? icon(symbol) : ''}<span>${esc(text)}</span></button>`;
  }
  function iconButton(action, text, symbol) {
    return `<button type="button" class="icon-button" data-do="${action}" title="${esc(text)}" aria-label="${esc(text)}">${icon(symbol)}</button>`;
  }
  const art = window.LighthouseBoard.portraitArt;
  const mini = window.LighthouseBoard.figureArt;
  const ornament = (id) => 'art/item-' + id + '.webp';
  const same = (a, b) => a.chapter === b.chapter && a.scene === b.scene;
  const placeKey = (p) => p.chapter + '/' + p.scene;
  const bookUrl = (p) => '#book/' + (p.chapter + 1) + '/' + (p.scene + 1);
  window.Lighthouse = {
    state,
    chapters: [],
    icon,
    esc,
    art,
    mini,
    ornament,
    romans,
    save,
    same,
    placeKey,
    bookUrl,
    validPlace,
    button,
    iconButton,
    notify,
  };
})();
