"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Labels {
  poster?: string;
  posterTitle?: string;
  posterSave?: string;
  posterShare?: string;
  posterHint?: string;
  posterLoading?: string;
  close?: string;
  share: string;
  copyLink: string;
  copied: string;
  saveImage: string;
  native: string;
  x: string;
  telegram: string;
  weibo: string;
}

/** Share menu: the system share sheet where there is one, copy link, X, Telegram, Weibo and the share image. */
export default function Share({ path, text, image, poster, labels, compact = false }: { path: string; text: string; image: string; poster?: string; labels: Labels; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showPoster, setShowPoster] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNative, setCanNative] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setCanNative(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const url = () => `${window.location.origin}${path}`;
  const enc = encodeURIComponent;
  const pop = (href: string) => {
    window.open(href, "_blank", "noopener,noreferrer,width=640,height=560");
    setOpen(false);
  };
  const items: { label: string; icon: React.ReactNode; run: () => void | Promise<void>; show?: boolean; strong?: boolean }[] = [
    {
      label: labels.poster ?? "Poster",
      show: !!poster,
      strong: true,
      icon: <Icon d="M5 2.5h10A1.5 1.5 0 0 1 16.5 4v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V4A1.5 1.5 0 0 1 5 2.5zM3.5 13l4-4 3 3 2-2 4 4" />,
      run: () => {
        setOpen(false);
        setShowPoster(true);
      },
    },
    {
      label: labels.native,
      show: canNative,
      icon: <Icon d="M10 3v10M6 7l4-4 4 4M4 11v4.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V11" />,
      run: async () => {
        try {
          await navigator.share({ title: text, text, url: url() });
        } catch {
          // dismissed
        }
        setOpen(false);
      },
    },
    {
      label: copied ? labels.copied : labels.copyLink,
      icon: <Icon d="M8.5 11.5a3 3 0 0 0 4.24 0l2.5-2.5a3 3 0 0 0-4.24-4.24l-.75.75M11.5 8.5a3 3 0 0 0-4.24 0l-2.5 2.5a3 3 0 0 0 4.24 4.24l.75-.75" />,
      run: async () => {
        try {
          await navigator.clipboard.writeText(url());
          setCopied(true);
          setTimeout(() => {
            setCopied(false);
            setOpen(false);
          }, 1200);
        } catch {
          window.prompt(labels.copyLink, url());
        }
      },
    },
    { label: labels.x, icon: <Brand t="𝕏" />, run: () => pop(`https://x.com/intent/post?text=${enc(text)}&url=${enc(url())}`) },
    { label: labels.telegram, icon: <Brand t="✈" />, run: () => pop(`https://t.me/share/url?url=${enc(url())}&text=${enc(text)}`) },
    { label: labels.weibo, icon: <Brand t="微" />, run: () => pop(`https://service.weibo.com/share/share.php?url=${enc(url())}&title=${enc(text)}`) },
    {
      label: labels.saveImage,
      icon: <Icon d="M10 3v9m0 0-3.5-3.5M10 12l3.5-3.5M4 15.5h12" />,
      run: () => {
        const a = document.createElement("a");
        a.href = image;
        a.download = `${path.split("/").filter(Boolean).slice(1).join("-") || "share"}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setOpen(false);
      },
    },
  ];

  return (
    <div ref={box} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex items-center gap-1.5 rounded-full bg-surface-2 font-medium text-text transition-colors hover:bg-surface-3 ${compact ? "px-3 py-1 text-[13px]" : "px-4 py-2 text-[15px]"}`}
      >
        <svg width={compact ? 14 : 16} height={compact ? 14 : 16} viewBox="0 0 20 20" aria-hidden="true">
          <path d="M10 2.5v10M6.5 6 10 2.5 13.5 6M5 9H4.5A1.5 1.5 0 0 0 3 10.5v6A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 15.5 9H15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {labels.share}
      </button>
      {open ? (
        <div role="menu" className="fade-up absolute top-full left-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl float p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.16)] sm:right-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" width={1200} height={630} className="mb-1.5 aspect-[1200/630] w-full rounded-xl bg-surface-2 object-cover" loading="lazy" />
          {items
            .filter((i) => i.show !== false)
            .map((i) => (
              <button key={i.label} type="button" role="menuitem" onClick={() => void i.run()} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-surface-2 ${i.strong ? "font-semibold text-accent" : ""}`}>
                <span className={`flex size-5 items-center justify-center ${i.strong ? "text-accent" : "text-muted"}`}>{i.icon}</span>
                {i.label}
              </button>
            ))}
        </div>
      ) : null}
      {/* portal: an animated (transformed) ancestor would otherwise trap the fixed overlay */}
      {showPoster && poster ? createPortal(<PosterSheet src={poster} path={path} text={text} labels={labels} onClose={() => setShowPoster(false)} />, document.body) : null}
    </div>
  );
}

/** A button that opens the poster sheet directly (for pages about many officials). */
export function PosterButton({ src, path, text, labels, label }: { src: string; path: string; text: string; labels: Labels; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-1.5 text-[13px] font-semibold text-accent transition-colors hover:brightness-95">
        <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 2.5h10A1.5 1.5 0 0 1 16.5 4v12a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16V4A1.5 1.5 0 0 1 5 2.5zM3.5 13l4-4 3 3 2-2 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {label ?? labels.poster}
      </button>
      {open ? createPortal(<PosterSheet src={src} path={path} text={text} labels={labels} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function PosterSheet({ src, path, text, labels, onClose }: { src: string; path: string; text: string; labels: Labels; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [failed, setFailed] = useState(false);
  const [canShareFile, setCanShareFile] = useState(false);
  // e.g. /zh/poster/leaderboard?k=worst -> poster-leaderboard-worst.png
  const name = `poster-${(src.split("/poster/")[1] ?? "share").replace(/[?=&]k?=?/g, "-").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/-$/, "")}.png`;
  useEffect(() => {
    let live = true;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (!live) return;
        setBlob(b);
        try {
          const f = new File([b], name, { type: "image/png" });
          setCanShareFile(typeof navigator.canShare === "function" && navigator.canShare({ files: [f] }));
        } catch {
          setCanShareFile(false);
        }
      })
      .catch(() => live && setFailed(true));
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      live = false;
      document.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [src, name, onClose]);
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const saveIt = () => {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };
  const shareIt = async () => {
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], name, { type: "image/png" })], title: text, text: `${text} ${window.location.origin}${path}` });
    } catch {
      // dismissed
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={labels.posterTitle} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="fade-up flex max-h-full w-full max-w-[440px] flex-col overflow-hidden float rounded-3xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <h2 className="text-[17px] font-semibold">{labels.posterTitle}</h2>
          <button type="button" onClick={onClose} aria-label={labels.close} className="flex size-8 items-center justify-center rounded-full bg-surface-2 text-muted hover:bg-surface-3">
            <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={text} width={1080} height={1440} className="aspect-[3/4] w-full rounded-2xl border border-hair object-contain" />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-surface-2 text-[14px] text-muted">{failed ? "—" : labels.posterLoading}</div>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-faint">{labels.posterHint}</p>
        </div>
        <div className="flex gap-2 p-5 pt-4">
          {canShareFile ? (
            <button type="button" className="btn btn-primary flex-1 justify-center" disabled={!blob} onClick={() => void shareIt()}>
              {labels.posterShare}
            </button>
          ) : null}
          <button type="button" className={`btn flex-1 justify-center ${canShareFile ? "btn-quiet" : "btn-primary"}`} disabled={!blob} onClick={saveIt}>
            {labels.posterSave}
          </button>
        </div>
      </div>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Brand({ t }: { t: string }) {
  return <span className="text-[15px] leading-none font-semibold">{t}</span>;
}
