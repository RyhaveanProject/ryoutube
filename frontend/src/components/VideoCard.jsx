import React from "react";
import { Link } from "react-router-dom";
import { formatDuration, formatViews } from "../lib/format";

export default function VideoCard({ video, layout = "grid" }) {
  const v = video || {};
  if (layout === "row") {
    return (
      <Link
        to={`/watch/${v.id}`}
        className="ryh-card flex gap-3 group"
        data-testid={`video-row-${v.id}`}
      >
        <div className="relative shrink-0 w-40 sm:w-48 aspect-video overflow-hidden rounded-lg bg-neutral-800">
          <img src={v.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
          {v.duration > 0 && (
            <span className="absolute bottom-1 right-1 bg-black/85 text-white text-[11px] px-1.5 py-0.5 rounded">
              {formatDuration(v.duration)}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] text-white font-medium line-clamp-2 leading-snug">{v.title}</div>
          <div className="text-[12px] text-neutral-400 mt-1">{v.channel}</div>
          {v.view_count > 0 && (
            <div className="text-[12px] text-neutral-500">{formatViews(v.view_count)} views</div>
          )}
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/watch/${v.id}`} className="ryh-card block group" data-testid={`video-card-${v.id}`}>
      <div className="relative aspect-video overflow-hidden ryh-thumb rounded-xl bg-neutral-800">
        <img src={v.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
        {v.duration > 0 && (
          <span className="absolute bottom-2 right-2 bg-black/85 text-white text-[11px] px-1.5 py-0.5 rounded">
            {formatDuration(v.duration)}
          </span>
        )}
        {typeof v.progress === "number" && v.progress > 5 && v.duration > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
            <div
              className="h-full bg-red-600"
              style={{ width: `${Math.min(100, (v.progress / v.duration) * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-3">
        <div className="w-9 h-9 rounded-full bg-neutral-700 shrink-0 grid place-items-center text-white text-sm font-bold">
          {(v.channel || "?").charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] text-white font-medium line-clamp-2 leading-snug">{v.title}</div>
          <div className="text-[12px] text-neutral-400 mt-1 truncate">{v.channel}</div>
          {v.view_count > 0 && (
            <div className="text-[12px] text-neutral-500">{formatViews(v.view_count)} views</div>
          )}
        </div>
      </div>
    </Link>
  );
}

export function VideoCardSkeleton() {
  return (
    <div className="block">
      <div className="aspect-video rounded-xl ryh-skeleton" />
      <div className="flex gap-3 mt-3">
        <div className="w-9 h-9 rounded-full ryh-skeleton" />
        <div className="flex-1 space-y-2">
          <div className="h-3 ryh-skeleton rounded w-11/12" />
          <div className="h-3 ryh-skeleton rounded w-2/3" />
        </div>
      </div>
    </div>
  );
}
