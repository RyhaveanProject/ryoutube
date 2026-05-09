import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Youtube, LinkIcon, Loader2 } from "lucide-react";
import { api } from "../lib/api";
import { useYouTube } from "../lib/youtube";
import VideoCard, { VideoCardSkeleton } from "../components/VideoCard";

const CHIP_LABELS = {
  trending: "Trending", music: "Music", gaming: "Gaming",
  news: "News", movies: "Movies", live: "Live",
};

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState([]);
  const [ytRecent, setYtRecent] = useState([]);
  const [ytLiked, setYtLiked] = useState([]);
  const yt = useYouTube();
  const nav = useNavigate();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [{ data: home }, { data: kw }] = await Promise.all([
          api.get("/home"),
          api.get("/trending-keywords"),
        ]);
        if (alive) {
          setData(home);
          setKeywords(kw.keywords || []);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // When YouTube is connected, pull the user's personalised feeds.
  useEffect(() => {
    let alive = true;
    if (!yt.connected) {
      setYtRecent([]); setYtLiked([]);
      return;
    }
    (async () => {
      try {
        const [recent, liked] = await Promise.all([
          api.get("/youtube/me/recent", { params: { max_results: 24 } }).then(r => r.data?.videos || []).catch(() => []),
          api.get("/youtube/me/liked", { params: { max_results: 12 } }).then(r => r.data?.videos || []).catch(() => []),
        ]);
        if (!alive) return;
        setYtRecent(recent);
        setYtLiked(liked);
      } catch {}
    })();
    return () => { alive = false; };
  }, [yt.connected]);

  const sections = data?.sections || {};
  const cw = data?.continue_watching || [];

  return (
    <div className="px-3 sm:px-6 py-4">
      {/* YouTube login banner — visible on PC AND mobile when not connected */}
      {!yt.connected && (
        <div
          className="mb-4 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/15 to-red-500/5 p-3 sm:p-4 flex items-center gap-3"
          data-testid="home-yt-login-banner"
        >
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-500/20 grid place-items-center shrink-0">
            <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-white font-semibold text-sm sm:text-base">Connect your YouTube account</div>
            <div className="text-neutral-400 text-[12px] sm:text-[13px] truncate">
              Sign in to see your subscriptions, liked videos and personalised picks.
            </div>
          </div>
          <button
            onClick={() => yt.connect().catch(() => {})}
            disabled={yt.loading}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium"
            data-testid="home-yt-login-btn"
          >
            {yt.loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <LinkIcon className="w-4 h-4" />}
            <span className="hidden xs:inline sm:inline">YouTube Login</span>
            <span className="xs:hidden sm:hidden">Login</span>
          </button>
        </div>
      )}

      {/* Trending keyword chips */}
      <div
        className="ryh-rail flex gap-2 overflow-x-auto pb-3 sticky z-30 -mx-3 sm:mx-0 px-3 sm:px-0 ryh-glass border-b border-white/5"
        style={{ top: "calc(3.5rem + var(--safe-top))" }}
      >
        <button
          onClick={() => nav("/")}
          className="px-3 py-1.5 rounded-lg bg-white text-black text-[13px] font-medium shrink-0"
          data-testid="chip-all"
        >All</button>
        {keywords.map((k) => (
          <button
            key={k}
            onClick={() => nav(`/search?q=${encodeURIComponent(k)}`)}
            className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-[13px] text-white shrink-0"
            data-testid={`chip-${k}`}
          >
            {k}
          </button>
        ))}
      </div>

      {cw.length > 0 && (
        <Section title="Continue watching" items={cw.map(item => ({
          id: item.video_id, title: item.title, channel: item.channel,
          duration: item.duration, thumbnail: item.thumbnail,
          progress: item.progress, view_count: item.view_count,
        }))} />
      )}

      {/* YouTube account sections (only when connected) */}
      {yt.connected && ytRecent.length > 0 && (
        <Section
          title={`From your subscriptions${yt.google?.name ? ` — ${yt.google.name}` : ""}`}
          icon={Youtube} items={ytRecent} testid="yt-section-recent"
        />
      )}
      {yt.connected && ytLiked.length > 0 && (
        <Section title="Your liked videos" icon={Youtube} items={ytLiked} testid="yt-section-liked" />
      )}

      {loading ? (
        <Grid skeleton />
      ) : (
        Object.entries(sections).map(([name, items]) => (
          items?.length > 0 && (
            <Section key={name} title={CHIP_LABELS[name] || name} items={items} />
          )
        ))
      )}
    </div>
  );
}

function Section({ title, items, icon: Icon, testid }) {
  return (
    <section className="mt-6 ryh-fade-in" data-testid={testid}>
      <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2" data-testid={`section-${title}`}>
        {Icon ? <Icon className="w-5 h-5 text-red-500" /> : null}
        {title}
      </h2>
      <Grid items={items} />
    </section>
  );
}

function Grid({ items = [], skeleton = false }) {
  return (
    <div className="grid gap-x-4 gap-y-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {skeleton
        ? Array.from({ length: 8 }).map((_, i) => <VideoCardSkeleton key={i} />)
        : items.map((v) => <VideoCard key={v.id} video={v} />)}
    </div>
  );
}
