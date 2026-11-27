import { useT } from '@ltw/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { Glyph } from '../visual/glyph.tsx';

/** The table's occasional controls share one place, leaving the stage and its actions in view. */
export function PlayerSettings({ children }: { readonly children: ReactNode }) {
  const t = useT();
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const box = menu.current;
    if (!box) return;
    const leave = (event: PointerEvent) => {
      if (
        box.open &&
        event.target instanceof Node &&
        !box.contains(event.target) &&
        !document.querySelector('dialog:modal')
      )
        box.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (
        !box.open ||
        event.key !== 'Escape' ||
        event.defaultPrevented ||
        document.querySelector('dialog:modal')
      )
        return;
      event.preventDefault();
      box.open = false;
      box.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', leave);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', leave);
      document.removeEventListener('keydown', escape, true);
    };
  }, []);
  return (
    <details className="player-settings" ref={menu}>
      <summary>
        <Glyph name="settings" />
        <span>{t('Table settings')}</span>
      </summary>
      {children}
    </details>
  );
}
