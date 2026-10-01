"use client";

import { useEffect, useRef, useState } from "react";

interface Labels {
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
export default function Share({ path, text, image, labels, compact = false }: { path: string; text: string; image: string; labels: Labels; compact?: boolean }) {
  const [open, setOpen] = useState(false);
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
  const items: { label: string; icon: React.ReactNode; run: () => void | Promise<void>; show?: boolean }[] = [
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
        <div role="menu" className="fade-up absolute top-full left-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-hair bg-[var(--bg-elev)] p-1.5 shadow-[0_16px_48px_rgba(0,0,0,0.16)] sm:right-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt="" width={1200} height={630} className="mb-1.5 aspect-[1200/630] w-full rounded-xl bg-surface-2 object-cover" loading="lazy" />
          {items
            .filter((i) => i.show !== false)
            .map((i) => (
              <button key={i.label} type="button" role="menuitem" onClick={() => void i.run()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-surface-2">
                <span className="flex size-5 items-center justify-center text-muted">{i.icon}</span>
                {i.label}
              </button>
            ))}
        </div>
      ) : null}
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
