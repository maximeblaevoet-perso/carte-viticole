"use client";

import { useState } from "react";

/**
 * Mobile bottom sheet with two snap points: a peek (summary) and an expanded
 * state (swipe up / tap the handle for detail). Shown only on small screens.
 */
export function BottomSheet({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!open) return null;

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-[height] duration-300 md:hidden ${
        expanded ? "h-[85%]" : "h-[42%]"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Reduire" : "Agrandir"}
        className="flex w-full justify-center py-2"
      >
        <span className="h-1.5 w-10 rounded-full bg-slate-300" />
      </button>
      <div className="h-[calc(100%-28px)]">{children}</div>
    </div>
  );
}
