"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";

function clock(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * A URL that downloads rather than streams.
 *
 * The HTML `download` attribute is ignored cross-origin, and these files are
 * served from Cloudinary — so the browser would just navigate to the audio and
 * play it in a blank tab. Cloudinary's `fl_attachment` sets the
 * Content-Disposition header that actually triggers a save.
 */
function downloadUrl(src: string) {
  return src.includes("/upload/") ? src.replace("/upload/", "/upload/fl_attachment/") : src;
}

/**
 * A recording, playable inline.
 *
 * The browser's default <audio> control is ~250px wide and cannot be shrunk —
 * in a table cell it collapses to an unusable stub with the play button clipped
 * off. This draws the parts that matter at whatever size the column allows.
 *
 * `compact` drops the scrubber and keeps only play + elapsed time, for tables.
 */
export function AudioPlayer({
  src,
  compact = false,
  fallbackSeconds = 0,
}: {
  src: string;
  compact?: boolean;
  /** Duration recorded at capture, shown until the file's own metadata loads. */
  fallbackSeconds?: number;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(fallbackSeconds);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onTime = () => setElapsed(el.currentTime);
    // Streamed audio often reports Infinity until it has buffered enough.
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) setTotal(el.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setElapsed(0);
    };
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnd);
    el.addEventListener("error", () => setFailed(true));
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnd);
    };
  }, []);

  const toggle = () => {
    const el = ref.current;
    if (!el) return;
    if (el.paused) {
      // Only one recording should ever be audible at a time.
      document.querySelectorAll("audio").forEach((a) => {
        if (a !== el) a.pause();
      });
      el.play().then(
        () => setPlaying(true),
        () => setFailed(true)
      );
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;

  // A file the browser cannot decode is still worth keeping — offer the download
  // rather than a dead end.
  if (failed) {
    return (
      <a
        href={downloadUrl(src)}
        download
        className="inline-flex items-center gap-1 text-xs text-red-500 hover:underline"
      >
        <Download size={13} /> Can&apos;t play · download
      </a>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-full bg-zinc-100 py-1 pl-1 pr-3 dark:bg-zinc-900 ${
        compact ? "w-fit" : "w-full"
      }`}
    >
      <audio ref={ref} src={src} preload="metadata" className="hidden" />
      <button
        onClick={toggle}
        aria-label={playing ? "Pause recording" : "Play recording"}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white transition hover:bg-green-700"
      >
        {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </button>

      {!compact && (
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-300 dark:bg-zinc-700">
          <div className="h-full rounded-full bg-green-600" style={{ width: `${pct}%` }} />
        </div>
      )}

      <span className="shrink-0 font-mono text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
        {playing || elapsed > 0 ? clock(elapsed) : clock(total)}
      </span>

      <a
        href={downloadUrl(src)}
        download
        title="Download recording"
        aria-label="Download recording"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-200 hover:text-green-600 dark:hover:bg-zinc-800"
      >
        <Download size={14} />
      </a>
    </div>
  );
}
