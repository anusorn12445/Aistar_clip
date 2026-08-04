"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Folder } from "lucide-react";
import AppShell from "@/components/AppShell";
import { fetchMediaLinks, getToken, getUser, type MediaLink } from "@/lib/api";

const UNCATEGORIZED = "__uncat__";

// จัดกลุ่มด้วย category — ไม่มีหมวดไปกองท้ายสุด, คงลำดับ sortOrder จาก API
function groupByCategory(links: MediaLink[]): { category: string | null; items: MediaLink[] }[] {
  const map = new Map<string, MediaLink[]>();
  for (const l of links) {
    const key = l.category?.trim() || UNCATEGORIZED;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(l);
  }
  const cats = [...map.keys()].filter((k) => k !== UNCATEGORIZED).sort((a, b) => a.localeCompare(b, "th"));
  const groups: { category: string | null; items: MediaLink[] }[] = cats.map((c) => ({
    category: c,
    items: map.get(c)!,
  }));
  if (map.has(UNCATEGORIZED)) groups.push({ category: null, items: map.get(UNCATEGORIZED)! });
  return groups;
}

function LinkCard({ link }: { link: MediaLink }) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 transition hover:border-amber-400/50 hover:bg-zinc-800/60"
    >
      <span className="text-2xl leading-8">{link.icon || "📁"}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-100 group-hover:text-amber-200">
          {link.label}
        </p>
        {link.note && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{link.note}</p>}
        <p className="mt-1 truncate text-[11px] text-zinc-600">{link.url}</p>
      </div>
      <ArrowUpRight className="size-4 self-center text-zinc-600 transition group-hover:text-amber-300" />
    </a>
  );
}

export default function MediaCenterPage() {
  const router = useRouter();
  const [links, setLinks] = useState<MediaLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // อ่าน role จาก localStorage หลัง mount เท่านั้น — อ่านตอน render ทำ hydration mismatch
  // (server ไม่เห็นปุ่ม admin แต่ client เห็น) → React 19 ทิ้ง SSR tree ทั้งหน้า
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    setIsAdmin(getUser()?.roles?.includes("admin") ?? false);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLinks(await fetchMediaLinks());
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดลิงก์ไม่สำเร็จ");
      setLinks([]);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void load();
  }, [router, load]);

  const groups = links ? groupByCategory(links) : [];

  return (
    <AppShell
      title="Media Center"
      actions={
        isAdmin ? (
          <Link
            href="/settings?section=media"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            จัดการลิงก์
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-6">
        <p className="text-sm text-zinc-400">
          คลังงานของทีม — ลิงก์ Google Drive และแหล่งไฟล์ทั้งหมดรวมไว้ที่เดียว คลิกเพื่อเปิดในแท็บใหม่
        </p>

        {error && (
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-red-400">
            {error}
          </div>
        )}

        {!links && !error && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}

        {links && links.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 p-10 text-center">
            <Folder className="mx-auto size-8" />
            <p className="mt-3 text-sm text-zinc-400">
              ยังไม่มีลิงก์ — ไปที่ Settings → Media Center เพื่อเพิ่ม
            </p>
            {isAdmin && (
              <Link
                href="/settings?section=media"
                className="mt-4 inline-block rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
              >
                + เพิ่มลิงก์แรก
              </Link>
            )}
          </div>
        )}

        {groups.map((g) => (
          <section key={g.category ?? UNCATEGORIZED} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {g.category ?? "อื่น ๆ"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((l) => (
                <LinkCard key={l.id} link={l} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
