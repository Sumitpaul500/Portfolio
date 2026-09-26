const SITE_URL = process.env.SITE_URL || 'https://sumitpaul-portfolio.vercel.app';

async function fetchCheck(name, url, options = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: AbortSignal.timeout(options.timeoutMs || 20000),
    });
    const elapsedMs = Date.now() - started;
    const expectedStatus = options.expectedStatus;

    if (expectedStatus !== undefined) {
      if (res.status !== expectedStatus) {
        return {
          name,
          url,
          ok: false,
          elapsedMs,
          error: `Expected HTTP ${expectedStatus}, got ${res.status}`,
        };
      }
    } else if (!res.ok) {
      return {
        name,
        url,
        ok: false,
        elapsedMs,
        error: `HTTP ${res.status}`,
      };
    }

    if (options.validateJson) {
      const data = await res.json();
      if (!options.validateJson(data)) {
        return {
          name,
          url,
          ok: false,
          elapsedMs,
          error: 'Unexpected JSON response',
        };
      }
    }

    return { name, url, ok: true, elapsedMs };
  } catch (err) {
    return {
      name,
      url,
      ok: false,
      elapsedMs: Date.now() - started,
      error: err.message || String(err),
    };
  }
}

async function runSiteChecks(baseUrl = SITE_URL) {
  const origin = baseUrl.replace(/\/$/, '');
  const checks = await Promise.all([
    fetchCheck('Homepage', `${origin}/`),
    fetchCheck('Health API', `${origin}/api/health`, {
      validateJson: (data) => data && data.status === 'ok',
    }),
    fetchCheck('Contact API', `${origin}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      expectedStatus: 400,
    }),
  ]);

  const failures = checks.filter((c) => !c.ok);
  return {
    ok: failures.length === 0,
    checkedAt: new Date().toISOString(),
    siteUrl: origin,
    checks,
    failures,
  };
}

module.exports = { runSiteChecks, SITE_URL };
