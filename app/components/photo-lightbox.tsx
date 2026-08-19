"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * One photo, full size, over whatever was being read.
 *
 * A dialog rather than a new tab: the table is the thing being worked through,
 * and a farmer's photo is a two-second look, not a destination. Closes on the
 * backdrop, on the button, and on Escape — three ways out, because a photo that
 * traps the page is worse than no photo.
 */
export function PhotoLightbox({
  url,
  caption,
  onClose,
}: {
  url: string | null;
  caption?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] max-w-[90vw] flex-col items-center gap-3"
        // Swallows clicks on the photo itself, which would otherwise reach the
        // backdrop and close it the moment anyone tried to look closely.
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="Close photo"
          className="absolute -top-2 right-0 translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-1.5 text-zinc-700 shadow-lg hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
        >
          <X size={18} />
        </button>

        {/* Plain <img>, not next/image: these are Cloudinary URLs on a host the
            optimiser is not configured for, and an unoptimised photo shown is
            better than an optimised one that fails to load. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={caption || "Farmer photo"}
          className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl"
        />
        {caption ? <p className="text-sm font-medium text-white">{caption}</p> : null}
      </div>
    </div>
  );
}
