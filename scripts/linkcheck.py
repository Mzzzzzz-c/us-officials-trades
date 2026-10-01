# Usage: npm run build && npx next start -p 3100 & python3 scripts/linkcheck.py http://localhost:3100 bad.json
"""Crawl every internal page of the site, check every internal link and asset it references.

Pages (non-trade) are crawled fully in both locales. Trade pages are dynamic and number in the tens of
thousands, so each unique trade link found is checked once in its own locale (status only).
"""
import re, sys, json, collections
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urljoin, urlparse, unquote
import urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3100"
HREF = re.compile(r'(?:href|src)="([^"#]+)')
SRCSET = re.compile(r'srcset="([^"]+)"')


def get(path, body=True):
    url = BASE + path
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "linkcheck"}, method="GET" if body else "HEAD")
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, (r.read().decode("utf-8", "replace") if body else "")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:  # noqa
        return f"ERR {e}", ""


def norm(link, page):
    if link.startswith(("mailto:", "tel:", "javascript:", "data:")):
        return None
    u = urlparse(urljoin(BASE + page, link.replace("&amp;", "&")))
    if u.netloc != urlparse(BASE).netloc:
        return None
    p = u.path
    if p.startswith("/_next/"):
        return None
    return p + (("?" + u.query) if u.query and p.startswith("/api") else "")


seen, refs = set(), collections.defaultdict(set)
pages = ["/", "/zh", "/en", "/sitemap.xml", "/robots.txt"]
trade_links, asset_links, api_links = set(), set(), set()
bad = {}
q = list(pages)
seen.update(q)

with ThreadPoolExecutor(24) as ex:
    while q:
        batch, q = q, []
        for path, (st, html) in zip(batch, ex.map(get, batch)):
            if st != 200:
                bad[path] = st
                continue
            links = HREF.findall(html) + [s.strip().split(" ")[0] for m in SRCSET.findall(html) for s in m.split(",")]
            if path == "/sitemap.xml":
                links = re.findall(r"<loc>([^<]+)</loc>", html)
            for l in links:
                n = norm(l, path)
                if not n:
                    continue
                refs[n].add(path)
                if "/trade/" in n:
                    trade_links.add(n)
                elif n.startswith("/api/"):
                    api_links.add(n)
                elif re.search(r"\.(webp|png|jpg|jpeg|svg|ico|avif|css|js|json|txt|xml)$", n) and not n.endswith("sitemap.xml"):
                    asset_links.add(n)
                elif n not in seen:
                    seen.add(n)
                    q.append(n)
        print(f"crawled {len(seen)} pages, queue {len(q)}, trades {len(trade_links)}, bad {len(bad)}", flush=True)

    print("checking", len(trade_links), "trade links,", len(asset_links), "assets,", len(api_links), "api")
    for group in (sorted(asset_links), sorted(api_links), sorted(trade_links)):
        for path, (st, _) in zip(group, ex.map(lambda p: get(p, body=False), group)):
            if st != 200:
                bad[path] = st

print("\nBAD:", len(bad))
by = collections.Counter()
for p, st in sorted(bad.items()):
    kind = p.split("/")[2] if p.count("/") > 1 else p
    by[(kind, st)] += 1
for k, v in by.most_common():
    print(v, k)
for p, st in list(sorted(bad.items()))[:80]:
    print(st, p, "<-", sorted(refs.get(p, []))[:2])
json.dump({"bad": bad, "refs": {p: sorted(refs.get(p, []))[:5] for p in bad}}, open(sys.argv[2] if len(sys.argv) > 2 else "linkcheck-bad.json", "w"), ensure_ascii=False, indent=1)
