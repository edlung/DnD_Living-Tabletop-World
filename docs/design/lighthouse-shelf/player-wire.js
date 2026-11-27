// Both ends use opaque, seat-specific invitations. Only the DM owns the table credential.
(() => {
  const seats = ['finn', 'tess', 'asya'];
  const token = () =>
    Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
  const inflight = new Set();
  let leaving = false;
  window.addEventListener('pagehide', () => {
    leaving = true;
    for (const controller of inflight) controller.abort();
  });
  window.addEventListener('pageshow', () => {
    leaving = false;
  });
  function apiOrigin() {
    if (!/^https?:$/.test(location.protocol)) return null;
    if (['localhost', '127.0.0.1'].includes(location.hostname) && location.port === '4186')
      return location.protocol + '//127.0.0.1:4187';
    return location.origin;
  }
  async function api(path, key, body) {
    const origin = apiOrigin();
    if (!origin || leaving) throw new Error('offline');
    const controller = new AbortController();
    inflight.add(controller);
    const timeout = setTimeout(() => controller.abort(), 3500);
    try {
      const response = await fetch(origin + '/_players/' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(String(response.status));
      return await response.json();
    } finally {
      clearTimeout(timeout);
      inflight.delete(controller);
    }
  }
  window.LighthouseWire = { seats, token, api, apiOrigin };
})();
