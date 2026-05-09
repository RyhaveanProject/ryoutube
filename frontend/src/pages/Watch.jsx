import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { ThumbsUp, ThumbsDown, Clock, Share2, Loader2, ChevronDown } from "lucide-react";
import { api } from "../lib/api";
import VideoCard from "../components/VideoCard";
import { Button } from "../components/ui/button";
import { formatViews } from "../lib/format";
import { toast, Toaster } from "sonner";
import { usePlayer, PlayerSlot } from "../lib/player";

export default function Watch() {
  const { id } = useParams();
  const player = usePlayer();
  const [meta, setMeta] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  // Description is collapsed by default — every time the page loads
  // or the user navigates to a new video. Tapping the header toggles.
  const [descOpen, setDescOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setMeta(null);
    try {
      const [s, r, l, vMeta] = await Promise.all([
        api.get(`/stream/${id}`),
        api.get(`/recommendations`, { params: { video_id: id } }),
        api.get(`/likes`).catch(() => ({ data: { ids: [] } })),
        api.get(`/video/${id}`).catch(() => ({ data: {} })),
      ]);
      const merged = { ...(s.data || {}), ...(vMeta.data || {}) };
      if (vMeta.data && vMeta.data.title) merged.title = vMeta.data.title;
      if (vMeta.data && vMeta.data.channel) merged.channel = vMeta.data.channel;
      if (vMeta.data && vMeta.data.description) merged.description = vMeta.data.description;
      setMeta(merged);
      setRecs(r.data?.results || []);
      setLiked((l.data?.ids || []).includes(id));
      const wl = await api.get(`/watch-later`).catch(() => ({ data: { items: [] } }));
      setSaved((wl.data?.items || []).some((x) => x.video_id === id));

      player.open({
        id,
        title: merged.title || "",
        channel: merged.channel || "",
        thumbnail: merged.thumbnail || "",
        embed_url: merged.embed_url || s.data?.embed_url || "",
      });
    } catch (e) {
      toast.error("Failed to load video");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Always reset scroll to top when switching videos so the new
  // player isn't off-screen and the layout is predictable. Also
  // collapse the description (matches real YouTube behaviour where
  // the description is closed every time you open a video).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
    setDescOpen(false);
    load();
  }, [load]);

  // Lightweight history pings
  useEffect(() => {
    if (!meta) return;
    const t = setInterval(() => {
      api.post("/history", {
        video: {
          id, title: meta.title || "", channel: meta.channel || "",
          duration: meta.duration || 0, thumbnail: meta.thumbnail || "",
          view_count: meta.view_count || 0,
        },
        progress: 0,
      }).catch(() => {});
    }, 30000);
    return () => clearInterval(t);
  }, [id, meta]);

  const toggleLike = async () => {
    if (!meta) return;
    try {
      if (liked) { await api.delete(`/likes/${id}`); setLiked(false); }
      else {
        await api.post(`/likes`, {
          id, title: meta.title, channel: meta.channel,
          duration: meta.duration, thumbnail: meta.thumbnail, view_count: meta.view_count,
        });
        setLiked(true); toast.success("Added to liked");
      }
    } catch { toast.error("Sign in to like videos"); }
  };

  const toggleSave = async () => {
    if (!meta) return;
    try {
      if (saved) { await api.delete(`/watch-later/${id}`); setSaved(false); }
      else {
        await api.post(`/watch-later`, {
          id, title: meta.title, channel: meta.channel,
          duration: meta.duration, thumbnail: meta.thumbnail, view_count: meta.view_count,
        });
        setSaved(true); toast.success("Saved to Watch Later");
      }
    } catch { toast.error("Sign in to save videos"); }
  };

  const share = async () => {
    const url = `${window.location.origin}/watch/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: meta?.title, url });
      else { await navigator.clipboard.writeText(url); toast.success("Link copied"); }
    } catch {}
  };

  return (
    <div className="lg:flex lg:gap-6 lg:p-6" data-testid="watch-page">
      <Toaster theme="dark" richColors position="top-center" />
      <div className="flex-1 min-w-0 lg:max-w-4xl">
        {/* On mobile we keep the player sticky at the top while the user
            scrolls through description/recommendations. On desktop we
            DO NOT make it sticky — fixes the bug where the open video
            stayed glued on top of "Up next" recommendations. */}
        <div className="ryh-watch-player-wrap">
          {loading || !meta ? (
            <div className="aspect-video bg-black grid place-items-center" data-testid="watch-player-skeleton">
              <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
            </div>
          ) : (
            <PlayerSlot />
          )}
        </div>

        <div className="px-3 lg:px-0 py-4">
          <h1 className="text-lg sm:text-xl font-semibold text-white leading-snug" data-testid="watch-title">
            {meta?.title || "Loading…"}
          </h1>

          <div className="flex flex-wrap items-center gap-3 mt-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center text-white font-bold shrink-0">
                {(meta?.channel || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-white font-medium truncate" data-testid="watch-channel">
                  {meta?.channel || "Unknown channel"}
                </div>
                {meta?.view_count > 0 && (
                  <div className="text-xs text-neutral-400">{formatViews(meta.view_count)} views</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-neutral-800 rounded-full overflow-hidden">
                <button
                  onClick={toggleLike}
                  className={`flex items-center gap-2 px-4 py-2 hover:bg-neutral-700 ${liked ? "text-blue-400" : "text-white"}`}
                  data-testid="watch-like-btn"
                >
                  <ThumbsUp className="w-4 h-4" /> {liked ? "Liked" : "Like"}
                </button>
                <div className="w-px h-5 bg-neutral-700" />
                <button className="px-3 py-2 hover:bg-neutral-700" data-testid="watch-dislike-btn" aria-label="Dislike">
                  <ThumbsDown className="w-4 h-4" />
                </button>
              </div>
              <Button
                onClick={toggleSave}
                variant="ghost"
                className={`bg-neutral-800 hover:bg-neutral-700 rounded-full ${saved ? "text-blue-400" : "text-white"}`}
                data-testid="watch-save-btn"
              >
                <Clock className="w-4 h-4 mr-2" /> {saved ? "Saved" : "Save"}
              </Button>
              <Button
                onClick={share}
                variant="ghost"
                className="bg-neutral-800 hover:bg-neutral-700 rounded-full text-white"
                data-testid="watch-share-btn"
              >
                <Share2 className="w-4 h-4 mr-2" /> Share
              </Button>
            </div>
          </div>

          <div
            className="mt-4 bg-neutral-900 rounded-xl text-sm text-neutral-100 overflow-hidden ryh-fade-in"
            data-testid="watch-description"
          >
            <button
              type="button"
              onClick={() => setDescOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-neutral-800/60 transition-colors"
              data-testid="watch-description-toggle"
              aria-expanded={descOpen}
            >
              <div className="text-[13px] text-neutral-300 truncate">
                {meta?.channel ? `From ${meta.channel}` : "Description"}
                {meta?.view_count > 0 && (
                  <span className="ml-2 text-neutral-500">{formatViews(meta.view_count)} views</span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-neutral-400 shrink-0 transition-transform duration-300 ${descOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              className={`ryh-collapse ${descOpen ? "ryh-collapse-open" : ""}`}
              data-testid="watch-description-body"
            >
              <pre className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-neutral-100 px-4 pb-4 pt-1">
                {meta?.description?.trim() || "No description provided for this video."}
              </pre>
            </div>
          </div>
        </div>
      </div>

      <aside className="lg:w-[400px] shrink-0 px-3 lg:px-0 lg:pr-4 pb-6" data-testid="watch-up-next">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3 sticky top-14 bg-[var(--yt-bg)] py-2 z-10">Up next</h3>
        <div className="space-y-3">
          {recs.map((v) => (
            <VideoCard key={v.id} video={v} layout="row" />
          ))}
        </div>
      </aside>
    </div>
  );
}
