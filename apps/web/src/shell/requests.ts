import { useEffect } from 'react';

/**
 * A request from one corner of the screen to another that shares no parent worth threading a
 * callback through: the guide asks for the chat's word to the DM; the DM's checklist asks for the
 * guide. A window event, nothing kept: a request nobody listens for is dropped.
 */
export type ScreenRequest = 'chat-to-dm' | 'dm-guide';

const NAME = 'ltw:screen-request';

export function askScreen(request: ScreenRequest): void {
  window.dispatchEvent(new CustomEvent<ScreenRequest>(NAME, { detail: request }));
}

/** Calls `handler` whenever `request` is asked for. */
export function useScreenRequest(request: ScreenRequest, handler: () => void): void {
  useEffect(() => {
    const heard = (event: Event) => {
      if ((event as CustomEvent<ScreenRequest>).detail === request) handler();
    };
    window.addEventListener(NAME, heard);
    return () => {
      window.removeEventListener(NAME, heard);
    };
  }, [request, handler]);
}
