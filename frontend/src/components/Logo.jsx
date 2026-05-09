import React from "react";

/**
 * Big, distinctive RYouTube wordmark.
 *
 * The legacy variant rendered a tiny "R" with two thin labels above it,
 * which made the icon nearly invisible once the PWA was added to the
 * home screen. The new layout stacks a giant gradient "R" with a bold
 * "YOUTUBE" wordmark beneath — readable at any size and recognisable as
 * an installed app icon.
 */
export default function Logo({ size = 28, withWordmark = true, "data-testid": testid }) {
  // The "R" is the dominant element. We base every other size on it so
  // the layout stays balanced from the 22px header logo up to the 36px
  // login splash logo.
  const rSize = Math.round(size * 1.55);
  const wordSize = Math.max(10, Math.round(size * 0.46));

  return (
    <div className="flex items-center gap-2 select-none ryh-brand" data-testid={testid || "ryh-logo"}>
      <div
        className="ryh-logo-r leading-none"
        style={{
          fontSize: `${rSize}px`,
          // Slight optical lift so the cap-height of the R aligns with
          // the wordmark baseline.
          transform: "translateY(1px)",
        }}
      >
        R
      </div>
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span
            className="ryh-logo-wordmark font-extrabold tracking-tight text-white"
            style={{ fontSize: `${wordSize}px` }}
          >
            YouTube
          </span>
          <span
            className="ryh-logo-sub uppercase tracking-[0.28em] text-white/55"
            style={{ fontSize: `${Math.max(8, Math.round(size * 0.32))}px` }}
          >
            Ryhavean
          </span>
        </div>
      )}
    </div>
  );
}
