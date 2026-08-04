"use client";

import { useEffect, useState } from "react";
import {
  api,
  audienceAgeGender,
  AUDIENCE_SPENDING_LABEL,
  type AudienceLink,
  type AudienceSegment,
} from "@/lib/api";
import type { SeriesDetail } from "@/lib/series";
import { Target, Eye, Star, X } from "lucide-react";

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("th-TH", { maximumFractionDigits: 1 })}K`;
  return n.toLocaleString("th-TH");
}

export default function AudienceTab({
  series,
  reload,
  onError,
  onNotice,
}: {
  series: SeriesDetail;
  reload: () => Promise<void>;
  onError: (m: string | null) => void;
  onNotice: (m: string | null) => void;
}) {
  const seriesId = series.id;
  const [links, setLinks] = useState<AudienceLink[]>(series.audiences ?? []);
  const [busy, setBusy] = useState(false);

  // เป้ายอดวิว
  const [targetViews, setTargetViews] = useState(
    series.targetViews != null ? String(series.targetViews) : "",
  );
  const [targetUnit, setTargetUnit] = useState(series.targetViewsUnit ?? "per_episode");

  // picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<AudienceSegment[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    setLinks(series.audiences ?? []);
    setTargetViews(series.targetViews != null ? String(series.targetViews) : "");
    setTargetUnit(series.targetViewsUnit ?? "per_episode");
  }, [series.audiences, series.targetViews, series.targetViewsUnit]);

  useEffect(() => {
    if (!pickerOpen) return;
    setCatalogError(null);
    api<AudienceSegment[]>("/audience-segments?status=active")
      .then((res) => setCatalog(Array.isArray(res) ? res : []))
      .catch((err) => {
        setCatalog([]);
        setCatalogError(
          err instanceof Error ? err.message : "โหลดรายการกลุ่มผู้ชมไม่สำเร็จ (ต้องมีสิทธิ์ Settings)",
        );
      });
  }, [pickerOpen]);

  async function persist(items: { segmentId: string; isPrimary: boolean }[]) {
    setBusy(true);
    onError(null);
    try {
      const rows = await api<AudienceLink[]>(`/series/${seriesId}/audiences`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      setLinks(rows);
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกกลุ่มผู้ชมไม่สำเร็จ");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const currentItems = () => links.map((l) => ({ segmentId: l.segmentId, isPrimary: l.isPrimary }));

  function addSegment(seg: AudienceSegment) {
    if (links.some((l) => l.segmentId === seg.id)) return;
    const items = currentItems();
    void persist([...items, { segmentId: seg.id, isPrimary: items.length === 0 }]);
    setPickerOpen(false);
    setQ("");
  }

  function setPrimary(segmentId: string) {
    void persist(currentItems().map((i) => ({ ...i, isPrimary: i.segmentId === segmentId })));
  }

  function remove(segmentId: string) {
    void persist(currentItems().filter((i) => i.segmentId !== segmentId));
  }

  async function saveTarget() {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const num = targetViews.trim() === "" ? null : Math.max(0, Math.round(Number(targetViews) || 0));
      await api(`/series/${seriesId}`, {
        method: "PATCH",
        body: JSON.stringify({ targetViews: num, targetViewsUnit: targetUnit }),
      });
      onNotice("บันทึกเป้ายอดวิวแล้ว");
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกเป้ายอดวิวไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const linkedIds = new Set(links.map((l) => l.segmentId));
  const options = (catalog ?? []).filter(
    (s) => !linkedIds.has(s.id) && (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  const targetNum = targetViews.trim() === "" ? null : Number(targetViews);

  return (
    <div className="space-y-6">
      {/* ── เป้ายอดวิว ── */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="flex items-center gap-1.5 text-lg font-semibold"><Target className="size-4" /> เป้ายอดวิว</h3>
        <p className="text-xs text-zinc-500">ตั้งเป้ายอดวิวของซีรีส์ — เลือกได้ว่าเป็นต่อ EP หรือรวมทั้งซีรีส์</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={targetViews}
            onChange={(e) => setTargetViews(e.target.value)}
            inputMode="numeric"
            placeholder="เช่น 1000000"
            className="w-48 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          <div className="inline-flex overflow-hidden rounded-lg border border-zinc-700">
            {[
              { v: "per_episode", label: "ต่อ EP" },
              { v: "series_total", label: "รวมทั้งซีรีส์" },
            ].map((u) => (
              <button
                key={u.v}
                type="button"
                onClick={() => setTargetUnit(u.v)}
                className={`px-3 py-2 text-xs ${
                  targetUnit === u.v ? "bg-amber-400 font-semibold text-zinc-950" : "bg-zinc-800 text-zinc-300"
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={saveTarget}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            บันทึกเป้า
          </button>
          {targetNum != null && targetNum > 0 && (
            <span className="text-sm text-zinc-400">
              = <span className="font-semibold text-amber-300">{fmtViews(targetNum)}</span>{" "}
              {targetUnit === "per_episode" ? "วิว/ตอน" : "วิวรวม"}
            </span>
          )}
        </div>
      </section>

      {/* ── คนดูเป้าหมาย (segments) ── */}
      <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-1.5 text-lg font-semibold">
            <Eye className="size-4" /> คนดูเป้าหมาย
            <span className="ml-2 text-sm font-normal text-zinc-500">({links.length})</span>
          </h3>
          {!pickerOpen && (
            <button
              onClick={() => setPickerOpen(true)}
              disabled={busy}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              + เพิ่มกลุ่ม
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500">
          เลือกกลุ่มคนดูจาก taxonomy กลาง (ชุดเดียวกับที่ Character ใช้) — ตั้งกลุ่มหลักได้ 1 กลุ่ม
        </p>

        {pickerOpen && (
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหากลุ่มผู้ชม..."
                className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              <button
                onClick={() => {
                  setPickerOpen(false);
                  setQ("");
                }}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
              >
                ปิด
              </button>
            </div>
            {catalogError && <p className="text-xs text-amber-400/80">{catalogError}</p>}
            {catalog === null ? (
              <p className="text-sm text-zinc-500">กำลังโหลด...</p>
            ) : options.length === 0 ? (
              <p className="text-sm text-zinc-500">
                ไม่มีกลุ่มให้เลือก — สร้างกลุ่มใหม่ได้ที่ Settings → กลุ่มผู้ชม
              </p>
            ) : (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {options.map((s) => (
                  <button
                    key={s.id}
                    disabled={busy}
                    onClick={() => addSegment(s)}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-left hover:border-amber-400/60 hover:bg-zinc-900 disabled:opacity-50"
                  >
                    <span className="text-sm text-zinc-200">{s.name}</span>
                    {audienceAgeGender(s) && (
                      <span className="shrink-0 text-xs text-zinc-500">{audienceAgeGender(s)}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {links.length === 0 && !pickerOpen && (
          <p className="text-sm text-zinc-500">
            ยังไม่ได้ระบุคนดูเป้าหมาย — กด &ldquo;+ เพิ่มกลุ่ม&rdquo; เพื่อเลือกจาก taxonomy กลาง
          </p>
        )}

        {links.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {links.map((l) => (
              <div
                key={l.segmentId}
                className={`space-y-1.5 rounded-xl border bg-zinc-950/60 p-3 ${
                  l.isPrimary ? "border-amber-400/50" : "border-zinc-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{l.segment.name}</span>
                    {l.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        <Star className="size-3" /> กลุ่มหลัก
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => remove(l.segmentId)}
                    disabled={busy}
                    className="shrink-0 text-zinc-500 hover:text-red-400 disabled:opacity-50"
                    title="เอาออก"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {audienceAgeGender(l.segment) && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                      {audienceAgeGender(l.segment)}
                    </span>
                  )}
                  {l.segment.spendingPower && AUDIENCE_SPENDING_LABEL[l.segment.spendingPower] && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${AUDIENCE_SPENDING_LABEL[l.segment.spendingPower].cls}`}
                    >
                      {AUDIENCE_SPENDING_LABEL[l.segment.spendingPower].label}
                    </span>
                  )}
                  {(l.segment.interests ?? []).slice(0, 4).map((i) => (
                    <span
                      key={i}
                      className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-200"
                    >
                      {i}
                    </span>
                  ))}
                </div>
                {!l.isPrimary && (
                  <button
                    onClick={() => setPrimary(l.segmentId)}
                    disabled={busy}
                    className="text-xs text-zinc-500 hover:text-amber-300 disabled:opacity-50"
                  >
                    ตั้งเป็นกลุ่มหลัก
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
