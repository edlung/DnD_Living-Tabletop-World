import { useCallback, useEffect, useRef, useState } from 'react';

/** How long the page must have been visible and focused before a final choice is taken. */
export const DELIBERATE_MS = 500;

/**
 * A final choice — replacing this browser's sign-in — is taken only deliberately
 * (docs/STAGE_340_DESIGN.md "Part B review fixes"): once the page has been visible and focused for
 * `DELIBERATE_MS` without a break, and the person has pointed or pressed a key since the choice
 * appeared. So the rest of a double click, a held or repeated key, or a click meant for what was
 * on screen a moment ago never takes it. Losing visibility or focus starts over.
 */
export class DeliberateChoice {
  readonly #delayMs: number;
  readonly #onChange: (armed: boolean) => void;
  #present = false;
  /** Visible and focused for the whole delay. */
  #settled = false;
  #interacted = false;
  #armed = false;
  #closed = false;
  #timer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: {
    /** Whether the page is visible and focused as the choice appears. */
    readonly present: boolean;
    readonly onChange: (armed: boolean) => void;
    readonly delayMs?: number;
  }) {
    this.#delayMs = options.delayMs ?? DELIBERATE_MS;
    this.#onChange = options.onChange;
    this.presence(options.present);
  }

  /** Whether the choice may be taken now. */
  get armed(): boolean {
    return this.#armed;
  }

  /** The page became visible and focused, or stopped being either. */
  presence(present: boolean): void {
    if (this.#closed || present === this.#present) return;
    this.#present = present;
    this.#settled = false;
    this.#interacted = false;
    this.#stopTimer();
    if (present) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.#settled = true;
        this.#update();
      }, this.#delayMs);
    }
    this.#update();
  }

  /** A pointer or a key; counted only while the page is visible and focused. */
  interaction(): void {
    if (this.#closed || !this.#present) return;
    this.#interacted = true;
    this.#update();
  }

  close(): void {
    this.#closed = true;
    this.#stopTimer();
  }

  #update(): void {
    const armed = this.#present && this.#settled && this.#interacted;
    if (armed === this.#armed) return;
    this.#armed = armed;
    this.#onChange(armed);
  }

  #stopTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }
}

/** What counts as the person pointing or pressing a key. */
const INTERACTIONS = ['pointerdown', 'pointermove', 'keydown'] as const;

/**
 * `DeliberateChoice` over this page while `active`: `armed` for the screen (the control shows
 * itself unavailable until then), `ready()` for the handler, which reads the guard itself so a
 * press in the same moment it changed is judged by the guard, not by the last render.
 */
export function useDeliberateChoice(active: boolean): {
  readonly armed: boolean;
  readonly ready: () => boolean;
} {
  const [armed, setArmed] = useState(false);
  const guard = useRef<DeliberateChoice | null>(null);
  useEffect(() => {
    if (!active) return;
    let focused = document.hasFocus();
    const present = () => document.visibilityState === 'visible' && focused;
    const choice = new DeliberateChoice({ present: present(), onChange: setArmed });
    guard.current = choice;
    const onFocus = (event: FocusEvent) => {
      // Focus moving between elements is not the page gaining or losing focus.
      if (event.target !== window) return;
      focused = event.type === 'focus';
      choice.presence(present());
    };
    const onVisibility = () => {
      choice.presence(present());
    };
    const onInteraction = () => {
      choice.interaction();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    for (const type of INTERACTIONS) window.addEventListener(type, onInteraction, true);
    return () => {
      choice.close();
      guard.current = null;
      setArmed(false);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      for (const type of INTERACTIONS) window.removeEventListener(type, onInteraction, true);
    };
  }, [active]);
  const ready = useCallback(() => guard.current?.armed ?? false, []);
  return { armed, ready };
}
