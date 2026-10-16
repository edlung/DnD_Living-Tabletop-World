import { createContext, useContext } from 'react';

import type { Connection } from '../api/client.ts';

/**
 * How this browser is signed in (docs/adr/0036-production-sign-in.md §7): a development
 * persona's token typed into the form, or a production session from an invitation. What
 * differs reads it here: leaving is signing out, and the DM's Players sheet exists only with
 * production sign-in, where its routes exist.
 */
export type SignInKind = Connection['kind'];

export const SignInKindContext = createContext<SignInKind>('persona');

export const useSignInKind = (): SignInKind => useContext(SignInKindContext);
