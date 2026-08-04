"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  audienceAgeGender,
  AUDIENCE_SPENDING_LABEL,
  type AudienceLink,
  type AudienceSegment,
} from "@/lib/api";
import { Sparkles, Star, Users, X } from "lucide-react";

// section "กลุ่มผู้ติดตาม" ของ character — link ไป taxonomy กลาง (Audience Segment)
export default function AudienceSection({
  characterId,
  aiHint,
}: {
  characterId: string;
  aiHint?: string | null;
}) {
  const [links, setLinks] = useState<AudienceLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [catalog, setCatalog] = useState<AudienceSegment[] | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const rows = await api<AudienceLink[]>(`/characters/${characterId}/audiences`);
      setLinks(rows);
      setError(null);
    } catch (err) {
      // endpoint ยังไม่มี (API build เก่า) → empty state ไม่ crash
      setLinks([]);
      setError(err instanceof Error ? err.message : "โหลดกลุ่มผู้ติดตามไม่สำเร็จ");
    }
  }, [characterId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  // PUT ชุด link ทั้งหมดใหม่ (replace)
  async function persist(items: { segmentId: string; isPrimary: boolean }[]) {
    setBusy(true);
    setError(null);
    try {
      const rows = await api<AudienceLink[]>(`/characters/${characterId}/audiences`, {
        method: "PUT",
        body: JSON.stringify({ items }),
      });
      setLinks(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      await load();
    } finally {
      setBusy(false);
    }
  }

  const currentItems = () => (links ?? []).map((l) => ({ segmentId: l.segmentId, isPrimary: l.isPrimary }));

  function addSegment(seg: AudienceSegment) {
    if ((links ?? []).some((l) => l.segmentId === seg.id)) return;
    const items = currentItems();
    // กลุ่มแรกที่เพิ่ม → ตั้งเป็น primary ให้เลย
    const isPrimary = items.length === 0;
    void persist([...items, { segmentId: seg.id, isPrimary }]);
    setPickerOpen(false);
    setQ("");
  }

  function setPrimary(segmentId: string) {
    void persist(currentItems().map((i) => ({ ...i, isPrimary: i.segmentId === segmentId })));
  }

  function remove(segmentId: string) {
    void persist(currentItems().filter((i) => i.segmentId !== segmentId));
  }

  const linkedIds = new Set((links ?? []).map((l) => l.segmentId));
  const options = (catalog ?? []).filter(
    (s) =>
      !linkedIds.has(s.id) &&
      (!q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase())),
  );

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5" /> กลุ่มผู้ติดตาม
          {links && <span className="text-sm font-normal text-zinc-500">({links.length})</span>}
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

      {error && <p className="text-sm text-amber-400/80">{error}</p>}

      {/* AI แนะนำ — จาก commerceProfile.audience_fit (free-text) */}
      {aiHint && aiHint.trim() && (
        <div className="rounded-xl border border-sky-900/60 bg-sky-950/30 px-3 py-2 text-xs text-sky-200">
          <span className="inline-flex items-center gap-1 font-semibold">
            <Sparkles className="size-4" /> AI แนะนำ:
          </span>{" "}
          {aiHint}
          <span className="ml-1 text-sky-400/70">
            — เลือกกลุ่มจาก taxonomy กลางให้ตรงกับที่ AI ประเมิน
          </span>
        </div>
      )}

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

      {links && links.length === 0 && !pickerOpen && (
        <p className="text-sm text-zinc-500">
          ยังไม่ได้ระบุกลุ่มผู้ติดตาม — กด &ldquo;+ เพิ่มกลุ่ม&rdquo; เพื่อเลือกจาก taxonomy กลาง
        </p>
      )}

      {links && links.length > 0 && (
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
                  className="inline-flex shrink-0 items-center text-zinc-500 hover:text-red-400 disabled:opacity-50"
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
  );
}
