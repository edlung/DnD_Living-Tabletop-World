// All times are relative to the visible contact. A single late metallic ring is the clue.
(() => {
  let audio,
    clock = 0,
    voices = [],
    effects = [];
  function clear() {
    clock++;
    for (const v of voices) {
      try {
        v.stop();
      } catch {
        /* already decayed */
      }
    }
    voices = [];
    for (const animation of effects) animation.cancel();
    effects = [];
  }
  async function enable() {
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      audio ??= new Context();
      await audio.resume();
      return audio.state === 'running';
    } catch {
      return false;
    }
  }
  function chime(when) {
    if (audio?.state !== 'running') return;
    for (const [pitch, level, decay] of [
      [487, 0.13, 1.3],
      [1293, 0.06, 0.95],
      [2094, 0.024, 0.62],
      [3351, 0.016, 0.3],
    ]) {
      const v = audio.createOscillator(),
        g = audio.createGain();
      v.type = 'sine';
      v.frequency.value = pitch;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(level, when + 0.007);
      g.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      v.connect(g).connect(audio.destination);
      v.onended = () => {
        v.disconnect();
        g.disconnect();
      };
      v.start(when);
      v.stop(when + decay + 0.02);
      voices.push(v);
    }
  }
  async function play(root, sound) {
    clear();
    const run = clock,
      hammer = root.querySelector('.hammer-art');
    if (!hammer) return;
    await Promise.allSettled(
      [...root.querySelectorAll('.forge-plane img')].map((img) => img.decode()),
    );
    if (run !== clock || !hammer.isConnected) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hit = 900,
      echo = hit + 1000;
    if (!reduced)
      effects.push(
        hammer.animate(
          [
            { transform: 'rotate(9deg)', offset: 0 },
            { transform: 'rotate(20deg)', offset: 0.45 },
            { transform: 'rotate(0deg)', offset: 0.75 },
            { transform: 'rotate(6deg)', offset: 0.88 },
            { transform: 'rotate(9deg)', offset: 1 },
          ],
          { duration: 1200, easing: 'linear' },
        ),
      );
    effects.push(
      root
        .querySelector('.forge-contact')
        .animate([{ opacity: 0 }, { opacity: 0.8, offset: 0.17 }, { opacity: 0 }], {
          duration: 190,
          delay: hit,
        }),
    );
    effects.push(
      root.querySelector('.forge-echo').animate(
        [
          { opacity: 0, transform: 'scale(.35)' },
          { opacity: 0.65, offset: 0.28 },
          { opacity: 0, transform: reduced ? 'scale(.35)' : 'scale(1.65)' },
        ],
        { duration: 650, delay: echo },
      ),
    );
    if (sound && audio?.state === 'running') chime(audio.currentTime + echo / 1000);
  }
  window.LighthouseForge = { enable, play, clear, sounding: () => audio?.state === 'running' };
})();
