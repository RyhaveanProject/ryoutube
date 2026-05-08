import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ThumbsUp, ThumbsDown, Clock, Share2, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import VideoPlayer from "../components/VideoPlayer";
import VideoCard from "../components/VideoCard";
import { Button } from "../components/ui/button";
import { formatViews } from "../lib/format";
import { toast, Toaster } from "sonner";

export default function Watch() {
  const { id } = useParams();
  const nav = useNavigate();
  const [meta, setMeta] = useState(null);
  const [stream, setStream] = useState(null);
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const lastReport = useRef(0);

  const load = useCallback(async () => {
    setLoading(true); setStream(null); setMeta(null);
    try {
      const [s, r, l] = await Promise.all([
        api.get(`/stream/${id}`),
        api.get(`/recommendations`, { params: { video_id: id } }),
        api.get(`/likes`),
      ]);
      setMeta(s.data);
      setStream(s.data);
      setRecs(r.data.results || []);
      setLiked((l.data.ids || []).includes(id));
      // Get history progress
      const h = await api.get(`/history`).catch(() => ({ data: { history: [] } }));
      const item = (h.data.history || []).find((x) => x.video_id === id);
      if (item && item.progress > 5 && (item.duration ? item.progress < item.duration - 10 : true)) {
        setStartAt(item.progress);
      } else {
        setStartAt(0);
      }
      // Check watch later
      const wl = await api.get(`/watch-later`).catch(() => ({ data: { items: [] } }));
      setSaved((wl.data.items || []).some((x) => x.video_id === id));
    } catch (e) {
      toast.error("Failed to load video");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Save progress to history (debounced every ~10s)
  const onProgress = useCallback((current, duration) => {
    const now = Date.now();
    if (now - lastReport.current < 10000) return;
    lastReport.current = now;
    if (!meta) return;
    api.post("/history", {
      video: {
        id, title: meta.title, channel: meta.channel,
        duration: meta.duration || duration || 0,
        thumbnail: meta.thumbnail, view_count: meta.view_count || 0,
      },
      progress: current,
    }).catch(() => {});
  }, [id, meta]);

  const onEnded = () => {
    if (recs.length > 0) nav(`/watch/${recs[0].id}`);
  };

  const toggleLike = async () => {
    if (!meta) return;
    try {
      if (liked) {
        await api.delete(`/likes/${id}`);
        setLiked(false);
      } else {
        await api.post(`/likes`, {
          id, title: meta.title, channel: meta.channel,
          duration: meta.duration, thumbnail: meta.thumbnail, view_count: meta.view_count,
        });
        setLiked(true);
        toast.success("Added to liked");
      }
    } catch { toast.error("Failed"); }
  };

  const toggleSave = async () => {
    if (!meta) return;
    try {
      if (saved) {
        await api.delete(`/watch-later/${id}`);
        setSaved(false);
      } else {
        await api.post(`/watch-later`, {
          id, title: meta.title, channel: meta.channel,
          duration: meta.duration, thumbnail: meta.thumbnail, view_count: meta.view_count,
        });
        setSaved(true);
        toast.success("Saved to Watch Later");
      }
    } catch { toast.error("Failed"); }
  };

  const share = async () => {
    const url = `${window.location.origin}/watch/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: meta?.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {}
  };

  return (
    <div className="lg:flex lg:gap-6 lg:p-6">
      <Toaster theme="dark" richColors position="top-center" />
      <div className="flex-1 min-w-0 max-w-4xl">
        {loading || !stream ? (
          <div className="aspect-video bg-black grid place-items-center">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
          </div>
        ) : (
          <VideoPlayer
            src={stream.stream_url}
            poster={stream.thumbnail}
            startAt={startAt}
            onProgress={onProgress}
            onEnded={onEnded}
          />
        )}

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
                <div className="text-white font-medium truncate" data-testid="watch-channel">{meta?.channel}</div>
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
              <Button onClick={share} variant="ghost" className="bg-neutral-800 hover:bg-neutral-700 rounded-full text-white" data-testid="watch-share-btn">
                <Share2 className="w-4 h-4 mr-2" /> Share
              </Button>
            </div>
          </div>

          {meta?.description && (
            <details className="mt-4 bg-neutral-900 rounded-xl p-3 text-sm text-neutral-200">
              <summary className="cursor-pointer text-neutral-400 select-none">Description</summary>
              <pre className="whitespace-pre-wrap font-sans mt-2 text-[13px] leading-relaxed">{meta.description}</pre>
            </details>
          )}
        </div>
      </div>

      <aside className="lg:w-[400px] shrink-0 px-3 lg:px-0">
        <h3 className="text-sm font-semibold text-neutral-300 mb-3">Up next</h3>
        <div className="space-y-3">
          {recs.map((v) => <VideoCard key={v.id} video={v} layout="row" />)}
        </div>
      </aside>
    </div>
  );
}
