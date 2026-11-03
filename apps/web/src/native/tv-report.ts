import {
  CAMPAIGN_ID,
  nativeShell,
  onShellMessage,
  PAIRING_CODE,
  type NativeShell,
} from './shell.ts';

/**
 * The table display hosted by LTW DM on its TV (docs/adr/0070-native-apps.md §6) tells the app
 * what it shows: the code waiting for the DM, paired, or neither. Only in that window: a TV's own
 * browser, or the DM's page, never sends these.
 */
export type HostReport =
  | { readonly kind: 'pairing'; readonly code: string }
  | { readonly kind: 'paired'; readonly campaign: string }
  | null;

export function reportToHost(report: HostReport, shell: NativeShell | null = nativeShell()): void {
  if (shell?.app !== 'tv') return;
  if (report?.kind === 'paired' && CAMPAIGN_ID.test(report.campaign)) {
    shell.post({ type: 'tv-paired', campaign: report.campaign });
  } else if (report?.kind === 'pairing' && PAIRING_CODE.test(report.code)) {
    shell.post({ type: 'tv-code', code: report.code });
  } else {
    shell.post({ type: 'tv-unpaired' });
  }
}

/** The TV's own page hears the app ask it to forget its pairing and show a new code (§6). */
export function onForgetAsked(
  forget: () => void,
  shell: NativeShell | null = nativeShell(),
): () => void {
  if (shell?.app !== 'tv') return () => undefined;
  return onShellMessage((message) => {
    if (message.type === 'forget') forget();
  });
}
