import { WORKSHOP_COOKIE } from '@ltw/contracts';

import { isToken } from '../auth/tokens.ts';

const attributes = 'Path=/api/workshop; HttpOnly; SameSite=Strict';
export function workshopCookieValues(header: string | undefined): readonly string[] {
  return (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${WORKSHOP_COOKIE}=`))
    .map((part) => part.slice(WORKSHOP_COOKIE.length + 1));
}
export function workshopToken(header: string | undefined): string | null {
  const values = workshopCookieValues(header);
  const token = values[0];
  return values.length === 1 && token !== undefined && isToken(token) ? token : null;
}
export function workshopCookie(token: string, seconds: number, secure: boolean): string {
  return `${WORKSHOP_COOKIE}=${token}; ${attributes}; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}
