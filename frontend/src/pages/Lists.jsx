import React, { useEffect, useState } from \"react\";
import { Trash2 } from \"lucide-react\";
import { api } from \"../lib/api\";
import VideoCard from \"../components/VideoCard\";
import { Button } from \"../components/ui/button\";

function ListPage({ title, endpoint, listKey, idKey = \"video_id\", testid }) {
  const [items, setItems] = useState([]);
  const load = () => api.get(endpoint).then((r) => setItems(r.data[listKey] || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, [endpoint, listKey]);

  const remove = async (vid) => {
    await api.delete(`${endpoint}/${vid}`);
    load();
  };
  const clearAll = async () => {
    if (endpoint === \"/history\") {
      await api.delete(\"/history\");
      load();
    }
  };

  return (
    <div className=\"px-3 sm:px-6 py-6 max-w-7xl\">
      <div className=\"flex items-center justify-between mb-4\">
        <h1 className=\"text-2xl font-bold text-white\">{title}</h1>
        {endpoint === \"/history\" && items.length > 0 && (
          <Button onClick={clearAll} variant=\"outline\" className=\"border-neutral-700 text-white hover:bg-neutral-800\" data-testid={`${testid}-clear`}>
            <Trash2 className=\"w-4 h-4 mr-2\" /> Clear all
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <div className=\"text-neutral-500 py-20 text-center\" data-testid={`${testid}-empty`}>Nothing here yet.</div>
      ) : (
        <div className=\"grid gap-x-4 gap-y-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4\" data-testid={testid}>
          {items.map((i) => (
            <div key={i[idKey]} className=\"relative group\">
              <VideoCard video={{
                id: i[idKey], title: i.title, channel: i.channel,
                duration: i.duration, thumbnail: i.thumbnail, view_count: i.view_count,
                progress: i.progress,
              }} />
              <button
                onClick={() => remove(i[idKey])}
                className=\"absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition\"
                data-testid={`remove-${i[idKey]}`}
                aria-label=\"Remove\"
              >
                <Trash2 className=\"w-3.5 h-3.5\" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const HistoryPage = () => <ListPage title=\"History\" endpoint=\"/history\" listKey=\"history\" testid=\"history-grid\" />;
export const LikedPage = () => <ListPage title=\"Liked videos\" endpoint=\"/likes\" listKey=\"likes\" testid=\"liked-grid\" />;
export const WatchLaterPage = () => <ListPage title=\"Watch later\" endpoint=\"/watch-later\" listKey=\"items\" testid=\"watch-later-grid\" />;
