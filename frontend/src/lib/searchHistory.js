/**
 * Search history — localStorage backed.
 * Stores the latest 25 user queries with timestamps. New queries bubble
 * to the top, duplicates are de-duplicated case-insensitively.
 */
const KEY = "ryh_search_history_v1";
const MAX = 25;

function read() {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(arr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(arr.slice(0, MAX)));
  } catch {}
}

export function getHistory() {
  return read();
}

export function addHistory(q) {
  const v = (q || "").trim();
  if (!v) return;
  const lower = v.toLowerCase();
  const next = [
    { q: v, ts: Date.now() },
    ...read().filter((it) => (it.q || "").toLowerCase() !== lower),
  ];
  write(next);
}

export function removeHistory(q) {
  const lower = (q || "").toLowerCase();
  write(read().filter((it) => (it.q || "").toLowerCase() !== lower));
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch {}
}
