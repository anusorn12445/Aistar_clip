"use client";

// ใช้ร่วมกันระหว่าง Wardrobe (ตู้เสื้อผ้า) และ Expression (คลังสีหน้า)
// — โครงเหมือนกัน: grid การ์ดรูป + modal อัปโหลด/แก้ไข/เรียงลำดับ/ลบ

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Asset, AssetList } from "@/lib/assets";
import { uploadAsset } from "@/lib/assets";
import { useAssetImage } from "@/lib/media";
import PromptViewerModal from "@/components/PromptViewerModal";
import type { PromptVariant } from "@/lib/promptBuilders";
import { IMAGE_TOOLS, type ImageTool } from "./imagePrompt";
import { ArrowLeft, ArrowRight, Camera, ClipboardList, Image as ImageIcon, Star, X } from "lucide-react";

export interface MediaItem {
  id: string;
  name: string;
  occasion?: string | null;
  description: string | null;
  sortOrder: number;
  coverAssetId: string | null;
  imageCount: number;
  // รูปมาตรฐานประจำรายการ (linkRole standard_image — รายการละ 1 รูป, server กันซ้ำ)
  standardAssetId?: string | null;
}

interface Props {
  characterId: string;
  title: ReactNode;
  segment: "wardrobe" | "expressions" | "poses"; // path segment ใต้ /characters/:id/
  entityType: string; // asset entityType: character_wardrobe / character_expression / character_pose
  assetType: string; // asset assetType tag
  hasOccasion: boolean;
  emptyText: string;
  namePlaceholder: string;
  addLabel: string;
  // Character Sheet: prompt ประจำรายการ (Master Prompt + variation) — มีแล้วการ์ดจะได้
  // ปุ่ม "📋 ก๊อป prompt" (viewer 3 ค่าย) + "📷 วางรูป" (upload → linkRole standard_image แทนที่ตัวเดิม)
  buildPrompt?: (tool: ImageTool, item: MediaItem) => string;
}

function CoverImage({ assetId, name }: { assetId: string | null; name: string }) {
  const url = useAssetImage(assetId);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} className="h-40 w-full object-cover" />;
  }
  return (
    <div className="flex h-40 w-full items-center justify-center bg-zinc-800 text-zinc-600">
      <ImageIcon className="size-10" />
    </div>
  );
}

function GalleryThumb({ assetId }: { assetId: string }) {
  const url = useAssetImage(assetId);
  return (
    <div className="h-24 w-full overflow-hidden rounded-lg bg-zinc-800">
      {url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      )}
    </div>
  );
}

export default function MediaCardSection({
  characterId,
  title,
  segment,
  entityType,
  assetType,
  hasOccasion,
  emptyText,
  namePlaceholder,
  addLabel,
  buildPrompt,
}: Props) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newOccasion, setNewOccasion] = useState("");
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // Character Sheet: prompt viewer ต่อรายการ + อัปโหลดรูปมาตรฐาน (standard_image)
  const [promptItemId, setPromptItemId] = useState<string | null>(null);
  const [stdItemId, setStdItemId] = useState<string | null>(null);
  const [stdUploading, setStdUploading] = useState(false);
  const stdFileInput = useRef<HTMLInputElement>(null);

  const base = `/characters/${characterId}/${segment}`;

  const load = useCallback(async () => {
    try {
      const rows = await api<MediaItem[]>(base);
      setItems(rows);
      setError(null);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      await api(base, {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          ...(hasOccasion && newOccasion.trim() ? { occasion: newOccasion.trim() } : {}),
        }),
      });
      setNewName("");
      setNewOccasion("");
      setCreating(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function reorder(item: MediaItem, dir: -1 | 1) {
    if (!items) return;
    const idx = items.findIndex((i) => i.id === item.id);
    const swapWith = items[idx + dir];
    if (!swapWith) return;
    try {
      await Promise.all([
        api(`${base}/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sortOrder: swapWith.sortOrder }),
        }),
        api(`${base}/${swapWith.id}`, {
          method: "PATCH",
          body: JSON.stringify({ sortOrder: item.sortOrder }),
        }),
      ]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "จัดลำดับไม่สำเร็จ");
    }
  }

  // "📷 วางรูป" — อัปโหลดรูปที่ gen มาเป็นรูปมาตรฐานของรายการ (server demote ตัวเดิมให้)
  async function handleStandardUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    const itemId = stdItemId;
    if (!file || !itemId) return;
    setStdUploading(true);
    setError(null);
    try {
      await uploadAsset(file, {
        assetType,
        entityType,
        entityId: itemId,
        linkRole: "standard_image",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setStdUploading(false);
      setStdItemId(null);
    }
  }

  const openItem = items?.find((i) => i.id === openId) ?? null;
  const promptItem = items?.find((i) => i.id === promptItemId) ?? null;
  const promptVariants: PromptVariant[] =
    buildPrompt && promptItem
      ? IMAGE_TOOLS.map((t) => ({
          tool: t.id,
          label: t.label,
          hint: t.hint,
          text: buildPrompt(t.id, promptItem),
        }))
      : [];

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">
          {title}
          {items && <span className="ml-2 text-sm font-normal text-zinc-500">({items.length})</span>}
        </h3>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {addLabel}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-amber-400/80">{error}</p>}

      {creating && (
        <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={namePlaceholder}
            maxLength={60}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
          {hasOccasion && (
            <input
              value={newOccasion}
              onChange={(e) => setNewOccasion(e.target.value)}
              placeholder="โอกาสใช้ เช่น ทำงาน, ออกงาน (ไม่บังคับ)"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
          )}
          <div className="flex gap-2">
            <button
              disabled={!newName.trim() || saving}
              onClick={create}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "เพิ่ม"}
            </button>
            <button
              onClick={() => {
                setCreating(false);
                setNewName("");
                setNewOccasion("");
              }}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {items && items.length === 0 && !creating && (
        <p className="text-sm text-zinc-500">{emptyText}</p>
      )}

      {items && items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60"
            >
              <button onClick={() => setOpenId(item.id)} className="block w-full text-left">
                <div className="relative">
                  <CoverImage assetId={item.coverAssetId} name={item.name} />
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-xs text-zinc-200">
                    <ImageIcon className="size-3.5" /> {item.imageCount}
                  </span>
                  {item.standardAssetId && (
                    <span
                      title="มีรูปมาตรฐานประจำรายการแล้ว (standard_image)"
                      className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
                    >
                      <Star className="size-3" /> มาตรฐาน
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate font-semibold">{item.name}</p>
                  {hasOccasion && item.occasion && (
                    <span className="inline-block rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                      {item.occasion}
                    </span>
                  )}
                </div>
              </button>
              <div className="flex items-center justify-between border-t border-zinc-800 px-2 py-1">
                <div className="flex gap-1">
                  <button
                    disabled={idx === 0}
                    onClick={() => reorder(item, -1)}
                    className="inline-flex items-center rounded px-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                    title="เลื่อนซ้าย"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <button
                    disabled={idx === items.length - 1}
                    onClick={() => reorder(item, 1)}
                    className="inline-flex items-center rounded px-1.5 text-zinc-400 hover:bg-zinc-800 disabled:opacity-30"
                    title="เลื่อนขวา"
                  >
                    <ArrowRight className="size-4" />
                  </button>
                </div>
                <button
                  onClick={() => setOpenId(item.id)}
                  className="rounded px-2 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  จัดการ
                </button>
              </div>
              {/* Character Sheet: ก๊อป prompt ประจำรายการ + วางรูปมาตรฐานที่ gen แล้ว */}
              {buildPrompt && (
                <div className="flex gap-1 border-t border-zinc-800 px-2 py-1.5">
                  <button
                    onClick={() => setPromptItemId(item.id)}
                    title="Master Prompt + variation ของรายการนี้ (3 ค่าย)"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-amber-400/40 px-2 py-1 text-[11px] text-amber-300 hover:bg-amber-400/10"
                  >
                    <ClipboardList className="size-3.5" /> ก๊อป prompt
                  </button>
                  <button
                    disabled={stdUploading}
                    onClick={() => {
                      setStdItemId(item.id);
                      stdFileInput.current?.click();
                    }}
                    title="อัปโหลดรูปที่ gen แล้วเป็นรูปมาตรฐานของรายการนี้ (แทนที่ตัวเดิม)"
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {stdUploading && stdItemId === item.id ? (
                      "กำลังอัป..."
                    ) : (
                      <>
                        <Camera className="size-3.5" /> วางรูป
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {buildPrompt && (
        <input
          ref={stdFileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleStandardUpload}
        />
      )}

      {buildPrompt && promptItem && promptVariants.length > 0 && (
        <PromptViewerModal
          title={`Prompt — ${promptItem.name}`}
          variants={promptVariants}
          onClose={() => setPromptItemId(null)}
        />
      )}

      {openItem && (
        <ItemModal
          base={base}
          entityType={entityType}
          assetType={assetType}
          hasOccasion={hasOccasion}
          item={openItem}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </section>
  );
}

// ── modal จัดการรายการเดียว: อัปโหลดรูป / แก้ชื่อ / ลบ ──
function ItemModal({
  base,
  entityType,
  assetType,
  hasOccasion,
  item,
  onClose,
  onChanged,
}: {
  base: string;
  entityType: string;
  assetType: string;
  hasOccasion: boolean;
  item: MediaItem;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [name, setName] = useState(item.name);
  const [occasion, setOccasion] = useState(item.occasion ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [uploading, setUploading] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadAssets = useCallback(async () => {
    try {
      const res = await api<AssetList>(
        `/assets?entityType=${encodeURIComponent(entityType)}&entityId=${item.id}`,
      );
      setAssets(res.items);
    } catch {
      setAssets([]);
    }
  }, [entityType, item.id]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      await uploadAsset(file, { assetType, entityType, entityId: item.id, linkRole: "reference" });
      await loadAssets();
      await onChanged();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveMeta() {
    setSavingMeta(true);
    setErr(null);
    try {
      await api(`${base}/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          ...(hasOccasion ? { occasion: occasion.trim() } : {}),
          description: description.trim(),
        }),
      });
      await onChanged();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSavingMeta(false);
    }
  }

  async function removeItem() {
    if (!confirm(`ลบ "${item.name}"?`)) return;
    try {
      await api(`${base}/${item.id}`, { method: "DELETE" });
      await onChanged();
      onClose();
    } catch (error) {
      setErr(error instanceof Error ? error.message : "ลบไม่สำเร็จ");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-semibold">{item.name}</h4>
          <button onClick={onClose} className="inline-flex items-center text-zinc-400 hover:text-zinc-200">
            <X className="size-5" />
          </button>
        </div>

        {err && <p className="mb-3 text-sm text-red-400">{err}</p>}

        {/* รูปภาพ */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">รูปภาพ ({assets.length})</span>
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            <button
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {uploading ? "กำลังอัปโหลด..." : "+ อัปโหลดรูป"}
            </button>
          </div>
          {assets.length === 0 ? (
            <p className="text-sm text-zinc-500">ยังไม่มีรูป — อัปโหลดรูปตัวอย่างได้เลย</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {assets.map((a) => (
                <GalleryThumb key={a.id} assetId={a.id} />
              ))}
            </div>
          )}
        </div>

        {/* แก้ไขข้อมูล */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-zinc-500">ชื่อ</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
          </div>
          {hasOccasion && (
            <div>
              <label className="mb-1 block text-xs text-zinc-500">โอกาสใช้</label>
              <input
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-zinc-500">รายละเอียด</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
          </div>
          <div className="flex items-center justify-between">
            <button
              disabled={!name.trim() || savingMeta}
              onClick={saveMeta}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {savingMeta ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
            </button>
            <button
              onClick={removeItem}
              className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400 hover:bg-red-950/40"
            >
              ลบรายการนี้
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
