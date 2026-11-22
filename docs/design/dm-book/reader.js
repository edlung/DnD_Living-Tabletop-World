(() => {
  const $ = (id) => document.getElementById(id);
  const { el, icon, button, baseArt } = window.dmElements;
  const { art, people, places, chapters, kinds } = window.dmLibrary;
  const story = window.dmStory;
  const mobile = window.matchMedia('(max-width: 820px)');
  const prefix = 'ltw.dm-book.hollowmere.v1.';
  let storageAvailable = true;
  function read(key) {
    try {
      return localStorage.getItem(prefix + key);
    } catch {
      storageAvailable = false;
      return null;
    }
  }
  function write(key, value) {
    try {
      if (value) localStorage.setItem(prefix + key, value);
      else localStorage.removeItem(prefix + key);
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
    return storageAvailable;
  }
  const [lastScene, lastCue] = (read('cursor') || '').split('/');
  let scene = story.find((item) => item.id === lastScene) || story[0];
  let cueKey = Object.hasOwn(scene.cues, lastCue) ? lastCue : '';
  let tab = 'scene';
  let person, place, sheetOpener, lightboxOpener;
  let scrollAtOpen = 0;
  let large = read('large') === '1';
  const marks = story.filter((item) => read('mark.' + item.id) === '1').map((item) => item.id);
  const notes = Object.fromEntries(story.map((item) => [item.id, read('note.' + item.id) || '']));
  const sheet = $('mobile-reference');
  const ribbons = $('ribbons');
  const panel = $('reference-panel');
  const lightbox = $('lightbox');
  const tabNames = { scene: 'Сцена', people: 'Персонажи', atlas: 'Атлас', notes: 'Заметки' };

  function remember() {
    write('cursor', scene.id + '/' + cueKey);
  }
  function announce(text) {
    $('announcement').textContent = text;
  }
  function pageNumber(index) {
    return index * 2 + 1;
  }
  function resetDirectory() {
    const localPerson = Object.values(scene.cues).find((cue) => Object.hasOwn(people, cue.art));
    person = localPerson?.art || Object.keys(people)[0];
    place = scene.place;
  }
  function refreshSize() {
    document.body.classList.toggle('large-type', large);
    $('size-button').setAttribute('aria-pressed', String(large));
  }
  function refreshMark() {
    const marked = marks.includes(scene.id);
    $('mark-page').setAttribute('aria-pressed', String(marked));
    $('mark-page').title = marked ? 'Убрать закладку' : 'Заложить разворот';
    $('mark-page').setAttribute('aria-label', $('mark-page').title);
  }
  function mark() {
    const index = marks.indexOf(scene.id);
    if (index < 0) marks.push(scene.id);
    else marks.splice(index, 1);
    write('mark.' + scene.id, index < 0 ? '1' : '');
    refreshMark();
    announce(index < 0 ? 'Разворот заложен.' : 'Закладка снята.');
    return index < 0;
  }
  function trigger(key) {
    return $('manuscript').querySelector('[data-cue="' + key + '"]');
  }
  function renderPanel() {
    for (const item of ribbons.querySelectorAll('button')) {
      item.setAttribute('aria-pressed', String(item.dataset.tab === tab));
      item.setAttribute('aria-controls', panel.id);
    }
    for (const item of $('manuscript').querySelectorAll('[data-cue]')) {
      item.setAttribute('aria-pressed', String(item.dataset.cue === cueKey && tab === 'scene'));
    }
    window.dmReference(
      {
        scene,
        index: story.indexOf(scene),
        tab,
        cueKey,
        person,
        place,
        marks,
        notes,
        saved: storageAvailable,
      },
      actions,
    );
  }
  function openSheet(opener) {
    if (!mobile.matches || sheet.open) return;
    sheetOpener = opener;
    scrollAtOpen = window.scrollY;
    $('mobile-tabs').append(ribbons);
    $('mobile-panel-slot').append(panel);
    sheet.showModal();
    sheet.scrollTop = 0;
    sheet.querySelector('[data-close]').focus({ preventScroll: true });
  }
  function closeSheet(restore = true) {
    if (!sheet.open) return;
    sheet.close();
    $('tab-dock').append(ribbons);
    $('panel-slot').append(panel);
    if (restore) {
      window.scrollTo(0, scrollAtOpen);
      sheetOpener?.focus({ preventScroll: true });
    }
    sheetOpener = null;
  }
  function closeArt() {
    if (!lightbox.open) return;
    lightbox.close();
    lightboxOpener?.focus({ preventScroll: true });
    lightboxOpener = null;
  }
  function enlarge(key, opener) {
    const [src, caption] = art[key];
    $('lightbox-art').src = src;
    $('lightbox-art').alt = caption;
    $('lightbox-caption').textContent = caption;
    lightboxOpener = opener;
    lightbox.showModal();
  }
  function chooseTab(key, opener) {
    tab = key;
    renderPanel();
    openSheet(opener);
    if (sheet.open) sheet.scrollTop = 0;
    announce('Открыта закладка «' + tabNames[key] + '».');
  }
  function chooseCue(key, fromPanel = false) {
    if (!Object.hasOwn(scene.cues, key)) return;
    cueKey = key;
    tab = 'scene';
    remember();
    renderPanel();
    openSheet(trigger(key));
    if (sheet.open) sheet.scrollTop = 0;
    if (fromPanel) {
      const heading = panel.querySelector('h2');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    const cue = scene.cues[key];
    announce(kinds[cue.kind][0] + '. ' + cue.title);
  }
  function toText() {
    const source = trigger(cueKey);
    closeSheet();
    cueKey = '';
    remember();
    renderPanel();
    source?.focus();
  }
  function storyParagraph(text) {
    const line = el('p');
    let end = 0;
    for (const match of text.matchAll(/\[([a-z]+)\|([^\]]+)\]/g)) {
      const [, key, phrase] = match;
      line.append(text.slice(end, match.index));
      const cue = scene.cues[key];
      const target = button('cue', () => chooseCue(key), icon(kinds[cue.kind][1]), phrase);
      target.dataset.cue = key;
      target.dataset.kind = cue.kind;
      target.title = kinds[cue.kind][0] + ' · ' + cue.title;
      target.setAttribute('aria-label', phrase + ' — ' + kinds[cue.kind][0]);
      target.setAttribute('aria-controls', panel.id);
      line.append(target);
      end = match.index + match[0].length;
    }
    line.append(text.slice(end));
    return line;
  }
  function renderStory() {
    const index = story.indexOf(scene);
    const [where, region] = places[scene.place];
    document.title = scene.title + ' · Колокола Холлоумира · Книга Мастера';
    $('chapter-number').textContent = 'Глава ' + chapters[scene.chapter].numeral;
    $('scene-title').textContent = scene.title;
    $('location').textContent = region + ' · ' + where;
    $('manuscript').replaceChildren(...scene.paragraphs.map(storyParagraph));
    $('question').textContent = scene.question;
    $('mobile-art').src = art[baseArt(scene)][0];
    $('left-folio').textContent = pageNumber(index);
    $('right-folio').textContent = pageNumber(index) + 1;
    $('progress').textContent = 'Разворот ' + (index + 1) + ' из ' + story.length;
    $('diamonds').replaceChildren(...story.map((_, i) => el('i', i === index ? 'current' : '')));
    $('prev').disabled = index === 0;
    $('next-label').textContent = index === story.length - 1 ? 'К началу' : 'Дальше';
    refreshMark();
    renderPanel();
  }
  function go(id) {
    const target = story.find((item) => item.id === id);
    if (!target) return;
    closeArt();
    closeSheet(false);
    if ($('contents').open) $('contents').close();
    scene = target;
    cueKey = '';
    tab = 'scene';
    resetDirectory();
    remember();
    renderStory();
    window.scrollTo(0, 0);
    $('scene-title').focus({ preventScroll: true });
  }
  function contents() {
    const list = $('contents-list');
    list.replaceChildren();
    chapters.forEach((chapter, chapterIndex) => {
      const group = el('section', 'toc-group', el('h3', '', chapter.numeral + '. ' + chapter.name));
      story.forEach((item, index) => {
        if (item.chapter !== chapterIndex) return;
        const row = button('toc-row', () => go(item.id), item.title);
        if (marks.includes(item.id)) {
          row.append(icon('bookmark'));
          row.setAttribute('aria-label', item.title + ', заложенный разворот');
        }
        row.append(el('span', 'toc-page', String(pageNumber(index)).padStart(2, '0')));
        if (item.id === scene.id) row.setAttribute('aria-current', 'page');
        group.append(row);
      });
      list.append(group);
    });
    $('contents').showModal();
    list.querySelector('[aria-current="page"]').focus();
  }
  const actions = {
    go,
    cue: chooseCue,
    toText,
    enlarge,
    mark,
    saveNote(text) {
      notes[scene.id] = text;
      return write('note.' + scene.id, text);
    },
    person(key) {
      person = key;
      renderPanel();
      panel.querySelector('.directory-list [aria-pressed="true"]').focus({ preventScroll: true });
    },
    place(key) {
      place = key;
      renderPanel();
      $('atlas-place').focus({ preventScroll: true });
    },
  };
  ribbons.addEventListener('click', (event) => {
    const target = event.target.closest('[data-tab]');
    if (target) chooseTab(target.dataset.tab, target);
  });
  $('mobile-plate').addEventListener('click', () => chooseTab('scene', $('mobile-plate')));
  $('contents-button').addEventListener('click', contents);
  $('mark-page').addEventListener('click', () => {
    mark();
    if (tab === 'notes') renderPanel();
  });
  $('size-button').addEventListener('click', () => {
    large = !large;
    write('large', large ? '1' : '');
    refreshSize();
  });
  $('prev').addEventListener('click', () => go(story[story.indexOf(scene) - 1]?.id));
  $('next').addEventListener('click', () =>
    go(story[(story.indexOf(scene) + 1) % story.length].id),
  );
  function dismiss(dialog) {
    if (dialog === sheet) closeSheet();
    else if (dialog === lightbox) closeArt();
    else dialog.close();
  }
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.querySelector('[data-close]').addEventListener('click', () => dismiss(dialog));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dismiss(dialog);
    });
    dialog.addEventListener('click', (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dismiss(dialog);
    });
  });
  mobile.addEventListener('change', () => {
    if (!mobile.matches && sheet.open) {
      closeArt();
      closeSheet();
    }
  });
  resetDirectory();
  refreshSize();
  renderStory();
})();
