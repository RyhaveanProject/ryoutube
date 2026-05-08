import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import VideoCard, { VideoCardSkeleton } from "../components/VideoCard";

const CHIP_LABELS = {
  trending: "Trending", music: "Music", gaming: "Gaming",
  news: "News", movies: "Movies", live: "Live",
};

export default function Home() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keywords, setKeywords] = useState([]);
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

  const sections = data?.sections || {};
  const cw = data?.continue_watching || [];

  return (
    <div className="px-3 sm:px-6 py-4">
      {/* Trending keyword chips */}
      <div className="ryh-rail flex gap-2 overflow-x-auto pb-3 sticky top-14 z-30 -mx-3 sm:mx-0 px-3 sm:px-0 ryh-glass border-b border-white/5">
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

function Section({ title, items }) {
  return (
    <section className="mt-6 ryh-fade-in">
      <h2 className="text-lg font-semibold text-white mb-3" data-testid={`section-${title}`}>{title}</h2>
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
