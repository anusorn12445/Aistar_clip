"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createMediaLink,
  deleteMediaLink,
  fetchMediaLinksManage,
  updateMediaLink,
  type MediaLink,
  type MediaLinkInput,
} from "@/lib/api";
import { Folder } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

interface LinkForm {
  label: string;
  url: string;
  category: string;
  icon: string;
  note: string;
  sortOrder: string;
}

const EMPTY_FORM: LinkForm = {
  label: "",
  url: "",
  category: "",
  icon: "",
  note: "",
  sortOrder: "0",
};

function toForm(l: MediaLink): LinkForm {
  return {
    label: l.label,
    url: l.url,
    category: l.category ?? "",
    icon: l.icon ?? "",
    note: l.note ?? "",
    sortOrder: String(l.sortOrder ?? 0),
  };
}

function formPayload(f: LinkForm): MediaLinkInput {
  return {
    label: f.label.trim(),
    url: f.url.trim(),
    category: f.category.trim() || null,
    icon: f.icon.trim() || null,
    note: f.note.trim() || null,
    sortOrder: f.sortOrder.trim() === "" ? 0 : Math.max(0, Math.round(Number(f.sortOrder) || 0)),
  };
}

function LinkFormPanel({
  form,
  setForm,
  onSave,
  onCancel,
  saving,
  title,
}: {
  form: LinkForm;
  setForm: (f: LinkForm) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  title: string;
}) {
  const patch = (p: Partial<LinkForm>) => setForm({ ...form, ...p });
  return (
    <div className="space-y-3 rounded-xl border border-amber-400/40 bg-zinc-950/60 p-4">
      <p className="text-sm font-semibold text-amber-300">{title}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">ชื่อลิงก์ *</label>
          <input
            value={form.label}
            onChange={(e) => patch({ label: e.target.value })}
            placeholder="เช่น คลังรูปสินค้า Q3"
            maxLength={100}
            className={inputCls}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">URL * (ขึ้นต้น https://)</label>
          <input
            value={form.url}
            onChange={(e) => patch({ url: e.target.value })}
            placeholder="https://drive.google.com/..."
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">หมวด</label>
          <input
            value={form.category}
            onChange={(e) => patch({ category: e.target.value })}
            placeholder="เช่น รูปสินค้า, วิดีโอ"
            maxLength={60}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">ไอคอน (emoji)</label>
          <input
            value={form.icon}
            onChange={(e) => patch({ icon: e.target.value })}
            placeholder=""
            maxLength={8}
            className={inputCls}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-300">ลำดับ (sortOrder)</label>
          <input
            value={form.sortOrder}
            onChange={(e) => patch({ sortOrder: e.target.value })}
            inputMode="numeric"
            placeholder="0"
            className={inputCls}
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-xs font-medium text-zinc-300">โน้ต</label>
          <input
            value={form.note}
            onChange={(e) => patch({ note: e.target.value })}
            placeholder="อธิบายสั้น ๆ ว่าโฟลเดอร์นี้มีอะไร"
            maxLength={300}
            className={inputCls}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !form.label.trim() || !form.url.trim()}
          onClick={onSave}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}

export default function MediaCenterSection() {
  const [links, setLinks] = useState<MediaLink[] | null>(null);
  const [unavailable, setUnavailable] = useState(false); // API build เก่า (404)
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<LinkForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<LinkForm>(EMPTY_FORM);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetchMediaLinksManage();
      setLinks(res);
      setUnavailable(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (/404|Cannot (GET|POST|PATCH|DELETE)|not found/i.test(msg)) setUnavailable(true);
      else if (!msg.includes("ต้องมีสิทธิ์") && !msg.includes("Forbidden")) {
        setError(msg || "โหลดลิงก์ไม่สำเร็จ");
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function saveAdd() {
    void run(async () => {
      await createMediaLink(formPayload(addForm));
      setAddForm(EMPTY_FORM);
      setAdding(false);
    });
  }

  function saveEdit() {
    const id = editId;
    if (!id) return;
    void run(async () => {
      await updateMediaLink(id, formPayload(editForm));
      setEditId(null);
    });
  }

  function toggleArchive(l: MediaLink) {
    const status = l.status === "active" ? "archived" : "active";
    void run(() => updateMediaLink(l.id, { status }));
  }

  function remove(l: MediaLink) {
    if (!confirm(`ลบลิงก์ "${l.label}"?`)) return;
    void run(() => deleteMediaLink(l.id));
  }

  if (unavailable) {
    return (
      <section className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Folder className="size-4" /> Media Center</h2>
        <p className="text-xs text-zinc-500">พร้อมใช้งานหลัง API รีสตาร์ท — รอสักครู่แล้วรีเฟรช</p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex items-center gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold"><Folder className="size-4" /> Media Center</h2>
      </div>
      <p className="text-xs text-zinc-500">
        จัดการลิงก์คลังงานของทีม (Google Drive ฯลฯ) — ทุกคนที่ล็อกอินจะเห็นลิงก์ที่ &ldquo;เปิดใช้&rdquo; ในหน้า{" "}
        <b className="text-zinc-300">Media Center</b> จัดกลุ่มด้วยหมวดและเรียงตามลำดับ
      </p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="space-y-2">
        {links?.map((l) =>
          editId === l.id ? (
            <LinkFormPanel
              key={l.id}
              form={editForm}
              setForm={setEditForm}
              onSave={saveEdit}
              onCancel={() => setEditId(null)}
              saving={busy}
              title={`แก้ไข: ${l.label}`}
            />
          ) : (
            <div
              key={l.id}
              className={`flex flex-wrap items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 ${
                l.status === "archived" ? "opacity-60" : ""
              }`}
            >
              <span className="text-lg leading-6">{l.icon || "📁"}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      l.status === "active" ? "text-zinc-100" : "text-zinc-500 line-through"
                    }`}
                  >
                    {l.label}
                  </span>
                  {l.category && (
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-300">
                      {l.category}
                    </span>
                  )}
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                    #{l.sortOrder}
                  </span>
                </div>
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[11px] text-amber-300/80 hover:text-amber-200"
                >
                  {l.url}
                </a>
                {l.note && <p className="text-[11px] text-zinc-500">{l.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  disabled={busy}
                  onClick={() => {
                    setEditForm(toForm(l));
                    setEditId(l.id);
                    setAdding(false);
                  }}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  แก้ไข
                </button>
                <button
                  disabled={busy}
                  onClick={() => toggleArchive(l)}
                  className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {l.status === "active" ? "เก็บเข้ากรุ" : "กู้คืน"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => remove(l)}
                  className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                >
                  ลบ
                </button>
              </div>
            </div>
          ),
        )}
        {links && links.length === 0 && (
          <p className="py-4 text-center text-sm text-zinc-500">
            ยังไม่มีลิงก์ — กด &ldquo;+ เพิ่มลิงก์&rdquo; เพื่อสร้างลิงก์แรก
          </p>
        )}
        {!links && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
      </div>

      {adding ? (
        <LinkFormPanel
          form={addForm}
          setForm={setAddForm}
          onSave={saveAdd}
          onCancel={() => {
            setAdding(false);
            setAddForm(EMPTY_FORM);
          }}
          saving={busy}
          title="+ ลิงก์ใหม่"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setAddForm(EMPTY_FORM);
            setAdding(true);
            setEditId(null);
          }}
          className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10"
        >
          + เพิ่มลิงก์
        </button>
      )}
    </section>
  );
}
