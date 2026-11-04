/**
 * A recording stand-in for the browser's audio context (docs/adr/0059-atmosphere.md; work order:
 * audio is checked by what plays and how loud, never by ear): it lists every node, every start and
 * stop, and every change of a level, so a test reads the graph a sound builds.
 */
export class Param {
  readonly events: { readonly kind: string; readonly value: number; readonly at: number }[] = [];
  value: number;
  constructor(value: number) {
    this.value = value;
  }
  setValueAtTime(value: number, at: number) {
    this.events.push({ kind: 'set', value, at });
    this.value = value;
  }
  linearRampToValueAtTime(value: number, at: number) {
    this.events.push({ kind: 'ramp', value, at });
  }
  exponentialRampToValueAtTime(value: number, at: number) {
    this.events.push({ kind: 'exp', value, at });
  }
  setTargetAtTime(value: number, at: number) {
    this.events.push({ kind: 'target', value, at });
  }
  cancelScheduledValues(at: number) {
    this.events.push({ kind: 'cancel', value: 0, at });
  }
}

export class Node {
  readonly outputs: Node[] = [];
  disconnected = false;
  connect<T extends Node>(to: T): T {
    this.outputs.push(to);
    return to;
  }
  disconnect() {
    this.disconnected = true;
  }
}

export class Gain extends Node {
  readonly gain = new Param(1);
}
export class Filter extends Node {
  type = 'lowpass';
  readonly frequency = new Param(350);
  readonly Q = new Param(1);
}
export class Panner extends Node {
  readonly pan = new Param(0);
}
/** A buffer source or an oscillator: `buffer` is null for a tone. */
export class Source extends Node {
  buffer: { readonly length: number } | null = null;
  loop = false;
  readonly playbackRate = new Param(1);
  readonly frequency = new Param(440);
  type = 'sine';
  started: number | null = null;
  stopped: number | null = null;
  onended: (() => void) | null = null;
  start(at = 0) {
    this.started = at;
  }
  stop(at = 0) {
    this.stopped = at;
  }
}

export const RATE = 8000;

export class FakeAudioContext {
  currentTime = 0;
  readonly sampleRate = RATE;
  readonly nodes: Node[] = [];
  #made<T extends Node>(node: T): T {
    this.nodes.push(node);
    return node;
  }
  createGain = () => this.#made(new Gain());
  createBiquadFilter = () => this.#made(new Filter());
  createStereoPanner = () => this.#made(new Panner());
  createBufferSource = () => this.#made(new Source());
  createOscillator = () => this.#made(new Source());
  createBuffer = (_channels: number, length: number) => ({ length, copyToChannel: () => {} });
  /** Its sources, or those playing a buffer of one length. */
  sources = (length?: number) =>
    this.nodes.filter(
      (node): node is Source =>
        node instanceof Source && (length === undefined || node.buffer?.length === length),
    );
  /** Its tones. */
  tones = () => this.sources().filter((node) => node.buffer === null);
  /** As the code under test takes it. */
  get audio(): BaseAudioContext {
    return this as unknown as BaseAudioContext;
  }
}
