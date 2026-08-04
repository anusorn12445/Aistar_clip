"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  BrandOption,
  CustomerFeedback,
  FEEDBACK_SOURCE_LABEL,
  FeedbackInsights,
  SENTIMENT_LABEL,
  createFeedback,
  createFeedbackBulk,
  deleteFeedback,
  fetchBrandOptions,
  fetchFeedback,
  fetchFeedbackInsights,
  getToken,
  reprocessFeedback,
} from "@/lib/api";

const ALL = "__all__";
const SOURCES = ["comment", "chat", "sales_note"] as const;

function fmt(dt: string): string {
  return new Date(dt).toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CustomerVoicePage() {
  const router = useRouter();

  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [rows, setRows] = useState<CustomerFeedback[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [total, setTotal] = useState(0);
  const [insights, setInsights] = useState<FeedbackInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // input box
  const [bulkMode, setBulkMode] = useState(false);
  const [text, setText] = useState("");
  const [source, setSource] = useState<string>("comment");
  const [inputBrand, setInputBrand] = useState<string>("");
  const [sourceRef, setSourceRef] = useState("");
  const [saving, setSaving] = useState(false);

  // filters
  const [fSource, setFSource] = useState<string>(ALL);
  const [fSentiment, setFSentiment] = useState<string>(ALL);
  const [fBrand, setFBrand] = useState<string>(ALL);

  // per-row
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    fetchBrandOptions()
      .then((b) => setBrands(b.filter((x) => x.status !== "archived")))
      .catch(() => setBrands([]));
  }, [router]);

  const insightQuery = useMemo(() => {
    const q: Record<string, string> = {};
    if (fBrand !== ALL) q.brandId = fBrand;
    return q;
  }, [fBrand]);

  const listQuery = useMemo(() => {
    const q: Record<string, string> = { pageSize: "100" };
    if (fSource !== ALL) q.source = fSource;
    if (fSentiment !== ALL) q.sentiment = fSentiment;
    if (fBrand !== ALL) q.brandId = fBrand;
    return q;
  }, [fSource, fSentiment, fBrand]);

  useEffect(() => {
    if (!getToken()) return;
    fetchFeedback(listQuery)
      .then((r) => {
        setRows(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"))
      .finally(() => setLoaded(true));
    fetchFeedbackInsights(insightQuery)
      .then(setInsights)
      .catch(() => setInsights(null));
  }, [listQuery, insightQuery, reloadKey]);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      if (bulkMode) {
        const res = await createFeedbackBulk({
          text: trimmed,
          source,
          ...(inputBrand ? { brandId: inputBrand } : {}),
          ...(sourceRef.trim() ? { sourceRef: sourceRef.trim() } : {}),
        });
        showToast(
          `บันทึก ${res.created} ก้อน · AI ประมวลผล ${res.processed}${
            res.aiUnavailable ? " (AI ปิดอยู่ — เก็บดิบไว้)" : ""
          }`,
        );
      } else {
        const res = await createFeedback({
          text: trimmed,
          source,
          ...(inputBrand ? { brandId: inputBrand } : {}),
          ...(sourceRef.trim() ? { sourceRef: sourceRef.trim() } : {}),
        });
        showToast(res.aiProcessed ? "บันทึก + วิเคราะห์แล้ว" : "บันทึกแล้ว (AI ยังไม่ประมวลผล)");
      }
      setText("");
      setSourceRef("");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function onReprocess(id: string) {
    setRowBusy((b) => ({ ...b, [id]: true }));
    try {
      await reprocessFeedback(id);
      showToast("ประมวลผลใหม่แล้ว");
      setReloadKey((k) => k + 1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "ประมวลผลไม่สำเร็จ");
    } finally {
      setRowBusy((b) => ({ ...b, [id]: false }));
    }
  }

  async function onDelete(id: string) {
    if (!confirm("ลบ feedback นี้?")) return;
    try {
      await deleteFeedback(id);
      setReloadKey((k) => k + 1);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "ลบไม่สำเร็จ");
    }
  }

  const maxTheme = insights?.topThemes[0]?.count ?? 1;

  return (
    <AppShell title="Customer Voice">
      {toast && (
        <div className="fixed right-6 top-20 z-50 rounded-lg bg-amber-400 px-4 py-2 text-sm font-medium text-zinc-900 shadow-lg">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* left: input + list */}
        <div className="space-y-5 lg:col-span-2">
          {/* input box */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex rounded-lg border border-zinc-700 p-0.5 text-xs">
                <button
                  onClick={() => setBulkMode(false)}
                  className={`rounded-md px-3 py-1 ${!bulkMode ? "bg-amber-400 text-zinc-900" : "text-zinc-400"}`}
                >
                  เดี่ยว
                </button>
                <button
                  onClick={() => setBulkMode(true)}
                  className={`rounded-md px-3 py-1 ${bulkMode ? "bg-amber-400 text-zinc-900" : "text-zinc-400"}`}
                >
                  วางหลายบรรทัด
                </button>
              </div>
              <span className="text-xs text-zinc-500">
                {bulkMode ? "1 บรรทัด = 1 feedback (สูงสุด 200)" : "AI จัด sentiment + แตก theme อัตโนมัติ"}
              </span>
            </div>

            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={bulkMode ? 5 : 3}
              placeholder={
                bulkMode
                  ? "วางคอมเมนต์/แชท หลายบรรทัด...\nแต่ละบรรทัดคือ 1 feedback"
                  : "พิมพ์เสียงลูกค้า เช่น 'ทำไมแพงจัง' หรือ 'สีนี้สวยมาก อยากได้สีอื่นด้วย'"
              }
              className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <FilterSelect
                value={source}
                onChange={setSource}
                options={SOURCES.map((s) => ({
                  value: s,
                  label: `${FEEDBACK_SOURCE_LABEL[s].icon} ${FEEDBACK_SOURCE_LABEL[s].label}`,
                }))}
              />
              <FilterSelect
                value={inputBrand}
                onChange={setInputBrand}
                options={[
                  { value: "", label: "— แบรนด์ (ไม่บังคับ) —" },
                  ...brands.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
              <input
                value={sourceRef}
                onChange={(e) => setSourceRef(e.target.value)}
                placeholder="อ้างอิง (เพจ/ลูกค้า)"
                className="w-40 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
              />
              <button
                onClick={submit}
                disabled={saving || !text.trim()}
                className="ml-auto rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-900 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* filters */}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-zinc-500">กรอง:</span>
            <FilterSelect
              value={fSource === ALL ? "" : fSource}
              onChange={(v) => setFSource(v || ALL)}
              options={[
                { value: "", label: "ทุกแหล่ง" },
                ...SOURCES.map((s) => ({ value: s, label: FEEDBACK_SOURCE_LABEL[s].label })),
              ]}
            />
            <FilterSelect
              value={fSentiment === ALL ? "" : fSentiment}
              onChange={(v) => setFSentiment(v || ALL)}
              options={[
                { value: "", label: "ทุก sentiment" },
                { value: "positive", label: "บวก" },
                { value: "negative", label: "ลบ" },
                { value: "neutral", label: "กลาง" },
              ]}
            />
            <FilterSelect
              value={fBrand === ALL ? "" : fBrand}
              onChange={(v) => setFBrand(v || ALL)}
              options={[
                { value: "", label: "ทุกแบรนด์" },
                ...brands.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
            <span className="ml-auto text-xs text-zinc-500">{total} รายการ</span>
          </div>

          {/* list */}
          <div className="space-y-2">
            {!loaded && rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-600">
                กำลังโหลด...
              </p>
            )}
            {loaded && rows.length === 0 && (
              <p className="rounded-lg border border-dashed border-zinc-800 py-8 text-center text-sm text-zinc-600">
                ยังไม่มีเสียงลูกค้า — เพิ่มด้านบนได้เลย
              </p>
            )}
            {rows.map((r) => {
              const src = FEEDBACK_SOURCE_LABEL[r.source] ?? { label: r.source, icon: "•" };
              const sent = r.sentiment ? SENTIMENT_LABEL[r.sentiment] : null;
              return (
                <div key={r.id} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{src.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-100">{r.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {sent && (
                          <span className={`rounded px-1.5 py-0.5 text-[11px] ${sent.cls}`}>{sent.label}</span>
                        )}
                        {!r.aiProcessedAt && (
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-500">
                            ยังไม่ประมวลผล
                          </span>
                        )}
                        {r.themes.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-300"
                          >
                            {t}
                          </span>
                        ))}
                        <span className="ml-auto text-[11px] text-zinc-600">
                          {src.label} · {fmt(r.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      {!r.aiProcessedAt && (
                        <button
                          onClick={() => onReprocess(r.id)}
                          disabled={rowBusy[r.id]}
                          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:border-amber-400 disabled:opacity-50"
                        >
                          {rowBusy[r.id] ? "..." : "ประมวลผลใหม่"}
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(r.id)}
                        className="rounded border border-zinc-800 px-2 py-0.5 text-[11px] text-red-300 hover:border-red-800"
                      >
                        ลบ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* right: mini-dashboard */}
        <div className="space-y-5">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">Sentiment</h2>
            {!insights || insights.total === 0 ? (
              <p className="text-xs text-zinc-600">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-2">
                {insights.sentimentBreakdown
                  .filter((s) => s.count > 0)
                  .map((s) => {
                    const meta = SENTIMENT_LABEL[s.sentiment] ?? {
                      label: "ยังไม่ประมวลผล",
                      cls: "bg-zinc-800 text-zinc-400",
                    };
                    const barCls =
                      s.sentiment === "positive"
                        ? "bg-emerald-500"
                        : s.sentiment === "negative"
                          ? "bg-red-500"
                          : s.sentiment === "neutral"
                            ? "bg-zinc-500"
                            : "bg-zinc-700";
                    return (
                      <div key={s.sentiment}>
                        <div className="mb-0.5 flex justify-between text-[11px] text-zinc-400">
                          <span>{meta.label}</span>
                          <span>
                            {s.count} · {s.pct}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-zinc-800">
                          <div className={`h-full ${barCls}`} style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-200">Theme ยอดฮิต</h2>
            {!insights || insights.topThemes.length === 0 ? (
              <p className="text-xs text-zinc-600">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-1.5">
                {insights.topThemes.slice(0, 12).map((t) => (
                  <div key={t.theme} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-[11px] text-zinc-300">{t.theme}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-800">
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${Math.round((t.count / maxTheme) * 100)}%` }}
                      />
                    </div>
                    <span className="w-6 text-right text-[11px] text-zinc-500">{t.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
            <h2 className="mb-3 text-sm font-semibold text-red-300">เสียงเชิงลบล่าสุด</h2>
            {!insights || insights.recentNegatives.length === 0 ? (
              <p className="text-xs text-zinc-600">ไม่มี — เยี่ยม!</p>
            ) : (
              <div className="space-y-2">
                {insights.recentNegatives.map((n) => (
                  <div key={n.id} className="rounded border border-red-900/40 bg-red-950/20 p-2">
                    <p className="text-[12px] text-zinc-200">{n.text}</p>
                    {n.themes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {n.themes.map((t) => (
                          <span key={t} className="rounded bg-red-900/40 px-1 py-0.5 text-[10px] text-red-200">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
