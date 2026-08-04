"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { PLATFORMS, platformMeta } from "@/lib/publishing";
import {
  BROADCAST_DAY_OPTIONS,
  broadcastDayLabel,
  type BroadcastSlot,
  type CalendarSuggestResult,
  type SeriesDetail,
} from "@/lib/series";
import { FilterSelect } from "@/components/ui/filter-select";
import { Calendar, CalendarRange, X, CircleCheck, ArrowRight } from "lucide-react";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

export default function BroadcastTab({
  series,
  reload,
  onError,
  onNotice,
}: {
  series: SeriesDetail;
  reload: () => Promise<void>;
  onError: (msg: string | null) => void;
  onNotice: (msg: string | null) => void;
}) {
  const [slots, setSlots] = useState<BroadcastSlot[]>(() =>
    Array.isArray(series.broadcastSchedule) ? series.broadcastSchedule : [],
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // calendar suggest
  const [season, setSeason] = useState(series.seasons[series.seasons.length - 1]?.label ?? "");
  const [weeks, setWeeks] = useState(4);
  const [startDate, setStartDate] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [result, setResult] = useState<CalendarSuggestResult | null>(null);

  useEffect(() => {
    if (!dirty) setSlots(Array.isArray(series.broadcastSchedule) ? series.broadcastSchedule : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const patchSlot = (i: number, p: Partial<BroadcastSlot>) => {
    setSlots((s) => s.map((slot, j) => (j === i ? { ...slot, ...p } : slot)));
    setDirty(true);
  };

  const save = async () => {
    const invalid = slots.find((s) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time));
    if (invalid) {
      onError(`เวลาของ slot วัน${broadcastDayLabel(invalid.day)} ไม่ถูกต้อง — ใช้รูปแบบ HH:MM เช่น 19:00`);
      return;
    }
    setSaving(true);
    onError(null);
    onNotice(null);
    try {
      await api(`/series/${series.id}`, {
        method: "PATCH",
        body: JSON.stringify({ broadcastSchedule: slots }),
      });
      onNotice("บันทึกตารางออกอากาศแล้ว");
      setDirty(false);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกตารางไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const suggest = async () => {
    if (!season.trim()) {
      onError("เลือก season ก่อนเสนอลงปฏิทิน");
      return;
    }
    setSuggesting(true);
    setResult(null);
    onError(null);
    onNotice(null);
    try {
      const res = await api<CalendarSuggestResult>(`/series/${series.id}/calendar-suggest`, {
        method: "POST",
        body: JSON.stringify({
          season: season.trim(),
          weeks,
          ...(startDate ? { startDate } : {}),
        }),
      });
      setResult(res);
      onNotice(`สร้าง ${res.created} รายการลงปฏิทินแล้ว${res.skipped ? ` (ข้าม ${res.skipped} ช่องที่มีอยู่แล้ว)` : ""}`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "เสนอลงปฏิทินไม่สำเร็จ");
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* schedule editor */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-1.5 font-semibold"><Calendar className="size-4" /> ตารางออกอากาศประจำ</h3>
            <p className="mt-1 text-xs text-zinc-500">เวลาไทย (Asia/Bangkok) — ใช้เป็นฐานเวลาเสนอลงปฏิทินคอนเทนต์</p>
          </div>
          <button
            disabled={saving || !dirty}
            onClick={save}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกตาราง"}
          </button>
        </div>

        {slots.map((slot, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <FilterSelect
              value={slot.day}
              onChange={(v) => patchSlot(i, { day: v })}
              options={BROADCAST_DAY_OPTIONS.map((d) => ({ value: d.value, label: d.label }))}
            />
            <input
              type="time"
              value={slot.time}
              onChange={(e) => patchSlot(i, { time: e.target.value })}
              className={inputCls}
            />
            <FilterSelect
              value={slot.platform}
              onChange={(v) => patchSlot(i, { platform: v })}
              options={PLATFORMS.map((p) => ({ value: p.value, label: `${p.icon} ${p.label}` }))}
            />
            <button
              onClick={() => {
                setSlots((s) => s.filter((_, j) => j !== i));
                setDirty(true);
              }}
              className="text-zinc-500 hover:text-red-400"
              title="ลบ slot"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
        {slots.length === 0 && (
          <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
            ยังไม่มีตารางออกอากาศ — เพิ่ม slot เช่น อังคาร 19:00 TikTok
          </p>
        )}
        <button
          onClick={() => {
            setSlots((s) => [...s, { day: "tue", time: "19:00", platform: "tiktok" }]);
            setDirty(true);
          }}
          className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
        >
          + เพิ่ม slot
        </button>
        {dirty && <p className="text-xs text-amber-300">มีการแก้ไขที่ยังไม่บันทึก</p>}
      </section>

      {/* calendar suggest */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h3 className="flex items-center gap-1.5 font-semibold"><CalendarRange className="size-4" /> เสนอลงปฏิทินคอนเทนต์</h3>
        <p className="text-xs text-zinc-500">
          สร้าง ContentItem (สถานะไอเดีย) ตามตารางออกอากาศ × จำนวนสัปดาห์ — จับคู่ตอนที่ตัดต่อเสร็จแล้วให้อัตโนมัติ
          และข้ามช่องที่มีรายการอยู่แล้ว
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-zinc-500">
            Season
            <input
              list={`bc-season-options-${series.id}`}
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="เช่น S1"
              className={`mt-1 block w-28 ${inputCls}`}
            />
          </label>
          <datalist id={`bc-season-options-${series.id}`}>
            {series.seasons.map((s) => (
              <option key={s.id} value={s.label} />
            ))}
          </datalist>
          <label className="text-xs text-zinc-500">
            จำนวนสัปดาห์ (1-8)
            <input
              type="number"
              min={1}
              max={8}
              value={weeks}
              onChange={(e) => setWeeks(Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 4)))}
              className={`mt-1 block w-24 ${inputCls}`}
            />
          </label>
          <label className="text-xs text-zinc-500">
            เริ่มวันที่ (ไม่ระบุ = วันนี้)
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 block ${inputCls}`}
            />
          </label>
          <button
            disabled={suggesting || slots.length === 0}
            onClick={suggest}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
          >
            {suggesting ? "กำลังสร้าง..." : "เสนอลงปฏิทิน"}
          </button>
          {slots.length === 0 && (
            <span className="text-xs text-zinc-500">ตั้งตารางออกอากาศด้านบนก่อน</span>
          )}
        </div>

        {result && (
          <div className="space-y-2 rounded-xl border border-emerald-900/60 bg-emerald-950/30 p-4">
            <p className="text-sm text-emerald-300">
              <CircleCheck className="inline size-4" /> สร้าง {result.created} รายการ · ข้าม {result.skipped} รายการที่มีอยู่แล้ว —{" "}
              <Link href="/calendar" className="underline hover:text-emerald-200">
                เปิดดูใน Content Calendar <ArrowRight className="inline size-3.5" />
              </Link>
            </p>
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {result.items.map((it, i) => {
                const pm = platformMeta(it.platform);
                return (
                  <div key={i} className={`flex items-center gap-2 text-xs ${it.skipped ? "text-zinc-600 line-through" : "text-zinc-400"}`}>
                    <span>{pm.icon}</span>
                    <span>{new Date(it.scheduledAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span className="truncate">{it.title}</span>
                    {it.episodeCode && <span className="font-mono text-amber-300/80">{it.episodeCode}</span>}
                    {it.skipped && <span>(ข้าม — มีอยู่แล้ว)</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
