"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  ClipboardList,
  Drama,
  Film,
  FileText,
  MapPin,
  MessageSquare,
  Paperclip,
  Pencil,
  RefreshCw,
  Shirt,
  Video,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { getToken } from "@/lib/api";
import { uploadAsset } from "@/lib/assets";
import { gradientFor, useAssetImage } from "@/lib/media";
import {
  CAMERA_OPTIONS,
  SHOT_STATUS_LABEL,
  STORYBOARD_FRAME_ASSET_TYPE,
  STORYBOARD_FRAME_LINK_ROLE,
  fetchStoryboard,
  generateStoryboardPrompts,
  regenerateShotPrompt,
  updateShotImagePrompt,
  type Storyboard,
  type StoryboardShot,
} from "@/lib/production";

const CAMERA_LABEL: Record<string, string> = Object.fromEntries(
  CAMERA_OPTIONS.map((c) => [c.value, c.label]),
);

// ── comic panel ต่อช็อต ───────────────────────────────────────
function Panel({
  shot,
  onChanged,
  onNotice,
  onError,
}: {
  shot: StoryboardShot;
  onChanged: () => void;
  onNotice: (m: string) => void;
  onError: (m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(shot.imagePrompt ?? "");

  // เฟรมล่าสุด (การ์ตูนช่องแสดงเฟรมเดียว — เอาอันใหม่สุด)
  const frame = shot.frames.length ? shot.frames[shot.frames.length - 1] : null;
  const frameUrl = useAssetImage(frame?.assetId);

  useEffect(() => {
    if (!editing) setDraft(shot.imagePrompt ?? "");
  }, [shot.imagePrompt, editing]);

  const sst = SHOT_STATUS_LABEL[shot.status];
  const charNames = shot.characters
    .map((c) => c.nameTh ?? c.nameEn ?? c.displayCode ?? "?")
    .filter(Boolean);

  async function copyPrompt() {
    if (!shot.imagePrompt) return;
    try {
      await navigator.clipboard.writeText(shot.imagePrompt);
      onNotice(`ก๊อป prompt ช็อต #${shot.shotNumber} แล้ว — เอาไป gen ใน ChatGPT/Grok ได้เลย`);
    } catch {
      onError("ก๊อปไม่สำเร็จ — เบราว์เซอร์ไม่อนุญาต clipboard");
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      await regenerateShotPrompt(shot.id);
      onNotice(`ร่าง prompt ช็อต #${shot.shotNumber} ใหม่แล้ว`);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "ร่าง prompt ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function savePrompt() {
    setBusy(true);
    try {
      await updateShotImagePrompt(shot.id, draft);
      setEditing(false);
      onNotice(`บันทึก prompt ช็อต #${shot.shotNumber} แล้ว`);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(file: File) {
    setBusy(true);
    try {
      await uploadAsset(file, {
        assetType: STORYBOARD_FRAME_ASSET_TYPE,
        entityType: "shot",
        entityId: shot.id,
        linkRole: STORYBOARD_FRAME_LINK_ROLE,
      });
      onNotice(`อัปเฟรมช็อต #${shot.shotNumber} แล้ว`);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "อัปโหลดเฟรมไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
      {/* เฟรมภาพ (การ์ตูนช่อง) */}
      <div className="relative aspect-video w-full overflow-hidden bg-zinc-800">
        {frameUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={frameUrl} alt={`frame ${shot.shotNumber}`} className="h-full w-full object-cover" />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ background: gradientFor(`shot-${shot.shotNumber}`) }}
          >
            <span className="text-sm text-white/70">ยังไม่มีเฟรม</span>
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-lg bg-zinc-950/80 px-2 py-0.5 font-mono text-xs text-amber-300">
          #{shot.shotNumber}
        </span>
        {shot.camera && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-zinc-950/80 px-2 py-0.5 text-xs text-zinc-200">
            <Video className="size-4" /> {CAMERA_LABEL[shot.camera] ?? shot.camera}
          </span>
        )}
        <span className={`absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[11px] ${sst.cls}`}>
          {sst.label}
        </span>
      </div>

      {/* เนื้อหาช็อต */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {shot.action && <p className="text-sm text-zinc-100">{shot.action}</p>}
        {shot.dialogue && (
          <p className="flex items-center gap-1 rounded-lg bg-zinc-800/60 px-2 py-1 text-sm italic text-zinc-300">
            <MessageSquare className="size-4 shrink-0" /> {shot.dialogue}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5 text-xs text-zinc-500">
          {shot.emotion && (
            <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5">
              <Drama className="size-4" /> {shot.emotion}
            </span>
          )}
          {shot.outfit && (
            <span className="inline-flex items-center gap-1 rounded bg-zinc-800 px-1.5 py-0.5">
              <Shirt className="size-4" /> {shot.outfit}
            </span>
          )}
          {charNames.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded bg-violet-950/60 px-1.5 py-0.5 text-violet-300">
              <Clapperboard className="size-4" /> {n}
            </span>
          ))}
        </div>

        {/* image prompt */}
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-amber-400/40 bg-zinc-950 px-2 py-1.5 text-xs outline-none focus:border-amber-400"
            />
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={savePrompt}
                className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                บันทึก
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setDraft(shot.imagePrompt ?? "");
                }}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : shot.imagePrompt ? (
          <details className="rounded-lg border border-zinc-800 bg-zinc-950/60">
            <summary className="flex cursor-pointer items-center gap-1 px-2 py-1.5 text-xs text-zinc-400 hover:text-zinc-200">
              <FileText className="size-4" /> image prompt
            </summary>
            <pre className="whitespace-pre-wrap px-2 pb-2 text-[11px] leading-relaxed text-zinc-300">
              {shot.imagePrompt}
            </pre>
          </details>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-700 px-2 py-1.5 text-xs text-zinc-500">
            ยังไม่มี prompt — กด &ldquo;ร่างใหม่&rdquo; หรือ &ldquo;ร่าง prompt ทั้งอีพี&rdquo;
          </p>
        )}

        {/* actions */}
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          <button
            disabled={!shot.imagePrompt || busy}
            onClick={copyPrompt}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            <ClipboardList className="size-4" /> ก๊อป prompt
          </button>
          <button
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            <Paperclip className="size-4" /> อัปโหลดเฟรม
          </button>
          <button
            disabled={busy}
            onClick={regenerate}
            className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
          >
            {busy ? "…" : "ร่างใหม่"}
          </button>
          {shot.imagePrompt && !editing && (
            <button
              disabled={busy}
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-40"
            >
              <Pencil className="size-4" /> แก้ prompt
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default function StoryboardPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [sb, setSb] = useState<Storyboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [genBusy, setGenBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchStoryboard(id);
      setSb(res);
    } catch (err) {
      if (typeof window !== "undefined" && !getToken()) return; // api() เด้ง login แล้ว
      setError(err instanceof Error ? err.message : "โหลด storyboard ไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function genAll(regenerate: boolean) {
    setGenBusy(true);
    setError(null);
    try {
      const res = await generateStoryboardPrompts(id, regenerate);
      setNotice(
        `ร่าง prompt แล้ว — ใหม่ ${res.generated} · ข้าม ${res.skipped}${res.failed ? ` · พลาด ${res.failed}` : ""} (จาก ${res.total} ช็อต)`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ร่าง prompt ไม่สำเร็จ");
    } finally {
      setGenBusy(false);
    }
  }

  if (error && !sb) {
    return (
      <AppShell title="Storyboard">
        <p className="text-sm text-red-400">{error}</p>
      </AppShell>
    );
  }
  if (!sb) {
    return (
      <AppShell title="Storyboard">
        <p className="text-sm text-zinc-500">กำลังโหลด…</p>
      </AppShell>
    );
  }

  const hasShots = sb.shots.length > 0;
  const withPrompt = sb.shots.filter((s) => s.imagePrompt).length;

  return (
    <AppShell title={`Storyboard — ${sb.episode.title}`}>
      <div className="space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={`/episodes/${id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <ArrowLeft className="size-4" /> กลับหน้าตอน
          </Link>
          <span className="font-mono text-xs text-amber-300">{sb.episode.displayCode}</span>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Film className="size-5" /> {sb.episode.title}
          </h2>
          <span className="text-sm text-zinc-500">
            {withPrompt}/{sb.shots.length} มี prompt
          </span>
          {sb.episode.location && (
            <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
              <MapPin className="size-4" /> {sb.episode.location.name}
            </span>
          )}
          <div className="flex-1" />
          {hasShots && (
            <>
              <button
                disabled={genBusy}
                onClick={() => genAll(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                title="ร่างใหม่ทับทุกช็อต"
              >
                <RefreshCw className="size-4" /> ร่างใหม่ทั้งหมด
              </button>
              <button
                disabled={genBusy}
                onClick={() => genAll(false)}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {genBusy ? "กำลังร่าง…" : "ร่าง prompt ภาพทั้งอีพี"}
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-zinc-500">
          AI ร่าง prompt ภาพต่อช็อตจาก Visual DNA ตัวละคร + Location + มุมกล้อง/แอ็กชัน{" "}
          <ArrowRight className="inline size-4 align-text-bottom" /> ก๊อปไป gen เฟรมใน ChatGPT/Grok เอง
          แล้วอัปเฟรมกลับมาแนบช็อต
        </p>

        {notice && (
          <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-300">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        {!hasShots ? (
          <div className="rounded-2xl border border-dashed border-zinc-700 p-8 text-center text-sm text-zinc-500">
            ยังไม่มี shot ในตอนนี้ —{" "}
            <Link href={`/episodes/${id}`} className="text-amber-300 hover:underline">
              ไปแตก Shot List ก่อน
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sb.shots.map((shot) => (
              <Panel
                key={shot.id}
                shot={shot}
                onChanged={load}
                onNotice={setNotice}
                onError={setError}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
