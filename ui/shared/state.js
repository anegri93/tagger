// Singleton config compartido entre UIs. Cargar antes de api.js y nav.js.
(function () {
  const LS_KEY = 'tagger:config:v1';
  const listeners = new Set();

  function load() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
  function save(o) {
    localStorage.setItem(LS_KEY, JSON.stringify(o));
  }

  const stored = load();
  const defaultBase = window.location.origin.startsWith('http')
    ? window.location.origin
    : 'http://localhost:3000';

  const tagger = {
    baseUrl: stored.baseUrl ?? defaultBase,
    apiKey: stored.apiKey ?? '',
    setApiKey(k) {
      this.apiKey = k;
      save({ baseUrl: this.baseUrl, apiKey: k });
      emit('apiKey', k);
    },
    setBaseUrl(u) {
      this.baseUrl = u;
      save({ baseUrl: u, apiKey: this.apiKey });
      emit('baseUrl', u);
    },
    on(event, cb) {
      const wrapped = (e) => {
        if (e.event === event) cb(e.value);
      };
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
  };

  function emit(event, value) {
    for (const l of listeners) l({ event, value });
  }

  // Sincronización entre tabs
  window.addEventListener('storage', (e) => {
    if (e.key === LS_KEY && e.newValue) {
      try {
        const next = JSON.parse(e.newValue);
        if (next.apiKey !== tagger.apiKey) {
          tagger.apiKey = next.apiKey;
          emit('apiKey', next.apiKey);
        }
        if (next.baseUrl !== tagger.baseUrl) {
          tagger.baseUrl = next.baseUrl;
          emit('baseUrl', next.baseUrl);
        }
      } catch {}
    }
  });

  window.tagger = tagger;
})();
