// Interface glyphs. Illustrations, painted miniatures and dice belong to the campaign art.
(() => {
  const strokes = {
    book: '<path d="M3 4.5c3.5-1 6-.4 9 1.5 3-1.9 5.5-2.5 9-1.5v14c-3.5-1-6-.4-9 1.5-3-1.9-5.5-2.5-9-1.5zM12 6v14"/>',
    shelf: '<path d="M3 4h4v15H3zM9 4h4v15H9zM15 5l3.7-1 3 14.5-3.7 1zM2 21h20"/>',
    bookmark: '<path d="M6 3h12v19l-6-4-6 4z"/>',
    quill: '<path d="M3 21l12-12M6 17c-1-7 3-13 10-14l5-.5-1 5C18 14 12 18 6 17zM8 13h5"/>',
    people:
      '<circle cx="9" cy="8" r="3.3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M16 5a3.5 3.5 0 0 1 0 7m2 2a6 6 0 0 1 4 6"/>',
    list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H5m6 6-6-6 6-6"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m5 9 7 7 7-7"/>',
    close: '<path d="m5 5 14 14M19 5 5 19"/>',
    dice: '<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 4 9-4M12 11v11"/><path d="m7 5 9 4"/>',
    map: '<path d="m2 5 6-2 8 3 6-2v15l-6 2-8-3-6 2zM8 3v15m8-12v15"/>',
    swords:
      '<path d="m3 2 4 1 11 12-3 3L4 6zM14 19l6-6m-3 4 4 4M20 3l-4 1-3 4M8 13l-3 4m-2-3 6 6m-3-3-4 4"/>',
    monitor: '<rect x="2" y="3.5" width="20" height="14" rx="2"/><path d="M8 21h8m-4-3v3"/>',
    expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M5 12h14m-7-7v14"/>',
    grid: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
    pin: '<path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    volume: '<path d="M3 9v6h4l5 4V5L7 9zM16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    flag: '<path d="M5 22V3c4-3 10 3 15 0v11c-5 3-11-3-15 0"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 7-2.5 6.5L7 17l3-7z"/>',
    token:
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="2.5"/><path d="M7 17c1-4 9-4 10 0"/>',
    replay: '<path d="M3 4v6h6M4 10a8 8 0 1 1 2 9"/>',
  };
  window.shelfIcon = (name) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true">' +
    strokes[name] +
    '</svg>';
})();
