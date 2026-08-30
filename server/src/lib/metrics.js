// عدادات صحة النظام: زمن استجابة النموذج، الأخطاء، إعادة المحاولة، وأحداث حديثة
// ذاكرة داخلية تُصفَّر يدويًا ولا تُكتب في قاعدة البيانات.

const state = {
  startTime: Date.now(),
  calls: 0,
  ok: 0,
  errors: 0,
  retries: 0,
  totalMs: 0,
  byModel: new Map(),
  bySource: new Map(),
  recent: [],
  maxRecent: 150,
};

function inc(map, key, { ms, ok, retries }) {
  const e = map.get(key) || { calls: 0, ok: 0, errors: 0, retries: 0, totalMs: 0 };
  e.calls += 1;
  e.ok += ok ? 1 : 0;
  e.errors += ok ? 0 : 1;
  e.retries += retries;
  e.totalMs += ms;
  map.set(key, e);
}

export function recordAiCall({ model = 'unknown', source = 'generic', ms = 0, ok = false, retries = 0 }) {
  state.calls += 1;
  state.ok += ok ? 1 : 0;
  state.errors += ok ? 0 : 1;
  state.retries += retries;
  state.totalMs += ms;
  inc(state.byModel, model, { ms, ok, retries });
  inc(state.bySource, source, { ms, ok, retries });
  state.recent.push({
    ts: new Date().toISOString(),
    model,
    source,
    ms: Math.round(ms),
    ok,
    retries,
  });
  if (state.recent.length > state.maxRecent) state.recent = state.recent.slice(-state.maxRecent);
}

function serialize(map) {
  return [...map.entries()].map(([key, e]) => ({
    key,
    calls: e.calls,
    ok: e.ok,
    errors: e.errors,
    retries: e.retries,
    avgMs: e.calls ? Math.round(e.totalMs / e.calls) : 0,
  }));
}

export function aiMetricsSnapshot() {
  const avgMs = state.calls ? Math.round(state.totalMs / state.calls) : 0;
  const successRate = state.calls ? Math.round((state.ok / state.calls) * 100) : 100;
  return {
    uptimeS: Math.round((Date.now() - state.startTime) / 1000),
    calls: state.calls,
    ok: state.ok,
    errors: state.errors,
    retries: state.retries,
    totalMs: state.totalMs,
    avgMs,
    successRate,
    byModel: serialize(state.byModel),
    bySource: serialize(state.bySource),
    recent: state.recent.slice(-30).reverse(),
  };
}

export function resetAiMetrics() {
  state.calls = 0;
  state.ok = 0;
  state.errors = 0;
  state.retries = 0;
  state.totalMs = 0;
  state.byModel.clear();
  state.bySource.clear();
  state.recent.length = 0;
  return aiMetricsSnapshot();
}