"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { EPISODE_STATUS_LABEL, type EpisodeList } from "@/lib/production";
import {
  CONTINUITY_SEVERITY,
  SEASON_STATUS_LABEL,
  normalizeBible,
  type ContinuityResult,
  type NextEpisodeOption,
  type NextEpisodeResult,
  type SeriesDetail,
  type SeriesEpisodeRow,
} from "@/lib/series";
import { FilterSelect } from "@/components/ui/filter-select";
import { Download, Target, ShoppingBag, X, Sparkles, Clapperboard, CircleCheck, MapPin, ArrowRight } from "lucide-react";

interface ProductOption {
  id: string;
  displayCode?: string;
  name: string;
}

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

export default function PipelineTab({
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
  const [busy, setBusy] = useState(false);

  // สร้าง season
  const [showSeasonForm, setShowSeasonForm] = useState(false);
  const [seasonForm, setSeasonForm] = useState({ label: "", arc: "" });

  // สร้างตอนถัดไป (ต่อ season)
  const [newEpisodeSeason, setNewEpisodeSeason] = useState<string | null>(null);
  const [newEpisodeTitle, setNewEpisodeTitle] = useState("");

  // AI เสนอตอนถัดไป
  const [aiSeason, setAiSeason] = useState<string | null>(null);
  const [aiOptions, setAiOptions] = useState<NextEpisodeOption[] | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [pickingIdx, setPickingIdx] = useState<number | null>(null);

  // continuity check
  const [checkingEpisodeId, setCheckingEpisodeId] = useState<string | null>(null);
  const [continuity, setContinuity] = useState<ContinuityResult | null>(null);
  const [applyingBible, setApplyingBible] = useState(false);

  // season products
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productPickSeason, setProductPickSeason] = useState<string | null>(null);
  const [productToAdd, setProductToAdd] = useState("");

  // picker ดึงตอนที่มีอยู่
  const [showPicker, setShowPicker] = useState(false);
  const [unassigned, setUnassigned] = useState<EpisodeList | null>(null);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [attachSeason, setAttachSeason] = useState<Record<string, string>>({});

  useEffect(() => {
    api<{ items: ProductOption[] } | ProductOption[]>("/products")
      .then((r) => setProducts(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => {});
  }, []);

  const loadUnassigned = useCallback(async () => {
    try {
      const res = await api<EpisodeList>("/episodes?seriesId=none&sortBy=updatedAt&sortDir=desc");
      setUnassigned(res);
      setPickerError(null);
    } catch (err) {
      setPickerError(err instanceof Error ? err.message : "โหลดตอนที่ยังไม่ผูกซีรีส์ไม่สำเร็จ");
    }
  }, []);

  useEffect(() => {
    if (showPicker) loadUnassigned();
  }, [showPicker, loadUnassigned]);

  async function run<T>(fn: () => Promise<T>, okMessage?: string): Promise<T | undefined> {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await fn();
      if (okMessage) onNotice(okMessage);
      await reload();
      return result;
    } catch (err) {
      onError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  // group ตอนตาม season — season entity ก่อน แล้วตามด้วย season string ที่ไม่มี entity และกลุ่มไม่จัดซีซัน
  const groups = useMemo(() => {
    const bySeason = new Map<string, SeriesEpisodeRow[]>();
    const noSeason: SeriesEpisodeRow[] = [];
    for (const ep of series.episodes) {
      if (!ep.season) {
        noSeason.push(ep);
        continue;
      }
      const list = bySeason.get(ep.season) ?? [];
      list.push(ep);
      bySeason.set(ep.season, list);
    }
    const result: {
      key: string;
      label: string;
      season: SeriesDetail["seasons"][number] | null;
      episodes: SeriesEpisodeRow[];
    }[] = [];
    for (const s of series.seasons) {
      result.push({ key: s.id, label: s.label, season: s, episodes: bySeason.get(s.label) ?? [] });
      bySeason.delete(s.label);
    }
    for (const [label, eps] of bySeason) {
      result.push({ key: `loose-${label}`, label, season: null, episodes: eps });
    }
    if (noSeason.length) {
      result.push({ key: "no-season", label: "ยังไม่จัดซีซัน", season: null, episodes: noSeason });
    }
    return result;
  }, [series]);

  const nextNumber = useCallback(
    (seasonLabel: string) =>
      Math.max(0, ...series.episodes.filter((e) => e.season === seasonLabel).map((e) => e.episodeNumber ?? 0)) + 1,
    [series],
  );

  const createSeason = () =>
    run(
      () =>
        api(`/series/${series.id}/seasons`, {
          method: "POST",
          body: JSON.stringify({ label: seasonForm.label.trim(), arc: seasonForm.arc.trim() || undefined }),
        }),
      `สร้าง season "${seasonForm.label.trim()}" แล้ว`,
    ).then((r) => {
      if (r) {
        setSeasonForm({ label: "", arc: "" });
        setShowSeasonForm(false);
      }
    });

  const createEpisode = (season: string) =>
    run(
      () =>
        api(`/series/${series.id}/episodes`, {
          method: "POST",
          body: JSON.stringify({ title: newEpisodeTitle.trim(), season }),
        }),
      `สร้างตอนใหม่ใน ${season} แล้ว (link นักแสดงประจำให้อัตโนมัติ)`,
    ).then((r) => {
      if (r) {
        setNewEpisodeTitle("");
        setNewEpisodeSeason(null);
      }
    });

  const aiSuggest = async (season: string) => {
    setAiSeason(season);
    setAiOptions(null);
    setAiBusy(true);
    onError(null);
    onNotice(null);
    try {
      const res = await api<NextEpisodeResult>(`/ai/series/${series.id}/next-episode`, {
        method: "POST",
        body: JSON.stringify({ season }),
      });
      setAiOptions(res.options);
    } catch (err) {
      onError(err instanceof Error ? err.message : "AI เสนอตอนถัดไปไม่สำเร็จ");
      setAiSeason(null);
    } finally {
      setAiBusy(false);
    }
  };

  const pickOption = async (opt: NextEpisodeOption, idx: number) => {
    if (!aiSeason) return;
    setPickingIdx(idx);
    const created = await run(
      () =>
        api(`/series/${series.id}/episodes`, {
          method: "POST",
          body: JSON.stringify({
            title: opt.title,
            season: aiSeason,
            logline: opt.logline,
            hook: opt.hook,
            twist: opt.twist,
            cta: opt.cta,
          }),
        }),
      `สร้างตอน "${opt.title}" จากข้อเสนอ AI แล้ว`,
    );
    setPickingIdx(null);
    if (created) {
      setAiOptions(null);
      setAiSeason(null);
    }
  };

  const runContinuity = async (ep: SeriesEpisodeRow) => {
    setCheckingEpisodeId(ep.id);
    setContinuity(null);
    onError(null);
    onNotice(null);
    try {
      const res = await api<ContinuityResult>(`/ai/series/${series.id}/continuity-check`, {
        method: "POST",
        body: JSON.stringify({ episodeId: ep.id }),
      });
      setContinuity(res);
    } catch (err) {
      onError(err instanceof Error ? err.message : "เช็ค continuity ไม่สำเร็จ");
    } finally {
      setCheckingEpisodeId(null);
    }
  };

  // อัปเดต bible ตามผล continuity: merge relationshipUpdates + cliffhangerSuggestion
  const applyContinuityToBible = async () => {
    if (!continuity) return;
    setApplyingBible(true);
    onError(null);
    try {
      const bible = normalizeBible(series.bible);
      for (const upd of continuity.relationshipUpdates) {
        const existing = bible.relationships.find((r) => r.pair === upd.pair);
        if (existing) existing.status = upd.newStatus;
        else bible.relationships.push({ pair: upd.pair, status: upd.newStatus });
      }
      if (continuity.cliffhangerSuggestion?.trim()) {
        bible.last_cliffhanger = continuity.cliffhangerSuggestion.trim();
      }
      await api(`/series/${series.id}`, { method: "PATCH", body: JSON.stringify({ bible }) });
      onNotice("อัปเดต bible ตามผลตรวจแล้ว (ความสัมพันธ์ + cliffhanger ล่าสุด)");
      setContinuity(null);
      await reload();
    } catch (err) {
      onError(err instanceof Error ? err.message : "อัปเดต bible ไม่สำเร็จ");
    } finally {
      setApplyingBible(false);
    }
  };

  const attachEpisode = (episodeId: string) => {
    const season = (attachSeason[episodeId] ?? "").trim();
    if (!season) {
      onError("เลือก/พิมพ์ season ก่อนดึงตอนเข้าซีรีส์");
      return;
    }
    run(
      () =>
        api(`/episodes/${episodeId}`, {
          method: "PATCH",
          body: JSON.stringify({ seriesId: series.id, season, episodeNumber: nextNumber(season) }),
        }),
      "ดึงตอนเข้าซีรีส์แล้ว",
    ).then(() => loadUnassigned());
  };

  return (
    <div className="space-y-5">
      {/* actions bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowSeasonForm((v) => !v)}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          + สร้าง Season
        </button>
        <button
          onClick={() => setShowPicker((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          <Download className="size-4" /> ดึงตอนที่มีอยู่เข้าซีรีส์
        </button>
      </div>

      {showSeasonForm && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-400/30 bg-zinc-900 p-4">
          <input
            value={seasonForm.label}
            onChange={(e) => setSeasonForm({ ...seasonForm, label: e.target.value })}
            placeholder="Label เช่น S1 *"
            className={`w-32 ${inputCls}`}
          />
          <input
            value={seasonForm.arc}
            onChange={(e) => setSeasonForm({ ...seasonForm, arc: e.target.value })}
            placeholder="Arc — โครงเรื่องของซีซันนี้"
            className={`flex-1 min-w-64 ${inputCls}`}
          />
          <button
            disabled={busy || !seasonForm.label.trim()}
            onClick={createSeason}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
          >
            สร้าง Season
          </button>
        </div>
      )}

      {/* picker: ตอนที่ยังไม่ผูกซีรีส์ */}
      {showPicker && (
        <div className="space-y-2 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
          <h4 className="text-sm font-semibold">ตอนที่ยังไม่ผูกซีรีส์</h4>
          {pickerError && <p className="text-xs text-red-400">{pickerError}</p>}
          {unassigned && unassigned.items.length === 0 && (
            <p className="text-xs text-zinc-500">ไม่มีตอนค้าง — ทุกตอนถูกผูกซีรีส์แล้ว</p>
          )}
          {unassigned?.items.map((ep) => (
            <div key={ep.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-2">
              <span className="font-mono text-xs text-amber-300">{ep.displayCode}</span>
              <span className="text-sm">{ep.title}</span>
              <div className="flex-1" />
              <input
                list={`season-options-${series.id}`}
                value={attachSeason[ep.id] ?? ""}
                onChange={(e) => setAttachSeason((m) => ({ ...m, [ep.id]: e.target.value }))}
                placeholder="Season เช่น S1"
                className={`w-28 ${inputCls}`}
              />
              <button
                disabled={busy}
                onClick={() => attachEpisode(ep.id)}
                className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
              >
                ดึงเข้า{(attachSeason[ep.id] ?? "").trim() ? ` เป็น EP${nextNumber((attachSeason[ep.id] ?? "").trim())}` : ""}
              </button>
            </div>
          ))}
          <datalist id={`season-options-${series.id}`}>
            {series.seasons.map((s) => (
              <option key={s.id} value={s.label} />
            ))}
          </datalist>
        </div>
      )}

      {/* season groups */}
      {groups.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center">
          <p className="text-zinc-300">ยังไม่มีซีซันและตอนในซีรีส์นี้</p>
          <p className="mt-1 text-sm text-zinc-500">
            เริ่มจาก &ldquo;+ สร้าง Season&rdquo; แล้วสร้างตอนแรก หรือดึงตอนที่มีอยู่เข้ามา
          </p>
        </div>
      )}

      {groups.map((g) => {
        const seasonStatus = g.season ? SEASON_STATUS_LABEL[g.season.status] : null;
        const isRealSeason = g.key !== "no-season";
        return (
          <section key={g.key} className="rounded-2xl border border-zinc-800 bg-zinc-900/50">
            {/* season header */}
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-5 py-3">
              <h3 className="font-semibold">{g.label}</h3>
              {seasonStatus && (
                <span className={`rounded-full px-2 py-0.5 text-xs ${seasonStatus.cls}`}>{seasonStatus.label}</span>
              )}
              {g.season?.arc && <span className="inline-flex items-center gap-1 text-xs text-zinc-500"><Target className="size-3.5" /> {g.season.arc}</span>}
              {g.season?.products.map((p) => (
                <span key={p.id} className="flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                  <ShoppingBag className="size-3.5" /> {p.name}
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api(`/series/seasons/${g.season!.id}/products/${p.id}`, { method: "DELETE" }),
                        "เอาสินค้าออกจากซีซันแล้ว",
                      )
                    }
                    className="text-zinc-500 hover:text-red-400"
                    title="เอาออก"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
              {g.season && products.length > 0 && (
                <>
                  {productPickSeason === g.season.id ? (
                    <span className="flex items-center gap-1">
                      <FilterSelect
                        value={productToAdd}
                        onChange={setProductToAdd}
                        options={[
                          { value: "", label: "— เลือกสินค้า —" },
                          ...products
                            .filter((p) => !g.season!.products.some((x) => x.id === p.id))
                            .map((p) => ({ value: p.id, label: p.name })),
                        ]}
                      />
                      <button
                        disabled={busy || !productToAdd}
                        onClick={() =>
                          run(
                            () =>
                              api(`/series/seasons/${g.season!.id}/products`, {
                                method: "POST",
                                body: JSON.stringify({ productId: productToAdd }),
                              }),
                            "เพิ่มสินค้าประจำซีซันแล้ว",
                          ).then(() => {
                            setProductToAdd("");
                            setProductPickSeason(null);
                          })
                        }
                        className="rounded-lg border border-amber-400/60 px-2 py-1 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
                      >
                        เพิ่ม
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setProductPickSeason(g.season!.id)}
                      className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400 hover:bg-zinc-800"
                    >
                      + สินค้า
                    </button>
                  )}
                </>
              )}
              <div className="flex-1" />
              {isRealSeason && (
                <>
                  <button
                    disabled={aiBusy}
                    onClick={() => aiSuggest(g.label)}
                    className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                  >
                    {aiBusy && aiSeason === g.label ? "AI กำลังคิด (1-2 นาที)..." : "AI เสนอตอนถัดไป"}
                  </button>
                  <button
                    onClick={() => {
                      setNewEpisodeSeason(newEpisodeSeason === g.label ? null : g.label);
                      setNewEpisodeTitle("");
                    }}
                    className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
                  >
                    + สร้างตอนถัดไป
                  </button>
                </>
              )}
            </div>

            {/* สร้างตอนถัดไป form */}
            {newEpisodeSeason === g.label && (
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-5 py-3">
                <span className="rounded-full bg-zinc-800 px-2 py-1 font-mono text-xs text-amber-300">
                  {g.label} EP{nextNumber(g.label)}
                </span>
                <input
                  autoFocus
                  value={newEpisodeTitle}
                  onChange={(e) => setNewEpisodeTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newEpisodeTitle.trim()) createEpisode(g.label);
                  }}
                  placeholder="ชื่อตอนใหม่..."
                  className={`flex-1 min-w-64 ${inputCls}`}
                />
                <button
                  disabled={busy || !newEpisodeTitle.trim()}
                  onClick={() => createEpisode(g.label)}
                  className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
                >
                  {busy ? "กำลังสร้าง..." : "สร้างตอน"}
                </button>
                <span className="text-xs text-zinc-500">นักแสดงประจำเรื่อง {series.cast.length} คนจะถูก link ให้อัตโนมัติ</span>
              </div>
            )}

            {/* AI options */}
            {aiSeason === g.label && aiOptions && (
              <div className="space-y-3 border-b border-zinc-800 bg-zinc-950/50 px-5 py-4">
                <div className="flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold text-amber-300"><Sparkles className="size-4" /> AI เสนอตอนถัดไปของ {g.label} — เลือก 1 จาก 3</h4>
                  <button
                    onClick={() => {
                      setAiOptions(null);
                      setAiSeason(null);
                    }}
                    className="text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    ปิด
                  </button>
                </div>
                <div className="grid gap-3 lg:grid-cols-3">
                  {aiOptions.map((opt, idx) => (
                    <div key={idx} className="flex flex-col gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-4">
                      <h5 className="font-semibold">{opt.title}</h5>
                      <p className="text-xs text-zinc-400">{opt.logline}</p>
                      <p className="text-xs"><span className="text-amber-300">Hook:</span> <span className="text-zinc-300">{opt.hook}</span></p>
                      <p className="text-xs"><span className="text-violet-300">Twist:</span> <span className="text-zinc-300">{opt.twist}</span></p>
                      <p className="text-xs"><span className="text-emerald-300">CTA:</span> <span className="text-zinc-300">{opt.cta}</span></p>
                      <p className="mt-1 border-t border-zinc-800 pt-2 text-[11px] text-zinc-500">{opt.rationale}</p>
                      <button
                        disabled={busy || pickingIdx !== null}
                        onClick={() => pickOption(opt, idx)}
                        className="mt-auto rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
                      >
                        {pickingIdx === idx ? "กำลังสร้าง..." : "ใช้ตอนนี้"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* episode rows */}
            <div className="divide-y divide-zinc-800/60">
              {g.episodes.map((ep) => {
                const st = EPISODE_STATUS_LABEL[ep.status] ?? EPISODE_STATUS_LABEL.idea;
                const canCheck = ep.status === "script_draft" || ep.status === "script_review";
                const isChecking = checkingEpisodeId === ep.id;
                const showResult = continuity?.episode.id === ep.id;
                return (
                  <div key={ep.id}>
                    <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 hover:bg-zinc-900/60">
                      <span className="w-14 font-mono text-xs text-zinc-500">
                        EP{ep.episodeNumber ?? "?"}
                      </span>
                      <span className="font-mono text-xs text-amber-300">{ep.displayCode}</span>
                      <Link href={`/episodes/${ep.id}`} className="text-sm hover:text-amber-300 hover:underline">
                        {ep.title}
                      </Link>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                      <div className="flex-1" />
                      <span className="inline-flex items-center gap-1 text-xs text-zinc-500" title="shots approved/total">
                        <Clapperboard className="size-3.5" /> {ep.shotCounts.approved}/{ep.shotCounts.total}
                      </span>
                      {canCheck && (
                        <button
                          disabled={isChecking || checkingEpisodeId !== null}
                          onClick={() => runContinuity(ep)}
                          className="rounded-lg border border-violet-500/50 px-2 py-1 text-xs text-violet-300 hover:bg-violet-500/10 disabled:opacity-50"
                          title="AI ตรวจความต่อเนื่องกับ bible + ตอนก่อนหน้า"
                        >
                          {isChecking ? "กำลังตรวจ (1-2 นาที)..." : "เช็คความต่อเนื่อง"}
                        </button>
                      )}
                    </div>

                    {/* continuity result panel */}
                    {showResult && continuity && (
                      <div className="space-y-3 border-t border-zinc-800 bg-zinc-950/60 px-5 py-4">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-violet-300">
                            ผลตรวจ continuity — {continuity.episode.displayCode}
                          </h4>
                          <button onClick={() => setContinuity(null)} className="text-xs text-zinc-500 hover:text-zinc-300">
                            ปิด
                          </button>
                        </div>
                        <p className="text-sm text-zinc-300">{continuity.verdict}</p>
                        {continuity.issues.length === 0 ? (
                          <p className="flex items-center gap-1 text-xs text-emerald-400"><CircleCheck className="size-3.5" /> ไม่พบปัญหา continuity</p>
                        ) : (
                          <div className="space-y-2">
                            {continuity.issues.map((issue, i) => {
                              const sev = CONTINUITY_SEVERITY[issue.severity] ?? CONTINUITY_SEVERITY.low;
                              return (
                                <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${sev.cls}`}>
                                  <span className="font-semibold">[{sev.label}]</span> {issue.what}
                                  <span className="flex items-center gap-1 text-[11px] opacity-80"><MapPin className="size-3" /> {issue.where}</span>
                                  <span className="block text-[11px] opacity-80">{issue.suggestion}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {(continuity.relationshipUpdates.length > 0 || continuity.cliffhangerSuggestion?.trim()) && (
                          <div className="rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-xs">
                            <p className="mb-1 font-semibold text-zinc-300">ข้อเสนออัปเดต Series Bible:</p>
                            {continuity.relationshipUpdates.map((u, i) => (
                              <p key={i} className="flex items-center gap-1 text-zinc-400">
                                {u.pair} <ArrowRight className="size-3" /> {u.newStatus}
                              </p>
                            ))}
                            {continuity.cliffhangerSuggestion?.trim() && (
                              <p className="text-zinc-400">cliffhanger ล่าสุด: {continuity.cliffhangerSuggestion}</p>
                            )}
                            <button
                              disabled={applyingBible}
                              onClick={applyContinuityToBible}
                              className="mt-2 rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
                            >
                              {applyingBible ? "กำลังอัปเดต..." : "อัปเดต bible ตาม suggestion"}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {g.episodes.length === 0 && (
                <p className="px-5 py-4 text-center text-xs text-zinc-500">
                  ยังไม่มีตอนในซีซันนี้ — กด &ldquo;+ สร้างตอนถัดไป&rdquo; หรือให้ AI เสนอ
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
