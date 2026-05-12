// Fetch wrapper unificado. Requiere window.tagger (state.js).
(function () {
  async function api(path, opts = {}) {
    const headers = {
      'content-type': 'application/json',
      ...(opts.headers ?? {}),
    };
    if (window.tagger?.apiKey) headers['x-api-key'] = window.tagger.apiKey;

    const url = (window.tagger?.baseUrl ?? '') + path;
    let res;
    try {
      res = await fetch(url, { ...opts, headers });
    } catch (e) {
      const err = new Error(`network_error: ${e instanceof Error ? e.message : String(e)}`);
      err.networkError = true;
      throw err;
    }
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { _raw: text };
    }
    if (!res.ok) {
      const err = new Error(typeof body?.error === 'string' ? body.error : `http_${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  window.taggerApi = api;
})();
