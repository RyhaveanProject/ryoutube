import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Search as SearchIcon, X, Clock, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import VideoCard, { VideoCardSkeleton } from "../components/VideoCard";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import {
  getHistory, addHistory, removeHistory, clearHistory,
} from "../lib/searchHistory";

/**
 * Search page — debounced live search, infinite scroll, search history.
 *
 *  - 250ms debounce on input changes; URL is only updated when the user
 *    presses Enter or selects a history/suggestion item, so back/forward
 *    isn't polluted with intermediate states.
 *  - History is stored in localStorage (lib/searchHistory). It surfaces
 *    when the input is focused with no query.
 *  - Infinite scroll: extra pages are appended via IntersectionObserver
 *    on a sentinel element at the bottom of the list.
 */
const PAGE_SIZE = 24;
const DEBOUNCE_MS = 250;

export default function Search() {
  const [params, setParams] = useSearchParams();
  const urlQ = params.get("q") || "";
  const [input, setInput] = useState(urlQ);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(0);
  const [history, setHistory] = useState(() => getHistory());
  const [showHistory, setShowHistory] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const debounceRef = useRef(null);
  const sentinelRef = useRef(null);
  const inputRef = useRef(null);
  const reqId = useRef(0);

  // Sync input when URL query changes (e.g. clicked from sidebar/chip)
  useEffect(() => { setInput(urlQ); }, [urlQ]);

  // ---- Debounced suggestion fetch (lightweight) ----
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!input.trim()) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/suggest", { params: { q: input } });
        setSuggestions(data?.suggestions || []);
      } catch { setSuggestions([]); }
    }, DEBOUNCE_MS);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [input]);

  // ---- Search executor (full result fetch) ----
  const runSearch = useCallback(async (q, pageIdx) => {
    if (!q) return;
    const myId = ++reqId.current;
    setLoading(true);
    try {
      const { data } = await api.get("/search", {
        params: { q, limit: PAGE_SIZE, offset: pageIdx * PAGE_SIZE },
      });
      if (myId !== reqId.current) return; // stale
      const next = data?.results || [];
      setItems((prev) => (pageIdx === 0 ? next : [...prev, ...next]));
      setHasMore(next.length >= PAGE_SIZE);
    } catch {
      if (myId === reqId.current) {
        if (pageIdx === 0) setItems([]);
        setHasMore(false);
      }
    } finally {
      if (myId === reqId.current) setLoading(false);
    }
  }, []);

  // First page when URL query changes
  useEffect(() => {
    setPage(0); setItems([]); setHasMore(false);
    if (!urlQ) return;
    addHistory(urlQ);
    setHistory(getHistory());
    runSearch(urlQ, 0);
  }, [urlQ, runSearch]);

  // ---- Infinite scroll ----
  useEffect(() => {
    if (!hasMore || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        const next = page + 1;
        setPage(next);
        runSearch(urlQ, next);
      }
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, page, urlQ, runSearch]);

  const submit = (e) => {
    e?.preventDefault?.();
    const v = (input || "").trim();
    if (!v) return;
    setShowHistory(false);
    inputRef.current?.blur?.();
    setParams({ q: v });
  };

  const pickHistory = (q) => {
    setInput(q);
    setShowHistory(false);
    setParams({ q });
  };

  const dropHistoryItem = (e, q) => {
    e.stopPropagation(); e.preventDefault();
    removeHistory(q);
    setHistory(getHistory());
  };

  const clearAllHistory = () => {
    clearHistory();
    setHistory([]);
  };

  const showHistoryDropdown = showHistory && !input.trim() && history.length > 0;
  const showSuggestionsDropdown = showHistory && input.trim().length > 0 && suggestions.length > 0;

  return (
    <div className="px-3 sm:px-6 py-4 max-w-5xl mx-auto" data-testid="search-page">
      {/* Mobile-first search bar — sticky inside the page (works in
          both portrait and landscape, never clipped) */}
      <form onSubmit={submit} className="flex gap-2 mb-4 relative" data-testid="search-form">
        <div className="flex-1 relative min-w-0">
          <Input
            ref={inputRef}
            autoFocus={!urlQ}
            value={input}
            onChange={(e) => { setInput(e.target.value); setShowHistory(true); }}
            onFocus={() => setShowHistory(true)}
            onBlur={() => setTimeout(() => setShowHistory(false), 200)}
            placeholder="Search videos, music, films, live"
            className="ryh-input ryh-allow-copy h-11 w-full bg-neutral-900 border-neutral-700 text-white pr-10"
            data-testid="search-page-input"
          />
          {input && (
            <button
              type="button"
              onClick={() => { setInput(""); inputRef.current?.focus?.(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10"
              data-testid="search-clear-btn"
              aria-label="Clear"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* History dropdown */}
          {showHistoryDropdown && (
            <div
              className="absolute top-12 left-0 right-0 ryh-glass rounded-xl border border-white/10 shadow-2xl z-40 overflow-hidden"
              data-testid="search-history-dropdown"
            >
              <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
                <span className="text-[12px] uppercase tracking-wider text-neutral-400">Recent searches</span>
                <button
                  type="button"
                  onMouseDown={clearAllHistory}
                  className="text-[12px] text-neutral-300 hover:text-white inline-flex items-center gap-1"
                  data-testid="search-history-clear-all"
                >
                  <Trash2 className="w-3 h-3" /> Clear all
                </button>
              </div>
              {history.slice(0, 8).map((it) => (
                <button
                  key={it.q}
                  type="button"
                  onMouseDown={() => pickHistory(it.q)}
                  className="flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-white/10 text-white"
                  data-testid={`search-history-item-${it.q}`}
                >
                  <Clock className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="flex-1 text-[14px] truncate">{it.q}</span>
                  <span
                    onMouseDown={(e) => dropHistoryItem(e, it.q)}
                    className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/10"
                    data-testid={`search-history-remove-${it.q}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Suggestion dropdown */}
          {showSuggestionsDropdown && (
            <div
              className="absolute top-12 left-0 right-0 ryh-glass rounded-xl border border-white/10 shadow-2xl z-40 overflow-hidden"
              data-testid="search-suggestions-dropdown"
            >
              {suggestions.slice(0, 8).map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={() => pickHistory(s)}
                  className="flex items-center gap-3 w-full text-left px-4 py-2 hover:bg-white/10 text-white"
                  data-testid={`search-suggestion-${s}`}
                >
                  <SearchIcon className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="flex-1 text-[14px] truncate">{s}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          type="submit"
          className="bg-red-600 hover:bg-red-700 h-11 shrink-0 px-4"
          data-testid="search-page-submit"
          aria-label="Search"
        >
          <SearchIcon className="w-4 h-4" />
        </Button>
      </form>

      {!urlQ && (
        <div className="text-center py-20 text-neutral-400" data-testid="search-empty-state">
          <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Search for videos, music, films, live streams</p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((v) => (
          <VideoCard key={`${v.id}-${v._k || ""}`} video={v} layout="row" />
        ))}

        {loading && Array.from({ length: 6 }).map((_, i) => (
          <div key={`s-${i}`} className="flex gap-3">
            <div className="w-40 sm:w-48 aspect-video ryh-skeleton rounded-lg" />
            <div className="flex-1 space-y-2 py-2">
              <div className="h-4 ryh-skeleton rounded w-3/4" />
              <div className="h-3 ryh-skeleton rounded w-1/2" />
              <div className="h-3 ryh-skeleton rounded w-1/3" />
            </div>
          </div>
        ))}

        {!loading && items.length === 0 && urlQ && (
          <div className="text-center py-20 text-neutral-400" data-testid="search-no-results">
            No results for &quot;{urlQ}&quot;
          </div>
        )}

        {/* Infinite-scroll sentinel */}
        {hasMore && <div ref={sentinelRef} className="h-10" data-testid="search-sentinel" />}
      </div>
    </div>
  );
}
