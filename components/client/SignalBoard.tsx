"use client";

import Link from "next/link";
import { useState } from "react";
import { Avatar, Logo } from "@/components/media";
import { LiveSince } from "./Quotes";

export interface SignalItem {
  id: string;
  href: string;
  person: { id: string; name: string; en: string; party?: string; has?: boolean; role: string };
  stock: { sym: string; name: string; kind?: 1 | 2 | 3 };
  act: string;
  buy: boolean;
  amount: string;
  fil?: string;
  fol?: number;
  rec?: string;
  flags: string[];
}

/** Four kinds of fresh buys worth a look, switched with a segmented control. */
export default function SignalBoard({
  groups,
  labels,
  px,
  limit = 9,
}: {
  groups: { key: string; label: string; items: SignalItem[] }[];
  labels: { empty: string; since: string };
  px: Record<string, number>;
  limit?: number;
}) {
  const first = groups.find((g) => g.items.length)?.key ?? groups[0]?.key;
  const [sel, setSel] = useState(first);
  const cur = groups.find((g) => g.key === sel) ?? groups[0];
  if (!cur) return null;
  return (
    <div>
      <div className="no-scrollbar -mx-5 mb-6 overflow-x-auto px-5">
        <div className="seg" role="tablist">
          {groups.map((g) => (
            <button key={g.key} type="button" role="tab" aria-pressed={g.key === sel} aria-selected={g.key === sel} onClick={() => setSel(g.key)}>
              {g.label}
              <span className="ml-1.5 text-faint">{g.items.length}</span>
            </button>
          ))}
        </div>
      </div>
      {cur.items.length === 0 ? (
        <p className="card px-5 py-8 text-center text-muted">{labels.empty}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" key={cur.key}>
          {cur.items.slice(0, limit).map((it, i) => (
            <Link
              key={it.id}
              prefetch={false}
              href={it.href}
              className="tile fade-up flex flex-col gap-4 p-5"
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
            >
              <div className="flex items-center gap-3">
                <Avatar id={it.person.id} name={it.person.en} party={it.person.party} has={it.person.has} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-semibold">{it.person.name}</div>
                  <div className="truncate text-xs text-muted">{it.person.role}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${it.buy ? "bg-pos-soft text-pos" : "bg-neg-soft text-neg"}`}>{it.act}</span>
              </div>
              <div className="flex items-center gap-3">
                <Logo sym={it.stock.sym} kind={it.stock.kind} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{it.stock.sym}</div>
                  <div className="truncate text-xs text-muted">{it.stock.name}</div>
                </div>
                <div className="num text-right text-sm font-medium">{it.amount}</div>
              </div>
              {it.rec || it.flags.length ? (
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {it.flags.map((f) => (
                    <span key={f} className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">
                      {f}
                    </span>
                  ))}
                  {it.rec ? <span className="text-muted">{it.rec}</span> : null}
                </div>
              ) : null}
              <div className="mt-auto flex items-center justify-between border-t border-hair pt-3 text-xs text-muted">
                <span className="num">{it.fil}</span>
                <span>
                  {labels.since} <LiveSince sym={it.stock.sym} entry={it.fol} fallback={px[it.stock.sym]} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
