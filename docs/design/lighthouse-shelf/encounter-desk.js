(() => {
  const E = window.Lighthouse,
    { esc, button } = E;
  const goals = {
    'dock-keepers': [
      'Сверить дату рейса и удержать проход, пока запись расходится с билетом.',
      'Поднимает фонарь и преграждает дорогу мягким упором.',
      'Показать билет на сегодня, перевести ручной рычаг или пройти служебным входом.',
    ],
    'workshop-repairer': [
      'Вернуть пролёт к форме, нарисованной на старом шаблоне.',
      'Сначала гудит, показывая, какую балку собирается вернуть на место.',
      'Снять старый шаблон, предъявить утверждённый чертёж или попросить Ильера отключить питание.',
    ],
    'last-guardian': [
      'Удерживать записанный в Атласе рисунок до поступления новой схемы.',
      'Поворачивает голову-фонарь и предупреждает героя у ближайшего поста.',
      'Предъявить схему, остановить механизм вручную или обойти пост.',
    ],
  };
  let selected;
  function open(id, source) {
    selected = id;
    E.drawers.show('turn', true, source);
  }
  function turn() {
    const fight = E.combat.key(),
      frame = E.combat.frame(fight);
    const p = frame.pieces.find((x) => x.id === selected),
      stats = E.fights[fight].actors.find((x) => x.id === selected);
    const key = 'vitals/' + fight + '/' + selected,
      stored = E.session.read(key),
      hp = Number.isInteger(stored?.hp) ? Math.max(0, Math.min(stats.hp, stored.hp)) : stats.hp;
    const hero = E.people[selected],
      goal = goals[fight];
    const row = (label, value) => '<div><dt>' + label + '</dt><dd>' + esc(value) + '</dd></div>';
    return (
      E.drawers.heading(
        p.name,
        (frame.active === selected ? 'Сейчас ходит' : 'Участник встречи') +
          ' · Раунд ' +
          frame.round,
      ) +
      '<div class="drawer-scroll turn-inspector"><div class="turn-portrait"><img src="' +
      E.art(p.portrait) +
      '" alt=""><div><strong>' +
      (hero ? esc(hero.role) : 'Противник') +
      '</strong><span>Класс защиты ' +
      stats.ac +
      '</span><span>Клетка ' +
      (p.x + 1) +
      ' × ' +
      (p.y + 1) +
      '</span></div></div>' +
      '<dl class="turn-guidance">' +
      row('Цель', hero ? hero.motive : goal[0]) +
      row('Ближайшее действие', hero ? hero.cues[0] : goal[1]) +
      (!hero ? row('При столкновении', stats.action) + row('Мирный выход', goal[2]) : '') +
      '</dl>' +
      '<form class="session-form turn-vitals" data-form="vitals"><div class="vital-fields"><label>Хиты из ' +
      stats.hp +
      '<input name="hp" type="number" min="0" max="' +
      stats.hp +
      '" step="1" required value="' +
      hp +
      '"></label>' +
      '<label>Состояние<input name="condition" maxlength="80" value="' +
      esc(typeof stored?.condition === 'string' ? stored.condition : '') +
      '" placeholder="Обычное"></label></div><button type="submit" class="outline-button">Сохранить состояние</button><p role="status" class="save-status"></p></form>' +
      '<div class="journal-actions">' +
      button('turn-dice', 'Кубики участника', 'dice', 'primary') +
      (hero
        ? '<button class="outline-button" data-person="' + selected + '">Карточка героя</button>'
        : button('peace', 'Завершить встречу мирно', 'book', 'outline-button')) +
      '</div></div>'
    );
  }
  function handle(el) {
    if (el.dataset.do === 'turn-dice') {
      const p = E.combat.frame(E.combat.key()).pieces.find((a) => a.id === selected);
      E.drawers.diceFrom('turn', el, p.name);
      return true;
    }
    if (el.dataset.do === 'peace' || el.dataset.peace) {
      const fromBook = !!el.dataset.peace,
        k = fromBook ? el.dataset.peace : E.combat.key();
      const saved = E.session.write('peace/' + k, { when: Date.now() });
      if (E.projection.showing() === k) E.projection.stop();
      if (fromBook) {
        el.outerHTML = peaceAction(k);
        document.querySelector('.peace-note')?.focus({ preventScroll: true });
      } else {
        E.drawers.dismiss();
        location.hash = E.bookUrl(E.state.reading);
      }
      E.notify(saved ? 'Мирный исход записан.' : 'Мирный исход сохранён до закрытия вкладки.');
      return true;
    }
    return false;
  }
  document.addEventListener('submit', (e) => {
    if (e.target.dataset.form !== 'vitals') return;
    e.preventDefault();
    const key = E.combat.key(),
      actor = E.fights[key].actors.find((a) => a.id === selected),
      form = e.target;
    const hp = form.elements.namedItem('hp').valueAsNumber,
      condition = form.elements.namedItem('condition').value.trim();
    if (!Number.isInteger(hp) || hp < 0 || hp > actor.hp) return;
    const saved = E.session.write('vitals/' + key + '/' + selected, { hp, condition });
    form.querySelector('.save-status').textContent = saved
      ? 'Состояние сохранено у мастера.'
      : 'Состояние доступно до закрытия вкладки.';
  });
  function peaceAction(key) {
    return E.session.read('peace/' + key)
      ? '<p role="status" tabindex="-1" class="peace-note">' +
          E.icon('check') +
          'Партия нашла мирный выход.</p>'
      : '<button type="button" class="outline-button" data-peace="' +
          key +
          '">' +
          E.icon('quill') +
          'Записать мирный исход</button>';
  }
  E.encounterDesk = { turn, open, handle, peaceAction };
})();
