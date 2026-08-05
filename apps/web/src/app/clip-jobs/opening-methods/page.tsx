"use client";

import { useEffect, useMemo, useState } from "react";
import { Package, RefreshCw, Hand, Camera, Volume2, Clock } from "lucide-react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

interface OpeningMethod {
  code: string;
  labelTh: string;
  labelEn: string;
  phase: "prep" | "open" | "dispense" | "reclose";
  group: string;
  motionAxis: string;
  hands: 1 | 2;
  toolRequired: string;
  tamperEvident: boolean;
  reclosable: boolean;
  clipSec: number;
  cameraHint: string;
  sfxTag: string;
  motionEn: string;
}
interface Resp {
  items: OpeningMethod[];
  sequences: { packagingType: string; codes: string[] }[];
  total: number;
}

const PHASE_TH: Record<string, string> = { prep: "เตรียม/ซีล", open: "เปิด", dispense: "จ่ายเนื้อ", reclose: "ปิดกลับ" };
const PHASE_COLOR: Record<string, string> = {
  prep: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  open: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  dispense: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  reclose: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

export default function OpeningMethodsPage() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<string>("all");

  const load = () => {
    setLoading(true);
    api<Resp>("/clip-jobs/opening-methods")
      .then((d) => { setData(d); setErr(null); })
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const shown = useMemo(
    () => (data?.items ?? []).filter((m) => phase === "all" || m.phase === phase),
    [data, phase],
  );
  const phases = ["all", "prep", "open", "dispense", "reclose"];

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-100">
              <Package className="h-5 w-5 text-amber-300" /> คลังวิธีเปิดบรรจุภัณฑ์
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              master data วิธีเปิด — ใช้จัดฉากแกะ/สาธิตให้มือ ทิศการเคลื่อนไหว เสียง และเวลาถูกต้อง
              {data ? ` · ${data.total} วิธี` : ""}
            </p>
          </div>
          <button onClick={load} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="mr-1 inline h-3.5 w-3.5" /> รีเฟรช
          </button>
        </div>

        <div className="mb-3 flex flex-wrap gap-2">
          {phases.map((p) => (
            <button
              key={p}
              onClick={() => setPhase(p)}
              className={`rounded-full border px-3 py-1 text-xs ${
                phase === p ? "border-amber-400 bg-amber-400/10 text-amber-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {p === "all" ? "ทั้งหมด" : PHASE_TH[p]}
            </button>
          ))}
        </div>

        {loading && <p className="text-sm text-zinc-400">กำลังโหลด…</p>}
        {err && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{err}</p>}

        {!loading && !err && (
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/60 text-xs text-zinc-400">
                <tr>
                  <th className="px-3 py-2">วิธีเปิด</th>
                  <th className="px-3 py-2">ช่วง</th>
                  <th className="px-3 py-2">กลุ่ม/ทิศ</th>
                  <th className="px-3 py-2"><Hand className="inline h-3.5 w-3.5" /> มือ</th>
                  <th className="px-3 py-2">เครื่องมือ/ซีล</th>
                  <th className="px-3 py-2"><Volume2 className="inline h-3.5 w-3.5" /> เสียง</th>
                  <th className="px-3 py-2"><Clock className="inline h-3.5 w-3.5" /> วิ</th>
                  <th className="px-3 py-2"><Camera className="inline h-3.5 w-3.5" /> มุมกล้อง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {shown.map((m) => (
                  <tr key={m.code} className="hover:bg-zinc-900/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-100">{m.labelTh}</div>
                      <div className="font-mono text-[11px] text-zinc-500">{m.code}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`rounded border px-2 py-0.5 text-[11px] ${PHASE_COLOR[m.phase]}`}>{PHASE_TH[m.phase]}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">
                      <div>{m.group}</div>
                      <div className="text-[11px] text-zinc-500">{m.motionAxis}</div>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{m.hands} มือ</td>
                    <td className="px-3 py-2 text-zinc-300">
                      <div>{m.toolRequired === "none" ? "—" : m.toolRequired}</div>
                      <div className="text-[11px] text-zinc-500">
                        {m.tamperEvident ? "ทำลายซีล" : ""}{m.tamperEvident && m.reclosable ? " · " : ""}{m.reclosable ? "ปิดซ้ำได้" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-300">{m.sfxTag === "none" ? "—" : m.sfxTag}</td>
                    <td className="px-3 py-2 text-zinc-300">{m.clipSec}</td>
                    <td className="px-3 py-2 text-[12px] text-zinc-400">{m.cameraHint}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !err && data && (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-semibold text-zinc-200">ลำดับการเปิดเริ่มต้น (ต่อชนิดแพ็กเกจ)</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {data.sequences.map((s) => (
                <div key={s.packagingType} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="font-mono text-xs text-amber-300">{s.packagingType}</div>
                  <div className="mt-1 text-[12px] text-zinc-400">
                    {s.codes
                      .map((c) => data.items.find((m) => m.code === c)?.labelTh ?? c)
                      .join(" → ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
