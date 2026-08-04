"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Brain, Clapperboard, Lightbulb, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  BrandOption,
  IDEATION_MODE_LABEL,
  IdeaCandidate,
  IdeaOption,
  IdeateInput,
  IdeationRun,
  convertIdea,
  fetchBrandOptions,
  fetchIdeaOptions,
  fetchIdeateStatus,
  fetchIdeationRun,
  fetchIdeationRuns,
  getToken,
  runIdeate,
} from "@/lib/api";

const MODES = ["auto", "guided", "iterate"] as const;

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IdeationInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ปิดวง: รับ seedText/platformHint จาก Content Analytics ("ส่งเข้า Ideation")
  const seedParam = searchParams.get("seedText") ?? "";
  const platformParam = searchParams.get("platformHint") ?? "";

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [ideaOptions, setIdeaOptions] = useState<IdeaOption[]>([]);
  const [history, setHistory] = useState<IdeationRun[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // form — seedText/platformHint prefill จาก query param (ส่งเข้า Ideation)
  const [mode, setMode] = useState<string>(seedParam ? "guided" : "auto");
  const [brandId, setBrandId] = useState<string>("");
  const [seedText, setSeedText] = useState(seedParam);
  const [seedIdeaId, setSeedIdeaId] = useState<string>("");
  const [platformHint, setPlatformHint] = useState(platformParam);
  const [count, setCount] = useState(5);
  // ดึงเทรนด์นอกผ่าน web search — default OFF (มีค่าใช้จ่ายเพิ่ม)
  const [useWebTrends, setUseWebTrends] = useState(false);

  // active run + loading
  const [loading, setLoading] = useState(false);
  const [run, setRun] = useState<IdeationRun | null>(null);
  const [comment, setComment] = useState("");
  const [convBusy, setConvBusy] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadHistory = useCallback(() => {
    fetchIdeationRuns({ pageSize: "12" })
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchIdeateStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
    fetchBrandOptions()
      .then((b) => setBrands(b.filter((x) => x.status !== "archived")))
      .catch(() => setBrands([]));
    fetchIdeaOptions()
      .then(setIdeaOptions)
      .catch(() => setIdeaOptions([]));
    loadHistory();
  }, [router, loadHistory]);

  async function generate(iterate?: { priorRunId: string; comment: string }) {
    setLoading(true);
    setError(null);
    try {
      const body: IdeateInput = iterate
        ? {
            mode: "iterate",
            priorRunId: iterate.priorRunId,
            comment: iterate.comment,
            count,
            ...(useWebTrends ? { useWebTrends: true } : {}),
          }
        : {
            mode,
            count,
            ...(brandId ? { brandId } : {}),
            ...(mode === "guided" && seedText.trim() ? { seedText: seedText.trim() } : {}),
            ...(mode === "guided" && seedIdeaId ? { seedIdeaId } : {}),
            ...(platformHint.trim() ? { platformHint: platformHint.trim() } : {}),
            ...(useWebTrends ? { useWebTrends: true } : {}),
          };
      const res = await runIdeate(body);
      setRun(res.run);
      setComment("");
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "คิดไอเดียไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function onConvert(idx: number, target: "idea" | "content") {
    if (!run) return;
    setConvBusy(`${idx}:${target}`);
    try {
      const res = await convertIdea(run.id, idx, target);
      showToast(target === "idea" ? "บันทึกเข้า Idea Library แล้ว" : "สร้างเป็นคอนเทนต์แล้ว");
      void res;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "แปลงไม่สำเร็จ");
    } finally {
      setConvBusy(null);
    }
  }

  async function openRun(id: string) {
    try {
      const r = await fetchIdeationRun(id);
      setRun(r);
      setMode(r.mode === "iterate" ? "iterate" : r.mode);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "เปิดไม่สำเร็จ");
    }
  }

  const ideas: IdeaCandidate[] = run?.resultJson ?? [];
  // รอบนี้ใช้เทรนด์นอกไหม (จาก contextJson ของ run)
  const runUsedTrends = run?.contextJson?.webTrends === true;
  const trendsSummary =
    typeof run?.contextJson?.trendsSummary === "string" ? run.contextJson.trendsSummary : null;

  return (
    <AppShell title="AI Ideation">
      {toast && (
        <div className="fixed right-6 top-20 z-50 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
          {toast}
        </div>
      )}

      {aiConfigured === false && (
        <div className="mb-4 rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          AI ยังไม่ได้ตั้งค่า — ตั้ง ANTHROPIC_API_KEY ใน Settings ก่อนถึงจะคิดไอเดียได้
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* left: controls + history */}
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            {/* mode selector */}
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">โหมด</label>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-zinc-700 p-0.5 text-xs">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2 py-1.5 ${
                    mode === m ? "bg-amber-400 text-zinc-900" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {IDEATION_MODE_LABEL[m].label}
                </button>
              ))}
            </div>
            <p className="mb-3 text-[11px] text-zinc-500">{IDEATION_MODE_LABEL[mode]?.desc}</p>

            {/* web trends toggle — ทุกโหมด (default off เพราะมีค่าใช้จ่าย web search เพิ่ม) */}
            <label
              className="mb-1 flex cursor-pointer items-center gap-2 text-xs text-zinc-300"
              title="ใช้ web search ของ Claude มีค่าใช้จ่ายเพิ่มเล็กน้อย"
            >
              <input
                type="checkbox"
                checked={useWebTrends}
                onChange={(e) => setUseWebTrends(e.target.checked)}
                className="accent-amber-400"
              />
              <Search className="size-3.5" /> ดึงเทรนด์นอก (web search)
            </label>
            <p className="mb-3 text-[11px] text-zinc-500">
              ใช้ web search ของ Claude มีค่าใช้จ่ายเพิ่มเล็กน้อย
            </p>

            {mode === "iterate" ? (
              <p className="rounded-lg border border-dashed border-zinc-700 p-3 text-xs text-zinc-500">
                Iterate: เปิดรอบเก่าจากประวัติ แล้วใส่คอมเมนต์ใต้ผลลัพธ์เพื่อให้ AI ปรับ
              </p>
            ) : (
              <>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">แบรนด์</label>
                <FilterSelect
                  value={brandId}
                  onChange={setBrandId}
                  className="mb-3 w-full"
                  options={[
                    { value: "", label: "— ไม่ระบุแบรนด์ —" },
                    ...brands.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                />

                {mode === "guided" && (
                  <>
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                      Seed — ไอเดียดิบ / โจทย์
                    </label>
                    <textarea
                      value={seedText}
                      onChange={(e) => setSeedText(e.target.value)}
                      rows={3}
                      placeholder="เช่น 'อยากทำคอนเทนต์สายฮาเรื่องส่งของช้า'"
                      className="mb-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
                    />
                    <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                      หรือดึงจาก Idea Library
                    </label>
                    <FilterSelect
                      value={seedIdeaId}
                      onChange={setSeedIdeaId}
                      className="mb-3 w-full"
                      options={[
                        { value: "", label: "— ไม่เลือก —" },
                        ...ideaOptions.map((i) => ({ value: i.id, label: i.title })),
                      ]}
                    />
                  </>
                )}

                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                  แพลตฟอร์มที่อยากเน้น (ไม่บังคับ)
                </label>
                <input
                  value={platformHint}
                  onChange={(e) => setPlatformHint(e.target.value)}
                  placeholder="เช่น tiktok, reels"
                  className="mb-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
                />

                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                  จำนวนไอเดีย: {count}
                </label>
                <input
                  type="range"
                  min={1}
                  max={10}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="mb-4 w-full accent-amber-400"
                />

                <button
                  onClick={() => generate()}
                  disabled={loading || aiConfigured === false}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                >
                  {loading ? "กำลังคิด..." : <><Brain className="size-3.5" /> คิดไอเดีย</>}
                </button>
              </>
            )}
          </div>

          {/* history */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-200">ประวัติล่าสุด</h2>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-600">ยังไม่มีรอบการคิด</p>
            ) : (
              <div className="space-y-1">
                {history.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => openRun(h.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-800 ${
                      run?.id === h.id ? "bg-zinc-800" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate text-zinc-300">
                      <span className="text-amber-300">{IDEATION_MODE_LABEL[h.mode]?.label ?? h.mode}</span>{" "}
                      · {h.ideaCount} ไอเดีย
                    </span>
                    <span className="shrink-0 text-zinc-600">{fmt(h.createdAt)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* right: results */}
        <div className="lg:col-span-2">
          {error && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
              AI กำลังคิดไอเดีย...
            </div>
          )}

          {!loading && !run && (
            <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">
              เลือกโหมดแล้วกด &ldquo;คิดไอเดีย&rdquo; — ผลลัพธ์จะขึ้นที่นี่
            </div>
          )}

          {!loading && run && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-zinc-500">
                  รอบ {IDEATION_MODE_LABEL[run.mode]?.label ?? run.mode} · {ideas.length} ไอเดีย ·{" "}
                  {fmt(run.createdAt)}
                </p>
                {runUsedTrends && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300">
                    <Search className="size-3" /> ใช้เทรนด์นอก (web search)
                  </span>
                )}
              </div>

              {runUsedTrends && trendsSummary && (
                <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3">
                  <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-zinc-300">
                    <Search className="size-3.5" /> เทรนด์ภายนอกที่ใช้ในรอบนี้ (จาก web search)
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">
                    {trendsSummary}
                  </p>
                </details>
              )}

              {ideas.map((idea, idx) => (
                <div key={idx} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold text-zinc-100">{idea.title}</h3>
                    <div className="flex shrink-0 gap-1">
                      {idea.platform && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-300">
                          {idea.platform}
                        </span>
                      )}
                      {idea.format && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">
                          {idea.format}
                        </span>
                      )}
                    </div>
                  </div>

                  {idea.hook && (
                    <p className="mt-2 text-sm text-amber-300">
                      <span className="text-zinc-500">Hook:</span> {idea.hook}
                    </p>
                  )}
                  {idea.angle && (
                    <p className="mt-1 text-sm text-zinc-300">
                      <span className="text-zinc-500">มุมเล่า:</span> {idea.angle}
                    </p>
                  )}
                  {idea.captionDirection && (
                    <p className="mt-1 text-sm text-zinc-400">
                      <span className="text-zinc-500">แนวแคปชั่น:</span> {idea.captionDirection}
                    </p>
                  )}
                  {(idea.characterHint || idea.productHint) && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {idea.characterHint && <>ตัวละคร: {idea.characterHint} </>}
                      {idea.productHint && <>· สินค้า: {idea.productHint}</>}
                    </p>
                  )}
                  {idea.rationale && (
                    <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-400">
                      <Lightbulb className="size-3.5" /> {idea.rationale}
                    </p>
                  )}
                  {idea.sourceSignals.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {idea.sourceSignals.map((s, i) => (
                        <span
                          key={i}
                          className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => onConvert(idx, "idea")}
                      disabled={convBusy === `${idx}:idea`}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-amber-400 disabled:opacity-50"
                    >
                      <Lightbulb className="size-3.5" /> บันทึกเข้า Idea Library
                    </button>
                    <button
                      onClick={() => onConvert(idx, "content")}
                      disabled={convBusy === `${idx}:content`}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:border-amber-400 disabled:opacity-50"
                    >
                      <Clapperboard className="size-3.5" /> สร้างเป็นคอนเทนต์
                    </button>
                  </div>
                </div>
              ))}

              {/* iterate box */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
                  ไม่ถูกใจ? คอมเมนต์เพื่อให้ AI ปรับ (Iterate)
                </label>
                <div className="flex gap-2">
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="เช่น 'ขอฮากว่านี้' หรือ 'เน้น TikTok มากขึ้น'"
                    className="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => generate({ priorRunId: run.id, comment: comment.trim() })}
                    disabled={loading || !comment.trim() || aiConfigured === false}
                    className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-900 disabled:opacity-50"
                  >
                    ปรับใหม่
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

export default function IdeationPage() {
  return (
    <Suspense fallback={null}>
      <IdeationInner />
    </Suspense>
  );
}
