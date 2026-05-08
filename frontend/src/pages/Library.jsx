import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { History, ThumbsUp, Clock } from "lucide-react";
import { api } from "../lib/api";
import VideoCard from "../components/VideoCard";

export default function Library() {
  const [history, setHistory] = useState([]);
  const [likes, setLikes] = useState([]);
  const [later, setLater] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/history").then((r) => r.data.history || []).catch(() => []),
      api.get("/likes").then((r) => r.data.likes || []).catch(() => []),
      api.get("/watch-later").then((r) => r.data.items || []).catch(() => []),
    ]).then(([h, l, w]) => { setHistory(h); setLikes(l); setLater(w); });
  }, []);

  const toVid = (i) => ({
    id: i.video_id, title: i.title, channel: i.channel,
    duration: i.duration, thumbnail: i.thumbnail, view_count: i.view_count,
    progress: i.progress,
  });

  return (
    <div className="px-3 sm:px-6 py-6 space-y-10 max-w-7xl">
      <Section title="History" icon={History} to="/history" items={history.slice(0, 4).map(toVid)} empty="No watch history yet" />
      <Section title="Liked videos" icon={ThumbsUp} to="/liked" items={likes.slice(0, 4).map(toVid)} empty="No liked videos yet" />
      <Section title="Watch later" icon={Clock} to="/watch-later" items={later.slice(0, 4).map(toVid)} empty="Nothing saved for later" />
    </div>
  );
}

function Section({ title, icon: Icon, to, items, empty }) {
  return (
    <section data-testid={`library-section-${title}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Icon className="w-5 h-5" /> {title}
        </h2>
        <Link to={to} className="text-sm text-blue-400 hover:underline" data-testid={`library-view-all-${title}`}>View all</Link>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-neutral-500 py-6">{empty}</div>
      ) : (
        <div className="grid gap-x-4 gap-y-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((v) => <VideoCard key={v.id} video={v} />)}
        </div>
      )}
    </section>
  );
}
