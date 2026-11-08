"use client";

import { useEffect, useState } from "react";

type Snap = "collapsed" | "peek" | "expanded";

/**
 * Mobile bottom sheet with three snap points: collapsed (a thin bar, the map
 * and its controls are free again), peek (summary) and expanded (detail).
 * The handle cycles peek ↔ expanded; ▾ collapses; × closes the fiche and
 * clears the selection. Shown only on small screens.
 */
export function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  /** Shown in the collapsed bar so the user knows what is still selected. */
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [snap, setSnap] = useState<Snap>("peek");

  // A new selection always opens at the peek height.
  useEffect(() => {
    if (open) setSnap("peek");
  }, [open, title]);

  if (!open) return null;

  const height =
    snap === "expanded" ? "h-[85%]" : snap === "peek" ? "h-[42%]" : "h-11";

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl transition-[height] duration-300 md:hidden ${height}`}
    >
      <div className="relative flex h-9 shrink-0 items-center">
        <button
          type="button"
          onClick={() => setSnap((s) => (s === "peek" ? "expanded" : "peek"))}
          aria-label={snap === "expanded" ? "Réduire la fiche" : "Agrandir la fiche"}
          className="flex h-full flex-1 items-center justify-center gap-2 px-12"
        >
          {snap === "collapsed" ? (
            <span className="truncate text-xs font-medium text-slate-700">
              {title ?? "Fiche"} · afficher
            </span>
          ) : (
            <span className="h-1.5 w-10 rounded-full bg-slate-300" />
          )}
        </button>
        <div className="absolute right-1 top-0 flex h-full items-center">
          {snap !== "collapsed" && (
            <button
              type="button"
              onClick={() => setSnap("collapsed")}
              aria-label="Replier la fiche"
              title="Replier"
              className="flex h-8 w-8 items-center justify-center rounded text-base text-slate-500 hover:bg-slate-100"
            >
              ▾
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fiche"
            title="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded text-lg leading-none text-slate-500 hover:bg-slate-100"
          >
            ×
          </button>
        </div>
      </div>
      {snap !== "collapsed" && <div className="min-h-0 flex-1">{children}</div>}
    </div>
  );
}
