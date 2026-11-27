(() => {
  let pending;
  function load() {
    if (!pending)
      pending = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'runtime/dice3d.min.js';
        script.onload = () => resolve(window.LighthouseDice3D);
        script.onerror = () => {
          pending = null;
          script.remove();
          reject(new Error('3D engine unavailable'));
        };
        document.head.append(script);
      });
    return pending;
  }
  function surface(sides) {
    return (
      '<div class="dice-stage" data-state="loading" role="group" aria-label="Стол для броска"><span class="ground-shadow" aria-hidden="true"></span><canvas aria-hidden="true"></canvas><img class="loading-die" src="art/item-d' +
      sides +
      '.webp" alt=""><span class="stage-sample" aria-hidden="true"></span></div>'
    );
  }
  function randomSource(seed) {
    let n = seed >>> 0;
    return () => {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      return n / 4294967296;
    };
  }
  function rollValue(sides) {
    const pick = new Uint32Array(1),
      limit = 2 ** 32 - (2 ** 32 % sides);
    do {
      crypto.getRandomValues(pick);
    } while (pick[0] >= limit);
    return 1 + (pick[0] % sides);
  }
  function onSwipe(surface, signal, canRoll, roll) {
    let drag = null;
    const point = (e) => {
      const rect = surface.getBoundingClientRect();
      return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
    };
    surface.addEventListener(
      'pointerdown',
      (e) => {
        if (!canRoll() || e.button !== 0 || !e.isPrimary) return;
        drag = { id: e.pointerId, x: e.clientX, y: e.clientY, from: point(e) };
        surface.setPointerCapture(e.pointerId);
        surface.classList.add('aiming');
      },
      { signal },
    );
    surface.addEventListener(
      'pointerup',
      (e) => {
        if (drag?.id !== e.pointerId) return;
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) >= 12)
          roll({ from: drag.from, to: point(e) });
        drag = null;
        surface.classList.remove('aiming');
      },
      { signal },
    );
    surface.addEventListener(
      'lostpointercapture',
      () => {
        drag = null;
        surface.classList.remove('aiming');
      },
      { signal },
    );
  }
  window.LighthouseDiceAssets = { load, surface, randomSource, rollValue, onSwipe };
})();
