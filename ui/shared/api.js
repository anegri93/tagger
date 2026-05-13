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
      err.userMessage = 'No se pudo conectar con la API. Revisá la red o el host.';
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
      const message =
        (typeof body?.error === 'string' && body.error) ||
        body?.error?.message ||
        body?.message ||
        `HTTP ${res.status}`;
      const err = new Error(message);
      err.status = res.status;
      err.body = body;
      err.userMessage = formatUserMessage(res.status, message);
      throw err;
    }
    return body;
  }

  function formatUserMessage(status, message) {
    if (status === 401 || status === 403) return 'API key inválida o sin permisos.';
    if (status === 404) return 'Recurso no encontrado.';
    if (status === 409) return `Conflicto: ${message}`;
    if (status === 422) return `Validación: ${message}`;
    if (status >= 500) return `Error del servidor (${status}). Reintentá en unos segundos.`;
    return message;
  }

  // Wrapper UI: muestra toast on error con botón Reintentar.
  async function apiWithToast(path, opts) {
    try {
      return await api(path, opts);
    } catch (err) {
      const msg = err.userMessage || err.message;
      if (window.toast) {
        window.toast.error(msg, {
          action: { label: 'Reintentar', onClick: () => apiWithToast(path, opts) },
        });
      }
      throw err;
    }
  }

  window.taggerApi = api;
  window.taggerApiSafe = apiWithToast;
})();
