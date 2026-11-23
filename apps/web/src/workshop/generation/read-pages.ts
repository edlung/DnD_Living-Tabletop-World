import { createContext, useContext } from 'react';

/**
 * The pages a generation proposed that the author has read (docs/adr/0075-book-interface.md §13):
 * a step's result counts as read once it was opened for reading. Kept while the draft is open, in
 * memory only — the workshop keeps nothing of a draft in the browser (`workshop/AGENTS.md`).
 */
export const ReadPagesContext = createContext<ReadonlySet<string>>(new Set());

export const pageKey = (jobId: string, ordinal: number) => `${jobId}:${String(ordinal)}`;

export const useReadPages = () => useContext(ReadPagesContext);
