(() => {
  const E = window.Lighthouse;
  const { state, bookUrl } = E;
  const main = document.getElementById('content');
  const masthead = document.getElementById('masthead');
  function turnPage(previous, oldPage, person) {
    if (person || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const spread = main.querySelector('.spread');
    const page = state.reading.chapter * 3 + state.reading.scene;
    if (previous === 'shelf') {
      spread.animate(
        [
          { transform: 'perspective(1200px) rotateX(5deg) scale(.975)', opacity: 0.7 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 320, easing: 'ease-out' },
      );
    } else if (previous === 'book' && page !== oldPage) {
      const forward = page > oldPage;
      const leaf = spread.querySelector(forward ? '.story-leaf' : '.guide-leaf');
      const stacked = matchMedia('(max-width:700px)').matches;
      leaf.style.transformOrigin = forward ? 'right center' : 'left center';
      leaf.animate(
        [
          {
            transform: stacked
              ? 'translateY(8px)'
              : 'perspective(1500px) rotateY(' + (forward ? 73 : -73) + 'deg)',
            filter: 'brightness(.7)',
            opacity: 0.72,
          },
          { transform: 'none', filter: 'brightness(1)', opacity: 1 },
        ],
        { duration: stacked ? 230 : 460, easing: 'cubic-bezier(.2,.65,.2,1)' },
      );
    }
  }
  function render(focus = true) {
    E.drawers.dismiss();
    const previous = state.view;
    const oldPage = state.reading.chapter * 3 + state.reading.scene;
    const [page, part, leaf] = location.hash.slice(1).split('/');
    const person = page === 'person' && Object.hasOwn(E.people, part) ? part : null;
    if (page === 'battle' && Object.hasOwn(E.fights, part)) {
      E.combat.enter(part);
      state.view = 'battle';
    } else if (
      page === 'book' ||
      person ||
      page === 'dice' ||
      page === 'check' ||
      page === 'players'
    ) {
      const p = { chapter: Number(part) - 1, scene: Number(leaf) - 1 };
      state.reading = E.validPlace(p) ? p : { ...state.place };
      state.view = 'book';
    } else {
      state.view = 'shelf';
    }
    document.body.dataset.view = state.view;
    masthead.hidden = state.view === 'battle';
    if (state.view !== 'battle') masthead.innerHTML = E.reading.masthead();
    if (state.view === 'battle') {
      main.innerHTML = E.combat.markup();
      E.combat.fit();
      document.title = E.fights[part].title + ' · Поле боя';
    } else if (state.view === 'book') {
      main.innerHTML = E.reading.book();
      if (focus) turnPage(previous, oldPage, person);
      document.title =
        E.chapters[state.reading.chapter].scenes[state.reading.scene].title + ' · Книга мастера';
    } else {
      main.innerHTML = E.reading.shelf();
      document.title = 'Книжная полка · Living Tabletop World';
    }
    E.projection.status();
    if (previous === 'battle' && state.view !== 'battle' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    window.scrollTo(0, 0);
    if (focus) main.focus({ preventScroll: true });
    if (person) E.drawers.showPerson(person, main.querySelector('[data-do=cast]'));
    if (page === 'dice') E.drawers.show('dice', true, main.querySelector('[data-do=dice]'));
    if (page === 'players')
      E.drawers.show('players', true, masthead.querySelector('[data-do=players]'));
    if (page === 'check') {
      const [, , , hero, skill, ticketId] = location.hash.slice(1).split('/');
      E.director.openCheck(hero, skill, main.querySelector('[data-do=ask-check]'), ticketId);
    }
  }
  function field(id) {
    location.hash = 'battle/' + id;
  }
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('.skip')) {
      event.preventDefault();
      main.focus();
      return;
    }
    if (!event.target.closest('dialog') && E.combat.handle(event.target, event)) return;
    const el = event.target.closest('button');
    if (!el || E.drawers.handle(el)) return;
    if (el.dataset.fight) {
      field(el.dataset.fight);
      return;
    }
    switch (el.dataset.do) {
      case 'field':
        state.reading = { ...state.place };
        field(E.defaultFight());
        break;
      case 'ribbon': {
        state.place = { ...state.reading };
        const saved = E.save();
        render(false);
        main.querySelector('.turn-pages a')?.focus({ preventScroll: true });
        E.notify(saved ? 'Закладка партии перенесена.' : 'Закладка сохранена до закрытия вкладки.');
        break;
      }
      case 'stopcast':
        E.projection.stop();
        break;
    }
  });
  document.addEventListener('keydown', (event) => {
    E.combat.keys(event);
    if (
      state.view !== 'book' ||
      document.querySelector('dialog[open]') ||
      event.altKey ||
      event.metaKey ||
      event.ctrlKey
    )
      return;
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const dest = state.reading.chapter * 3 + state.reading.scene + step;
    if (dest >= 0 && dest < E.chapters.length * 3) {
      event.preventDefault();
      location.hash = bookUrl({ chapter: Math.floor(dest / 3), scene: dest % 3 });
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const control = document.querySelector('[data-do="fullscreen"]');
    if (!control) return;
    const label = document.fullscreenElement ? 'Выйти из полного экрана' : 'На весь экран';
    control.title = label;
    control.setAttribute('aria-label', label);
    E.combat.fit();
  });
  window.addEventListener('hashchange', () => render());
  render(false);
})();
