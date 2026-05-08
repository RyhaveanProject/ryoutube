import React, { useEffect, useState } from \"react\";
import { useSearchParams, useNavigate } from \"react-router-dom\";
import { Search as SearchIcon } from \"lucide-react\";
import { api } from \"../lib/api\";
import VideoCard, { VideoCardSkeleton } from \"../components/VideoCard\";
import { Input } from \"../components/ui/input\";
import { Button } from \"../components/ui/button\";

export default function Search() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const q = params.get(\"q\") || \"\";
  const [input, setInput] = useState(q);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setInput(q); }, [q]);

  useEffect(() => {
    if (!q) { setItems([]); return; }
    let alive = true;
    setLoading(true);
    api.get(\"/search\", { params: { q, limit: 24 } })
      .then(({ data }) => alive && setItems(data.results || []))
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [q]);

  const submit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setParams({ q: input.trim() });
  };

  return (
    <div className=\"px-3 sm:px-6 py-4 max-w-5xl mx-auto\">
      <form onSubmit={submit} className=\"flex gap-2 mb-4 sm:hidden\">
        <Input
          autoFocus value={input} onChange={(e) => setInput(e.target.value)}
          placeholder=\"Search videos, music, films, live\"
          className=\"ryh-input ryh-allow-copy h-11 bg-neutral-900 border-neutral-700 text-white\"
          data-testid=\"search-page-input\"
        />
        <Button type=\"submit\" className=\"bg-red-600 hover:bg-red-700 h-11\" data-testid=\"search-page-submit\">
          <SearchIcon className=\"w-4 h-4\" />
        </Button>
      </form>

      {!q && (
        <div className=\"text-center py-20 text-neutral-400\">
          <SearchIcon className=\"w-12 h-12 mx-auto mb-3 opacity-50\" />
          <p>Search for videos, music, films, live streams</p>
        </div>
      )}

      <div className=\"space-y-4\">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => <div key={i} className=\"flex gap-3\"><div className=\"w-48 aspect-video ryh-skeleton rounded-lg\" /><div className=\"flex-1 space-y-2 py-2\"><div className=\"h-4 ryh-skeleton rounded w-3/4\" /><div className=\"h-3 ryh-skeleton rounded w-1/2\" /></div></div>)
          : items.length === 0 && q ? (
              <div className=\"text-center py-20 text-neutral-400\" data-testid=\"search-empty\">No results for \"{q}\"</div>
            ) : items.map((v) => <VideoCard key={v.id} video={v} layout=\"row\" />)}
      </div>
    </div>
  );
}
