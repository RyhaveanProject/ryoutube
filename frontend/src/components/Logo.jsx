import React from "react";

export default function Logo({ size = 28, withWordmark = true, "data-testid": testid }) {
  return (
    <div className="flex items-center gap-1.5 select-none" data-testid={testid || "ryh-logo"}>
      <div
        className="ryh-logo-r leading-none"
        style={{ fontSize: `${size + 6}px` }}
      >
        R
      </div>
      {withWordmark && (
        <div className="flex flex-col leading-none">
          <span className="text-[10px] tracking-[0.18em] uppercase text-white/80 font-semibold">
            YouTube
          </span>
          <span className="text-[8px] text-white/40 tracking-wider">Ryhavean</span>
        </div>
      )}
    </div>
  );
}
