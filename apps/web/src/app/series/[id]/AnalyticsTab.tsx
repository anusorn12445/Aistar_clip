"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { formatNumber, type SeriesAnalytics, type SeriesDetail } from "@/lib/series";
import { TrendingUp, ArrowRight, Trophy, ChevronUp, ChevronDown } from "lucide-react";

export default function AnalyticsTab({ series }: { series: SeriesDetail }) {
  const [data, setData] = useState<SeriesAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<SeriesAnalytics>(`/series/${series.id}/analytics`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลด analytics ไม่สำเร็จ");
    }
  }, [series.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={load} className="mt-3 text-sm text-amber-300 hover:underline">
          ลองใหม่
        </button>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-zinc-500">กำลังโหลด analytics...</p>;

  if (!data.hasData) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-800 py-14 text-center">
        <p className="text-3xl"><TrendingUp className="inline size-8" /></p>
        <p className="mt-3 text-zinc-300">ยังไม่มีข้อมูล performance ของซีรีส์นี้</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500">
          ตัวเลข views / GMV จะรวมจากผล performance ของคอนเทนต์ที่ผูกกับตอนในซีรีส์ —
          บันทึกผลได้ที่หน้า Performance (กรอกเอง หรือ import CSV)
        </p>
        <Link
          href="/performance"
          className="mt-4 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          ไปหน้า Performance <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* sequel suggestion */}
      {data.sequelSuggestion && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/5 p-5">
          <h3 className="flex items-center gap-1.5 font-semibold text-amber-300"><Trophy className="size-4" /> ตอนที่ควรต่อยอด</h3>
          <p className="mt-1 text-sm text-zinc-300">{data.sequelSuggestion.reason}</p>
          <Link
            href={`/episodes/${data.sequelSuggestion.episodeId}`}
            className="mt-2 inline-flex items-center gap-1 text-sm text-amber-300 hover:underline"
          >
            เปิดดู {data.sequelSuggestion.displayCode} <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      {/* season rollups */}
      {data.seasons.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.seasons.map((s) => (
            <div key={s.season} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4">
              <p className="text-xs text-zinc-500">{s.season} · {s.episodeCount} ตอน</p>
              <p className="mt-1 text-lg font-semibold">{formatNumber(s.views)} <span className="text-xs font-normal text-zinc-500">views</span></p>
              <p className="text-sm text-emerald-300">฿{s.gmv.toLocaleString()} <span className="text-xs text-zinc-500">GMV</span></p>
              <p className="mt-1 text-xs text-zinc-500">
                drop-off เฉลี่ย:{" "}
                {s.avgDropOff === null ? "—" : (
                  <span className={s.avgDropOff > 30 ? "text-red-400" : "text-zinc-300"}>
                    {s.avgDropOff}%{s.avgDropOff > 30 ? <ChevronDown className="inline size-3" /> : null}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* per-episode table */}
      <div className="overflow-hidden rounded-2xl border border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">ตอน</th>
                <th className="px-4 py-3 font-medium">ชื่อตอน</th>
                <th className="px-4 py-3 text-right font-medium">Views</th>
                <th className="px-4 py-3 text-right font-medium">Likes</th>
                <th className="px-4 py-3 text-right font-medium">Orders</th>
                <th className="px-4 py-3 text-right font-medium">GMV (฿)</th>
                <th className="px-4 py-3 text-right font-medium">Drop-off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data.items.map((row) => (
                <tr key={row.episodeId} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-2.5 font-mono text-xs text-amber-300">
                    {row.season ?? "—"} EP{row.episodeNumber ?? "?"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/episodes/${row.episodeId}`} className="hover:text-amber-300 hover:underline">
                      {row.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right text-zinc-300">{formatNumber(row.views)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{formatNumber(row.likes)}</td>
                  <td className="px-4 py-2.5 text-right text-zinc-400">{row.orders.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right text-emerald-300">{row.gmv.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right">
                    {row.dropOffPct === null ? (
                      <span className="text-zinc-600">—</span>
                    ) : row.dropOffPct > 30 ? (
                      <span className="inline-flex items-center gap-0.5 font-semibold text-red-400"><ChevronDown className="size-3" /> {row.dropOffPct}%</span>
                    ) : row.dropOffPct < 0 ? (
                      <span className="inline-flex items-center gap-0.5 text-emerald-400"><ChevronUp className="size-3" /> {Math.abs(row.dropOffPct)}%</span>
                    ) : (
                      <span className="text-zinc-300">{row.dropOffPct}%</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-zinc-500">
        Drop-off = views ที่หายไปเทียบตอนก่อนหน้าใน season เดียวกัน — เกิน 30% ขึ้น <ChevronDown className="inline size-3" /> แดง ควรรีวิว hook ของตอนนั้น
      </p>
    </div>
  );
}
