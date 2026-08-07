"use client";

import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type LightboxImage = { url: string; caption?: string };

type LightboxContextValue = {
  /**
   * Show one or more images full-size. Pass the whole group a thumbnail belongs
   * to and the index that was clicked, so the arrows can step through the rest
   * (a farm visit's before/after pair, a report's photos) rather than making
   * the viewer close and reopen for each one.
   */
  openLightbox: (images: LightboxImage[], index?: number) => void;
};

const LightboxContext = createContext<LightboxContextValue | null>(null);

/** Open images in an overlay. Throws if used outside the provider. */
export function useLightbox() {
  const ctx = useContext(LightboxContext);
  if (!ctx) throw new Error("useLightbox must be used inside <LightboxProvider>");
  return ctx;
}

export function LightboxProvider({ children }: { children: React.ReactNode }) {
  const [images, setImages] = useState<LightboxImage[]>([]);
  const [index, setIndex] = useState(0);

  const openLightbox = useCallback((next: LightboxImage[], at = 0) => {
    const usable = next.filter((i) => !!i?.url);
    if (!usable.length) return;
    setImages(usable);
    setIndex(Math.min(Math.max(at, 0), usable.length - 1));
  }, []);

  const close = useCallback(() => setImages([]), []);
  const step = useCallback(
    (by: number) => setIndex((i) => (i + by + images.length) % images.length),
    [images.length]
  );

  const isOpen = images.length > 0;

  // Keyboard: Escape closes, arrows move through a group.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight" && images.length > 1) step(1);
      if (e.key === "ArrowLeft" && images.length > 1) step(-1);
    };
    window.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while the overlay is up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [isOpen, images.length, close, step]);

  const value = useMemo(() => ({ openLightbox }), [openLightbox]);
  const current = images[index];

  return (
    <LightboxContext.Provider value={value}>
      {children}

      {isOpen && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={current.caption ?? "Image"}
          onClick={close}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          {/* Top bar: caption, position in the group, open-original, close. */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mb-3 flex w-full max-w-5xl items-center gap-3 text-white"
          >
            <div className="min-w-0 flex-1 truncate text-sm font-medium">
              {current.caption ?? ""}
            </div>
            {images.length > 1 && (
              <div className="shrink-0 text-xs text-white/70">
                {index + 1} / {images.length}
              </div>
            )}
            <a
              href={current.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open the original in a new tab"
              className="shrink-0 rounded-md p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <ExternalLink size={18} />
            </a>
            <button
              onClick={close}
              title="Close (Esc)"
              className="shrink-0 rounded-md p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-[80vh] w-full max-w-5xl items-center justify-center"
          >
            {images.length > 1 && (
              <button
                onClick={() => step(-1)}
                title="Previous"
                className="absolute left-0 z-10 -translate-x-1 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
              >
                <ChevronLeft size={22} />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.url}
              alt={current.caption ?? "Photo"}
              className="max-h-[80vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
            />

            {images.length > 1 && (
              <button
                onClick={() => step(1)}
                title="Next"
                className="absolute right-0 z-10 translate-x-1 rounded-full bg-black/50 p-2 text-white transition hover:bg-black/70"
              >
                <ChevronRight size={22} />
              </button>
            )}
          </div>
        </div>
      )}
    </LightboxContext.Provider>
  );
}

/**
 * A thumbnail that opens in the lightbox instead of a new tab.
 *
 * Rendered as a button rather than an anchor: it no longer navigates anywhere,
 * and a link that does not link is a lie to keyboard and screen-reader users.
 */
export function PhotoThumb({
  url,
  caption,
  group,
  index = 0,
  className = "",
  alt,
}: {
  url: string;
  caption?: string;
  /** The set this thumbnail belongs to, so the arrows can step through it. */
  group?: LightboxImage[];
  index?: number;
  className?: string;
  alt?: string;
}) {
  const { openLightbox } = useLightbox();
  return (
    <button
      type="button"
      title={caption ?? "View photo"}
      onClick={(e) => {
        e.stopPropagation();
        openLightbox(group?.length ? group : [{ url, caption }], group?.length ? index : 0);
      }}
      className="cursor-zoom-in"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt ?? caption ?? "Photo"} className={className} />
    </button>
  );
}
