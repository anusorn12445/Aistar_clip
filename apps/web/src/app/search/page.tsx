"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Drama, FileText, Image as ImageIcon, ShoppingBag, Target, Tv, Clapperboard,
  Calendar, Lightbulb, Search, MapPin, CircleCheck, type LucideIcon,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { api, getToken } from "@/lib/api";
import { gradientFor, initialOf, useAssetImage } from "@/lib/media";

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string | null;
  status: string | null;
  href: string;
}

// ลำดับ + หัวข้อภาษาไทยต่อกลุ่ม
const TYPE_META: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "characters", label: "ตัวละคร", icon: Drama },
  { key: "prompts", label: "พรอมป์ต", icon: FileText },
  { key: "assets", label: "ไฟล์ / Asset", icon: ImageIcon },
  { key: "products", label: "สินค้า", icon: ShoppingBag },
  { key: "campaigns", label: "แคมเปญ", icon: Target },
  { key: "series", label: "ซีรีส์", icon: Tv },
  { key: "episodes", label: "เอพิโสด", icon: Clapperboard },
  { key: "contents", label: "คอนเทนต์", icon: Calendar },
  { key: "ideas", label: "ไอเดีย", icon: Lightbulb },
  { key: "competitors", label: "คู่แข่ง", icon: Search },
  { key: "locations", label: "โลเคชัน", icon: MapPin },
  { key: "tasks", label: "งาน", icon: CircleCheck },
];

// entity ที่มีรูปให้ดึงผ่าน thumbnails endpoint — ที่เหลือใช้ emoji tile
const AVATAR_ENTITY: Record<string, string> = {
  characters: "character",
  products: "product",
  episodes: "episode",
  campaigns: "campaign",
};

// visual นำหน้าแต่ละผลลัพธ์: รูปจริง > gradient avatar > emoji tile
function ResultVisual({ result, icon: Icon }: { result: SearchResult; icon: LucideIcon }) {
  // ผลลัพธ์ประเภท asset — id คือ asset id โชว์รูปตรงๆ ได้เลย
  const assetUrl = useAssetImage(result.type === "assets" ? result.id : null);
  const entityType = AVATAR_ENTITY[result.type];

  if (result.type === "assets") {
    return (
      <span
        className="flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-lg"
        style={assetUrl ? undefined : { background: gradientFor(result.title) }}
      >
        {assetUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl} alt={result.title} className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-4 text-zinc-200" />
        )}
      </span>
    );
  }
  if (entityType) {
    return <EntityAvatar entityType={entityType} id={result.id} name={result.title} size="md" />;
  }
  return (
    <span
      className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg text-base"
      style={{ background: gradientFor(result.title) }}
      title={initialOf(result.title)}
    >
      <Icon className="size-4 text-zinc-100" />
    </span>
  );
}

function SearchContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ q });
      if (selectedTypes.length) params.set("types", selectedTypes.join(","));
      setResults(await api<SearchResult[]>(`/search?${params.toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ค้นหาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [q, selectedTypes]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    load();
  }, [router, load]);

  function toggleType(key: string) {
    setSelectedTypes((prev) =>
      prev.includes(key) ? prev.filter((t) => t !== key) : [...prev, key],
    );
  }

  const groups = TYPE_META.map((meta) => ({
    ...meta,
    items: results.filter((r) => r.type === meta.key),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h2 className="text-sm text-zinc-400">
          ผลการค้นหา{" "}
          {q ? (
            <>
              &ldquo;<span className="font-semibold text-amber-300">{q}</span>&rdquo; —{" "}
              {loading ? "กำลังค้นหา..." : `พบ ${results.length} รายการ`}
            </>
          ) : (
            "— พิมพ์คำค้นในช่องด้านบนแล้วกด Enter"
          )}
        </h2>

        {/* type filter chips */}
        <div className="flex flex-wrap gap-2">
          {TYPE_META.map((t) => {
            const active = selectedTypes.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => toggleType(t.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs ${
                  active
                    ? "border-amber-400 bg-amber-400/10 text-amber-300"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <t.icon className="size-3.5" /> {t.label}
              </button>
            );
          })}
          {selectedTypes.length > 0 && (
            <button
              onClick={() => setSelectedTypes([])}
              className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-500 hover:bg-zinc-800"
            >
              ล้าง filter ({selectedTypes.length})
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
            <g.icon className="size-4" /> {g.label}
            <span className="ml-2 text-xs font-normal text-zinc-500">({g.items.length})</span>
          </h3>
          <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40">
            {g.items.map((r) => (
              <Link
                key={`${r.type}-${r.id}`}
                href={r.href}
                className="flex items-center justify-between gap-4 border-b border-zinc-800/60 px-4 py-3 last:border-b-0 hover:bg-zinc-900"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ResultVisual result={r} icon={g.icon} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-100">{r.title}</p>
                    {r.subtitle && <p className="truncate text-xs text-zinc-500">{r.subtitle}</p>}
                  </div>
                </div>
                {r.status && (
                  <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-400">
                    {r.status}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}

      {q && !loading && results.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-16 text-center text-zinc-500">
          <Search className="mx-auto size-8" />
          <p className="mt-2 text-sm">ไม่พบผลลัพธ์สำหรับ &ldquo;{q}&rdquo;</p>
          <p className="mt-1 text-xs">ลองใช้คำสั้นลง หรือตรวจสอบตัวสะกด</p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <AppShell title="ค้นหาทั้งระบบ">
      <Suspense fallback={<p className="text-sm text-zinc-500">กำลังโหลด...</p>}>
        <SearchContent />
      </Suspense>
    </AppShell>
  );
}
