import { describe, expect, it } from 'vitest';

import { clientGroup, isLoopbackHost, parseAddress, parseTrustedProxies } from './addresses.ts';

/**
 * Addresses for configuration and limits (docs/adr/0036-production-sign-in.md, amendment
 * 2026-10-16): strict parsing, IPv4-mapped clients as IPv4, IPv6 clients grouped per /64.
 */
describe('parsing an address', () => {
  it('reads IPv4 and IPv6 strictly, mapped IPv4 as IPv4', () => {
    expect(parseAddress('198.51.100.7')).toEqual({ version: 4, bytes: [198, 51, 100, 7] });
    expect(parseAddress('::ffff:198.51.100.7')).toEqual({ version: 4, bytes: [198, 51, 100, 7] });
    expect(parseAddress('2001:db8::1')).toEqual({
      version: 6,
      hextets: [0x2001, 0xdb8, 0, 0, 0, 0, 0, 1],
    });
    expect(parseAddress('::')).toEqual({ version: 6, hextets: [0, 0, 0, 0, 0, 0, 0, 0] });
    for (const bad of ['', '010.0.0.1', '1.2.3', '256.1.1.1', '[::1]', 'fe80::1%eth0', 'abc']) {
      expect(parseAddress(bad), bad).toBeNull();
    }
  });
});

describe('a loopback host', () => {
  it('is localhost, 127.0.0.0/8 or ::1, and nothing else', () => {
    for (const host of ['localhost', 'LOCALHOST', '127.0.0.1', '127.1.2.3', '::1', '[::1]']) {
      expect(isLoopbackHost(host), host).toBe(true);
    }
    for (const host of ['0.0.0.0', '::', '192.168.1.5', '10.0.0.1', 'table.example', '::2']) {
      expect(isLoopbackHost(host), host).toBe(false);
    }
  });
});

describe('the group a client is limited as', () => {
  it('is the IPv4 address, or the /64 of an IPv6 address', () => {
    expect(clientGroup('198.51.100.7')).toBe('198.51.100.7');
    expect(clientGroup('::ffff:198.51.100.7')).toBe('198.51.100.7');
    expect(clientGroup('2001:db8:1:2::17')).toBe('2001:db8:1:2::/64');
    expect(clientGroup('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe('2001:db8:1:2::/64');
    expect(clientGroup('2001:db8:1:3::17')).toBe('2001:db8:1:3::/64');
    expect(clientGroup('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });

  it('is one shared group for anything that is not an address', () => {
    for (const value of [undefined, '', 'unknown', '1.2.3.4.5', '[::1]']) {
      expect(clientGroup(value)).toBe('unknown');
    }
  });
});

describe('the trusted proxy setting', () => {
  it('is none, or addresses and ranges of the proxy', () => {
    expect(parseTrustedProxies('none')).toEqual([]);
    expect(parseTrustedProxies('127.0.0.1')).toEqual(['127.0.0.1']);
    expect(parseTrustedProxies(' 10.0.0.0/8 , ::1,fd00::/8 ')).toEqual([
      '10.0.0.0/8',
      '::1',
      'fd00::/8',
    ]);
  });

  it('refuses anything else, and a range of every address', () => {
    for (const value of [
      '',
      'all',
      'loopback',
      'none,127.0.0.1',
      '127.0.0.1,',
      '0.0.0.0/0',
      '::/0',
      '10.0.0.0/33',
      '2001:db8::/129',
      '10.0.0.0/08',
      '10.0.0.0/8/8',
      'fe80::1%eth0',
      '[::1]',
      'true',
    ]) {
      expect(parseTrustedProxies(value), value).toBeNull();
    }
  });
});
