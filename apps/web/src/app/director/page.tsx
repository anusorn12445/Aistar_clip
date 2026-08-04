"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Clapperboard,
  Grab,
  Hand,
  Lightbulb,
  MessageSquare,
  Package,
  RefreshCw,
  TriangleAlert,
  Video,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import { Paged, SECTION_LABEL } from "@/lib/interaction";
import { HandProfile, fetchAllHands } from "@/lib/interaction";
import {
  DIRECTOR_OBJECTIVES,
  DIRECTOR_PLATFORMS,
  DIRECTOR_STATUS_LABEL,
  DIRECTOR_STYLES,
  DirectorRecipeStep,
  DirectorRun,
  RecommendDirectorInput,
  applyDirectorRun,
  fetchDirectorRun,
  fetchDirectorRuns,
  fetchDirectorStatus,
  recommendDirector,
} from "@/lib/director";

interface ProductOption {
  id: string;
  displayCode: string;
  name: string;
  category: string | null;
}

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DirectorPage() {
  const router = useRouter();

  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [hands, setHands] = useState<HandProfile[]>([]);
  const [history, setHistory] = useState<DirectorRun[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // form
  const [productId, setProductId] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [packagingType, setPackagingType] = useState("");
  const [platform, setPlatform] = useState<string>("tiktok");
  const [targetDurationSec, setTargetDurationSec] = useState(15);
  const [objective, setObjective] = useState<string>("conversion");
  const [creativeStyle, setCreativeStyle] = useState<string>("premium");
  const [preferredHandId, setPreferredHandId] = useState("");
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(false);
  const [applyingBusy, setApplyingBusy] = useState(false);
  const [run, setRun] = useState<DirectorRun | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const loadHistory = useCallback(() => {
    fetchDirectorRuns({ page: "1" })
      .then((r) => setHistory(r.items))
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchDirectorStatus()
      .then((s) => setAiConfigured(s.configured))
      .catch(() => setAiConfigured(false));
    api<Paged<ProductOption>>("/products?status=active")
      .then((r) => setProducts(r.items))
      .catch(() => setProducts([]));
    fetchAllHands()
      .then((h) => setHands(h.filter((x) => x.status === "active" && !x.isChild)))
      .catch(() => setHands([]));
    loadHistory();
  }, [router, loadHistory]);

  async function recommend() {
    setLoading(true);
    setError(null);
    try {
      const body: RecommendDirectorInput = {
        ...(productId ? { productId } : {}),
        ...(productCategory.trim() ? { productCategory: productCategory.trim() } : {}),
        ...(packagingType.trim() ? { packagingType: packagingType.trim() } : {}),
        ...(platform ? { platform } : {}),
        ...(targetDurationSec ? { targetDurationSec } : {}),
        ...(objective ? { objective } : {}),
        ...(creativeStyle ? { creativeStyle } : {}),
        ...(preferredHandId ? { preferredHandId } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const res = await recommendDirector(body);
      setRun(res);
      if (res.status === "failed") {
        setError(res.errorMessage ?? "แนะนำสูตรไม่สำเร็จ");
      }
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "แนะนำสูตรไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  async function openRun(id: string) {
    try {
      const r = await fetchDirectorRun(id);
      setRun(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      showToast(e instanceof Error ? e.message : "เปิดไม่สำเร็จ");
    }
  }

  async function onApply() {
    if (!run) return;
    setApplyingBusy(true);
    try {
      const tpl = await applyDirectorRun(run.id);
      showToast(`บันทึกเป็นเทมเพลต ${tpl.displayCode} แล้ว`);
      loadHistory();
      router.push(`/interaction-templates/${tpl.id}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "บันทึกเทมเพลตไม่สำเร็จ");
    } finally {
      setApplyingBusy(false);
    }
  }

  function copyText(text: string, label: string) {
    void navigator.clipboard.writeText(text).then(() => showToast(`คัดลอก${label}แล้ว`));
  }

  const result = run?.resultJson ?? null;
  const steps: DirectorRecipeStep[] = run?.steps ?? result?.steps ?? [];

  return (
    <AppShell title="AI Director">
      {toast && (
        <div className="fixed right-6 top-20 z-50 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
          {toast}
        </div>
      )}

      {aiConfigured === false && (
        <div className="mb-4 rounded-lg border border-amber-900 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
          AI ยังไม่ได้ตั้งค่า — ตั้ง ANTHROPIC_API_KEY ใน Settings ก่อนถึงจะแนะนำสูตรได้
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* left: wizard controls + history */}
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">สินค้า (ไม่บังคับ)</label>
            <FilterSelect
              value={productId}
              onChange={setProductId}
              className="mb-3 w-full"
              options={[
                { value: "", label: "— ไม่อ้างสินค้า (ระบุหมวด/บรรจุภัณฑ์เอง) —" },
                ...products.map((p) => ({ value: p.id, label: p.name })),
              ]}
            />

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">หมวดสินค้า</label>
                <input
                  value={productCategory}
                  onChange={(e) => setProductCategory(e.target.value)}
                  placeholder="beauty, food..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">บรรจุภัณฑ์</label>
                <input
                  value={packagingType}
                  onChange={(e) => setPackagingType(e.target.value)}
                  placeholder="bottle, jar, spray..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">แพลตฟอร์ม</label>
            <FilterSelect
              value={platform}
              onChange={setPlatform}
              className="mb-3 w-full"
              options={DIRECTOR_PLATFORMS.map((p) => ({ value: p, label: p }))}
            />

            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">
              ความยาวเป้าหมาย: {targetDurationSec} วิ
            </label>
            <input
              type="range"
              min={5}
              max={60}
              value={targetDurationSec}
              onChange={(e) => setTargetDurationSec(Number(e.target.value))}
              className="mb-3 w-full accent-amber-400"
            />

            <div className="mb-3 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">วัตถุประสงค์</label>
                <FilterSelect
                  value={objective}
                  onChange={setObjective}
                  className="w-full"
                  options={DIRECTOR_OBJECTIVES.map((o) => ({ value: o, label: o }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">สไตล์</label>
                <FilterSelect
                  value={creativeStyle}
                  onChange={setCreativeStyle}
                  className="w-full"
                  options={DIRECTOR_STYLES.map((s) => ({ value: s, label: s }))}
                />
              </div>
            </div>

            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">มือที่อยากใช้ (ไม่บังคับ)</label>
            <FilterSelect
              value={preferredHandId}
              onChange={setPreferredHandId}
              className="mb-3 w-full"
              options={[
                { value: "", label: "— ให้ AI เลือกให้ —" },
                ...hands.map((h) => ({ value: h.id, label: `${h.name} (${h.displayCode})` })),
              ]}
            />

            <label className="mb-1.5 block text-xs font-semibold text-zinc-400">โจทย์เพิ่มเติม</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="เช่น 'เน้นโชว์เนื้อครีม' หรือ 'สายมินิมอล'"
              className="mb-4 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />

            <button
              onClick={recommend}
              disabled={loading || aiConfigured === false}
              className="w-full rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
            >
              {loading ? "กำลังแนะนำ..." : "แนะนำสูตร"}
            </button>
          </div>

          {/* history */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-200">รอบล่าสุด</h2>
            {history.length === 0 ? (
              <p className="text-xs text-zinc-600">ยังไม่มีรอบแนะนำ</p>
            ) : (
              <div className="space-y-1">
                {history.map((h) => {
                  const st = DIRECTOR_STATUS_LABEL[h.status] ?? { label: h.status, cls: "bg-zinc-700 text-zinc-200" };
                  return (
                    <button
                      key={h.id}
                      onClick={() => openRun(h.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-zinc-800 ${
                        run?.id === h.id ? "bg-zinc-800" : ""
                      }`}
                    >
                      <span className="min-w-0 truncate text-zinc-300">
                        <span className="text-amber-300">{h.displayCode}</span> ·{" "}
                        {h.productCategory ?? h.packagingType ?? "—"}
                      </span>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* right: recommendation */}
        <div className="lg:col-span-2">
          {error && (
            <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {loading && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-500">
              <Clapperboard className="mx-auto mb-2 size-6" /> AI กำลังจัดสูตรถ่าย...
            </div>
          )}

          {!loading && !run && (
            <div className="rounded-xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">
              ตั้งค่าพารามิเตอร์แล้วกด &ldquo;แนะนำสูตร&rdquo; — สูตร + เหตุผล + prompt จะขึ้นที่นี่
            </div>
          )}

          {!loading && run && result && run.status !== "failed" && (
            <div className="space-y-4">
              {/* summary header */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-zinc-500">
                      {run.displayCode} · {result.storyboardType ?? "—"} · ~{result.durationSec ?? "—"} วิ ·{" "}
                      {fmt(run.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-zinc-200">{result.summary}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={recommend}
                      disabled={loading}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-400"
                    >
                      <RefreshCw className="size-4" /> แนะนำใหม่
                    </button>
                    <button
                      onClick={onApply}
                      disabled={applyingBusy || run.status === "applied"}
                      className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-900 disabled:opacity-50"
                    >
                      {run.status === "applied" ? "บันทึกแล้ว" : applyingBusy ? "กำลังบันทึก..." : "บันทึกเป็นเทมเพลต"}
                    </button>
                  </div>
                </div>
              </div>

              {/* validation */}
              {(result.validation.errors.length > 0 || result.validation.warnings.length > 0) && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-xs">
                  {result.validation.errors.map((e, i) => (
                    <p key={`e${i}`} className="flex items-center gap-1 text-red-300"><Ban className="size-4 shrink-0" /> {e}</p>
                  ))}
                  {result.validation.warnings.map((w, i) => (
                    <p key={`w${i}`} className="flex items-center gap-1 text-amber-300"><TriangleAlert className="size-4 shrink-0" /> {w}</p>
                  ))}
                </div>
              )}

              {/* per-step cards */}
              <div className="space-y-3">
                {steps.map((s) => {
                  const sec = SECTION_LABEL[s.section] ?? { label: s.section, cls: "bg-zinc-800 text-zinc-300" };
                  return (
                    <div key={s.stepOrder} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-xs text-zinc-600">#{s.stepOrder + 1}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[11px] ${sec.cls}`}>{sec.label}</span>
                        {s.durationSec != null && (
                          <span className="text-[11px] text-zinc-500">{s.durationSec} วิ</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {s.gesture && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-900/50 px-1.5 py-0.5 text-[11px] text-blue-200">
                            <Grab className="size-4" /> {s.gesture.name}
                          </span>
                        )}
                        {s.hand && (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-900/50 px-1.5 py-0.5 text-[11px] text-purple-200">
                            <Hand className="size-4" /> {s.hand.name}
                          </span>
                        )}
                        {s.camera && (
                          <span className="inline-flex items-center gap-1 rounded bg-cyan-900/50 px-1.5 py-0.5 text-[11px] text-cyan-200">
                            <Video className="size-4" /> {s.camera.name}
                          </span>
                        )}
                        {s.lighting && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-900/50 px-1.5 py-0.5 text-[11px] text-amber-200">
                            <Lightbulb className="size-4" /> {s.lighting.name}
                          </span>
                        )}
                      </div>
                      {s.reason && (
                        <p className="mt-2 flex items-center gap-1 rounded-lg bg-zinc-800/50 px-2.5 py-1.5 text-xs text-zinc-400">
                          <MessageSquare className="size-4 shrink-0" /> {s.reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* reasons (§3.13.3) */}
              {result.reasons.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-200">เหตุผลของ AI Director</h3>
                  <ul className="space-y-1.5">
                    {result.reasons.map((r, i) => (
                      <li key={i} className="text-xs text-zinc-400">
                        <span className="font-semibold text-amber-300">{r.topic}:</span> {r.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* prompt package */}
              {result.promptPackage.steps.length > 0 && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200"><Package className="size-4" /> Prompt Package</h3>
                    <button
                      onClick={() => copyText(result.promptPackage.combined, "ทั้งชุด")}
                      className="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:border-amber-400"
                    >
                      คัดลอกทั้งหมด
                    </button>
                  </div>
                  <div className="space-y-2">
                    {result.promptPackage.steps.map((ps) => (
                      <div key={ps.order} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-2.5">
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-zinc-400">{ps.title}</span>
                          <button
                            onClick={() =>
                              copyText(
                                ps.negativePrompt ? `${ps.prompt}\nNegative: ${ps.negativePrompt}` : ps.prompt,
                                `Step ${ps.order}`,
                              )
                            }
                            className="text-[11px] text-zinc-500 hover:text-amber-300"
                          >
                            คัดลอก
                          </button>
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-zinc-400">
                          {ps.prompt}
                        </pre>
                        {ps.negativePrompt && (
                          <p className="mt-1 text-[11px] text-red-300/80">Negative: {ps.negativePrompt}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!loading && run && run.status === "failed" && (
            <div className="rounded-xl border border-red-900 bg-red-950/30 p-6 text-sm text-red-300">
              <p className="font-semibold">แนะนำสูตรไม่สำเร็จ ({run.displayCode})</p>
              <p className="mt-1 text-xs">{run.errorMessage}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
