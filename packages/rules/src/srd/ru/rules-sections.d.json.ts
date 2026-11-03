import type { KeptRussian } from '../russian.ts';

/** The Russian of the SRD's rules sections (docs/adr/0055-rules-reference-and-toolbox.md §5), by key. */
declare const kept: Readonly<Record<string, KeptRussian>>;
export = kept;
