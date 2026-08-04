"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverPicker from "@/components/CoverPicker";
import { api, getToken } from "@/lib/api";
import { uploadAsset } from "@/lib/assets";
import { SERIES_STATUS_ACTIONS, seriesStatusMeta, type SeriesDetail } from "@/lib/series";
import SeriesCover from "../SeriesCover";
import PipelineTab from "./PipelineTab";
import CastTab from "./CastTab";
import BibleTab from "./BibleTab";
import BroadcastTab from "./BroadcastTab";
import AnalyticsTab from "./AnalyticsTab";
import AudienceTab from "./AudienceTab";
import TieInProducts from "@/components/TieInProducts";
import { Tv, Pencil, Clapperboard, Drama, MapPin } from "lucide-react";

const TABS = [
  { key: "pipeline", label: "Pipeline" },
  { key: "cast", label: "Cast & Locations" },
  { key: "audience", label: "คนดูเป้าหมาย" },
  { key: "tie-in", label: "สินค้า Tie-In" },
  { key: "bible", label: "Series Bible" },
  { key: "broadcast", label: "Broadcast & Calendar" },
  { key: "analytics", label: "Analytics" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

function SeriesDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;

  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initialTab = (searchParams.get("tab") as TabKey) || "pipeline";
  const [tab, setTab] = useState<TabKey>(TABS.some((t) => t.key === initialTab) ? initialTab : "pipeline");

  // header inline edit
  const [editing, setEditing] = useState(false);
  const [headerForm, setHeaderForm] = useState({ name: "", universe: "", premise: "" });

  // cover upload
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api<SeriesDetail>(`/series/${id}`);
      setSeries(res);
      setLoadError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
      setLoadError(msg);
      // อาจเป็นช่วง API ยังไม่ deploy endpoint ใหม่ — log ไว้พอ ไม่ crash
      console.warn("series detail load failed:", msg);
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    load();
  }, [router, load]);

  const changeTab = (next: TabKey) => {
    setTab(next);
    const sp = new URLSearchParams(searchParams.toString());
    if (next === "pipeline") sp.delete("tab");
    else sp.set("tab", next);
    router.replace(`/series/${id}${sp.size ? `?${sp.toString()}` : ""}`, { scroll: false });
  };

  const changeStatus = async (to: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/series/${id}`, { method: "PATCH", body: JSON.stringify({ status: to }) });
      setNotice(`เปลี่ยนสถานะเป็น "${seriesStatusMeta(to).label}" แล้ว`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const saveHeader = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api(`/series/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: headerForm.name.trim(),
          universe: headerForm.universe.trim() || undefined,
          premise: headerForm.premise.trim() || undefined,
        }),
      });
      setNotice("บันทึกข้อมูลซีรีส์แล้ว");
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  const onCoverFile = async (file: File) => {
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      const asset = await uploadAsset(file, {
        assetType: "cover",
        entityType: "series",
        entityId: id,
        linkRole: "cover",
      });
      await api(`/series/${id}`, { method: "PATCH", body: JSON.stringify({ coverAssetId: asset.id }) });
      setNotice("อัปเดตรูปปกแล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปปกไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // เลือกจากรูปที่อัปโหลดไว้แล้วเป็นปก (promoteCover ตั้ง linkRole cover ให้) แล้ว sync coverAssetId
  const onPickCover = async (assetId: string) => {
    setError(null);
    setNotice(null);
    try {
      await api(`/series/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ coverAssetId: assetId }),
      });
      setNotice("อัปเดตรูปปกแล้ว");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนรูปปกไม่สำเร็จ");
    }
  };

  if (loadError && !series) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-10 text-center">
        <p className="text-3xl"><Tv className="inline size-8" /></p>
        <p className="mt-3 text-zinc-300">โหลดข้อมูลซีรีส์ไม่ได้</p>
        <p className="mt-1 text-sm text-zinc-500">
          {loadError} — ถ้าเพิ่งอัปเดตระบบ อาจต้องรอ API รีสตาร์ทสักครู่
        </p>
        <button
          onClick={load}
          className="mt-4 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          ลองใหม่
        </button>
      </div>
    );
  }

  if (!series) return <p className="text-sm text-zinc-500">กำลังโหลด...</p>;

  const st = seriesStatusMeta(series.status);
  const statusActions = SERIES_STATUS_ACTIONS[series.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* cover — คลิกเพื่ออัปโหลดรูปใหม่ / ปุ่มเลือกจากรูปที่มี */}
        <div className="relative w-full shrink-0 lg:w-72">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            title="คลิกเพื่ออัปโหลดรูปปก"
            className="group relative block h-40 w-full overflow-hidden rounded-2xl border border-zinc-800"
          >
            <SeriesCover coverAssetId={series.coverAssetId} name={series.name} className="h-full w-full" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white opacity-0 transition group-hover:opacity-100">
              {uploading ? "กำลังอัปโหลด..." : "เปลี่ยนรูปปก"}
            </span>
          </button>
          <div className="absolute bottom-2 right-2">
            <CoverPicker
              entityType="series"
              entityId={id}
              name={series.name}
              coverRole="cover"
              assetType="cover"
              onChanged={onPickCover}
              triggerClass="rounded-lg bg-zinc-950/80 px-2 py-1 text-xs text-zinc-100 ring-1 ring-zinc-700 hover:bg-zinc-950"
            />
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCoverFile(f);
          }}
        />

        <div className="min-w-0 flex-1 space-y-2">
          {!editing ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold">{series.name}</h2>
                {series.universe && (
                  <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">{series.universe}</span>
                )}
                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${st.cls}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                  {st.label}
                </span>
                <button
                  onClick={() => {
                    setHeaderForm({
                      name: series.name,
                      universe: series.universe ?? "",
                      premise: series.premise ?? "",
                    });
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  <Pencil className="size-3.5" /> แก้ไข
                </button>
                <div className="flex-1" />
                {statusActions.map((a) => (
                  <button
                    key={a.to}
                    disabled={busy}
                    onClick={() => changeStatus(a.to)}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-800 disabled:opacity-40"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
              <p className="max-w-3xl text-sm text-zinc-400">
                {series.premise ?? "ยังไม่มี premise — กด “แก้ไข” เพื่อเติมโครงเรื่องหลักของซีรีส์"}
              </p>
              <div className="flex flex-wrap gap-4 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1"><Clapperboard className="size-3.5" /> {series.episodeCount} ตอน</span>
                <span>{series.seasons.length} ซีซัน</span>
                <span className="inline-flex items-center gap-1"><Drama className="size-3.5" /> นักแสดงประจำ {series.cast.length} คน</span>
                <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {series.locations.length} locations</span>
              </div>
            </>
          ) : (
            <div className="space-y-2 rounded-xl border border-amber-400/30 bg-zinc-900 p-4">
              <div className="grid gap-2 lg:grid-cols-2">
                <input
                  value={headerForm.name}
                  onChange={(e) => setHeaderForm({ ...headerForm, name: e.target.value })}
                  placeholder="ชื่อซีรีส์ *"
                  className={inputCls}
                />
                <input
                  value={headerForm.universe}
                  onChange={(e) => setHeaderForm({ ...headerForm, universe: e.target.value })}
                  placeholder="จักรวาล (universe)"
                  className={inputCls}
                />
              </div>
              <textarea
                value={headerForm.premise}
                onChange={(e) => setHeaderForm({ ...headerForm, premise: e.target.value })}
                rows={2}
                placeholder="Premise — โครงเรื่องหลักของทั้งซีรีส์"
                className={`w-full resize-y ${inputCls}`}
              />
              <div className="flex gap-2">
                <button
                  disabled={busy || !headerForm.name.trim()}
                  onClick={saveHeader}
                  className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
                >
                  {busy ? "กำลังบันทึก..." : "บันทึก"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm hover:bg-zinc-800"
                >
                  ยกเลิก
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`rounded-t-lg px-4 py-2 text-sm ${
              tab === t.key
                ? "border border-b-0 border-zinc-800 bg-zinc-900 font-semibold text-amber-300"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "pipeline" && (
        <PipelineTab series={series} reload={load} onError={setError} onNotice={setNotice} />
      )}
      {tab === "cast" && <CastTab series={series} reload={load} onError={setError} onNotice={setNotice} />}
      {tab === "audience" && (
        <AudienceTab series={series} reload={load} onError={setError} onNotice={setNotice} />
      )}
      {tab === "tie-in" && <TieInProducts entity="series" entityId={series.id} />}
      {tab === "bible" && <BibleTab series={series} reload={load} onError={setError} onNotice={setNotice} />}
      {tab === "broadcast" && (
        <BroadcastTab series={series} reload={load} onError={setError} onNotice={setNotice} />
      )}
      {tab === "analytics" && <AnalyticsTab series={series} />}
    </div>
  );
}

export default function SeriesDetailPage() {
  return (
    <AppShell title="Series Hub">
      <Suspense fallback={<p className="text-sm text-zinc-500">กำลังโหลด...</p>}>
        <SeriesDetailContent />
      </Suspense>
    </AppShell>
  );
}
