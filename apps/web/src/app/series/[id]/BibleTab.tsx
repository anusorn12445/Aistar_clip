"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { normalizeBible, type BibleDraftResult, type SeriesBible, type SeriesDetail } from "@/lib/series";
import { FileText, X } from "lucide-react";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

export default function BibleTab({
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
  const [bible, setBible] = useState<Required<SeriesBible>>(() => normalizeBible(series.bible));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  // sync เมื่อ series โหลดใหม่ (เฉพาะตอนที่ยังไม่มีแก้ค้าง — กันทับงานที่พิมพ์อยู่)
  useEffect(() => {
    if (!dirty) setBible(normalizeBible(series.bible));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series]);

  const patch = (p: Partial<Required<SeriesBible>>) => {
    setBible((b) => ({ ...b, ...p }));
    setDirty(true);
  };

  const hasBible =
    bible.world_rules.length > 0 ||
    bible.timeline.length > 0 ||
    bible.relationships.length > 0 ||
    bible.last_cliffhanger.trim() !== "" ||
    bible.notes.trim() !== "";

  const save = async () => {
    setSaving(true);
    onError(null);
    onNotice(null);
    try {
      await api(`/series/${series.id}`, { method: "PATCH", body: JSON.stringify({ bible }) });
      onNotice("บันทึก Series Bible แล้ว");
      setDirty(false);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึก bible ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const aiDraft = async () => {
    setAiBusy(true);
    onError(null);
    onNotice(null);
    try {
      const res = await api<BibleDraftResult>(`/ai/series/${series.id}/bible-draft`, { method: "POST" });
      setBible(normalizeBible(res.bible));
      setDirty(true);
      onNotice("AI ร่าง bible ให้แล้ว — ตรวจ/แก้ไขแล้วกด “บันทึก Bible” เพื่อยืนยัน");
    } catch (err) {
      onError(err instanceof Error ? err.message : "AI ร่าง bible ไม่สำเร็จ");
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">Series Bible</h3>
        <span className="text-xs text-zinc-500">เอกสาร continuity กลางของเรื่อง — AI ใช้เช็คความต่อเนื่องและคิดตอนถัดไป</span>
        <div className="flex-1" />
        <button
          disabled={aiBusy}
          onClick={aiDraft}
          className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
        >
          {aiBusy ? "AI กำลังร่าง (1-2 นาที)..." : "AI ร่าง Bible จากตอนที่มีอยู่"}
        </button>
        <button
          disabled={saving || !dirty}
          onClick={save}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก Bible"}
        </button>
      </div>

      {!hasBible && !dirty && (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 p-6 text-center">
          <p className="mt-2 text-zinc-300">ซีรีส์นี้ยังไม่มี Bible</p>
          <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">
            Series Bible คือสมองของเรื่อง — เก็บกฎของโลก ไทม์ไลน์ สถานะความสัมพันธ์ และ cliffhanger ล่าสุด
            ทำให้ทุกตอนใหม่ต่อเนื่องไม่หลุด แม้เปลี่ยนคนเขียนหรือให้ AI ช่วยคิด ยิ่งซีรีส์ยาว ยิ่งขาดไม่ได้
          </p>
          <p className="mt-2 text-xs text-zinc-600">เริ่มกรอกเองด้านล่าง หรือให้ AI ร่างจากตอนที่มีอยู่</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* world rules */}
        <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h4 className="text-sm font-semibold">กฎของโลก (World Rules)</h4>
          {bible.world_rules.map((rule, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={rule}
                onChange={(e) =>
                  patch({ world_rules: bible.world_rules.map((r, j) => (j === i ? e.target.value : r)) })
                }
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={() => patch({ world_rules: bible.world_rules.filter((_, j) => j !== i) })}
                className="text-zinc-500 hover:text-red-400"
                title="ลบ"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => patch({ world_rules: [...bible.world_rules, ""] })}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            + เพิ่มกฎ
          </button>
        </section>

        {/* relationships */}
        <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h4 className="text-sm font-semibold">ความสัมพันธ์ (สถานะล่าสุด)</h4>
          {bible.relationships.map((rel, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={rel.pair}
                onChange={(e) =>
                  patch({
                    relationships: bible.relationships.map((r, j) => (j === i ? { ...r, pair: e.target.value } : r)),
                  })
                }
                placeholder="คู่ เช่น มีนา × ต้นน้ำ"
                className={`w-40 ${inputCls}`}
              />
              <input
                value={rel.status}
                onChange={(e) =>
                  patch({
                    relationships: bible.relationships.map((r, j) => (j === i ? { ...r, status: e.target.value } : r)),
                  })
                }
                placeholder="สถานะ เช่น รักกันแต่ปิดบังครอบครัว"
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={() => patch({ relationships: bible.relationships.filter((_, j) => j !== i) })}
                className="text-zinc-500 hover:text-red-400"
                title="ลบ"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => patch({ relationships: [...bible.relationships, { pair: "", status: "" }] })}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            + เพิ่มความสัมพันธ์
          </button>
        </section>

        {/* timeline */}
        <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-2">
          <h4 className="text-sm font-semibold">ไทม์ไลน์เหตุการณ์สำคัญ</h4>
          {bible.timeline.map((t, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={t.when}
                onChange={(e) =>
                  patch({ timeline: bible.timeline.map((x, j) => (j === i ? { ...x, when: e.target.value } : x)) })
                }
                placeholder="เมื่อไหร่ เช่น S1 EP2"
                className={`w-40 ${inputCls}`}
              />
              <input
                value={t.event}
                onChange={(e) =>
                  patch({ timeline: bible.timeline.map((x, j) => (j === i ? { ...x, event: e.target.value } : x)) })
                }
                placeholder="เกิดอะไรขึ้น"
                className={`flex-1 ${inputCls}`}
              />
              <button
                onClick={() => patch({ timeline: bible.timeline.filter((_, j) => j !== i) })}
                className="text-zinc-500 hover:text-red-400"
                title="ลบ"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <button
            onClick={() => patch({ timeline: [...bible.timeline, { when: "", event: "" }] })}
            className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
          >
            + เพิ่มเหตุการณ์
          </button>
        </section>

        {/* cliffhanger + notes */}
        <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h4 className="text-sm font-semibold">Cliffhanger ล่าสุด</h4>
          <textarea
            value={bible.last_cliffhanger}
            onChange={(e) => patch({ last_cliffhanger: e.target.value })}
            rows={3}
            placeholder="สิ่งที่ค้างไว้ท้ายตอนล่าสุด — ตอนถัดไปต้องสานต่อ"
            className={`w-full resize-y ${inputCls}`}
          />
        </section>
        <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold"><FileText className="size-4" /> โน้ตทีมเขียนบท</h4>
          <textarea
            value={bible.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            placeholder="โทนเรื่อง สิ่งที่ห้ามลืม ข้อควรระวัง..."
            className={`w-full resize-y ${inputCls}`}
          />
        </section>
      </div>

      {dirty && (
        <p className="text-xs text-amber-300">มีการแก้ไขที่ยังไม่บันทึก — กด &ldquo;บันทึก Bible&rdquo; ด้านบน</p>
      )}
    </div>
  );
}
