(() => {
  const paths = {
    book: '<path d="M3 5c3.3-.7 6.2 0 9 2 2.8-2 5.7-2.7 9-2v14c-3.3-.7-6.2 0-9 2-2.8-2-5.7-2.7-9-2zM12 7v14"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.1M3 12h.1M3 18h.1"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16.5 7.5-3 6-6 3 3-6z"/>',
    pin: '<path d="M19 10c0 5-7 11-7 11s-7-6-7-11a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/>',
    bookmark: '<path d="M6 3h12v17l-6-4-6 4z"/>',
    talk: '<path d="M20 11a7.6 7.6 0 0 1-8 7 12 12 0 0 1-3-.4L4 20l1.2-5A6.6 6.6 0 0 1 4 11c0-3.9 3.6-7 8-7s8 3.1 8 7Z"/><path d="M8.5 10h7M8.5 13h4"/>',
    quill: '<path d="M3 21 15 9M6 16C6 9 13 3 21 3c-.6 6-4 12-11 14l-4-1ZM15 11h3M5 21h7"/>',
    people:
      '<circle cx="9" cy="8" r="3.3"/><path d="M2.5 20v-2.1a6.4 6.4 0 0 1 13 0V20M16 5a3.2 3.2 0 0 1 0 6.2M17.5 14c2.5.5 4 2.1 4 5"/>',
    eye: '<path d="M2 12s3.8-6.2 10-6.2 10 6.2 10 6.2-3.8 6.2-10 6.2S2 12 2 12Z"/><circle cx="12" cy="12" r="2.7"/>',
    die: '<path d="m12 2 9.5 5.3v10L12 22l-9.5-4.7v-10Zm0 0L7 15h10Zm-9.5 5.3L7 15l5 7 5-7 4.5-7.7"/>',
    swords:
      '<path d="m4 3 3 1 11 12-2 2L4 6zM3 20l4-4m-2-2 5 5m8-5 3 3m-3-1 3 4M13 9l4-5 3-1v3l-5 6m-5 2-3 4"/>',
    fork: '<path d="M12 21v-6L6 9V4m0 0L3 7m3-3 3 3m3 8 6-6V4m0 0-3 3m3-3 3 3"/>',
    bell: '<path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5zM10 20a2.2 2.2 0 0 0 4 0M12 2v2"/>',
    expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/>',
    arrowLeft: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    arrowRight: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
  };

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const attributes = {
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.65',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      class: 'icon',
      'aria-hidden': 'true',
      focusable: 'false',
    };
    for (const [key, value] of Object.entries(attributes)) svg.setAttribute(key, value);
    svg.innerHTML = paths[name];
    return svg;
  }
  function el(tag, className, ...children) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...children);
    return node;
  }
  function button(className, action, ...children) {
    const node = el('button', className, ...children);
    node.type = 'button';
    node.addEventListener('click', () => action(node));
    return node;
  }
  function photo(key, className = '') {
    const [src, alt] = window.dmLibrary.art[key];
    const img = el('img', className);
    img.src = src;
    img.alt = alt;
    return img;
  }
  function illustration(base, selected, index, enlarge) {
    const { art } = window.dmLibrary;
    const [, caption, ink, format] = art[selected];
    const inset = format === 'inset';
    const picture =
      ink === 'atlas' && selected !== base
        ? el('span', 'chart-pair', photo(base, 'place-view'), photo(selected, 'plan-view'))
        : photo(
            inset ? base : selected,
            ink === 'atlas' ? 'illustration region-map' : 'illustration',
          );
    const plate = el('div', 'plate-frame', picture);
    if (inset) plate.append(el('span', 'inset-art', photo(selected)));
    const magnify = button('magnify', (node) => enlarge(selected, node), icon('expand'));
    magnify.setAttribute('aria-label', 'Увеличить иллюстрацию «' + caption + '»');
    plate.append(magnify);
    return el(
      'figure',
      'engraving',
      plate,
      el(
        'figcaption',
        '',
        el('span', 'plate-number', 'Ил. ' + String(index + 1).padStart(2, '0')),
        caption,
      ),
    );
  }
  function baseArt(scene) {
    const { chapters, places } = window.dmLibrary;
    return scene.art || places[scene.place][2] || chapters[scene.chapter].art;
  }
  document.querySelectorAll('[data-icon]').forEach((node) => node.append(icon(node.dataset.icon)));
  window.dmElements = { el, button, icon, photo, illustration, baseArt };
})();
