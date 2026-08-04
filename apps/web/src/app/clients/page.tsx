"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import type { Client } from "@/lib/api";
import type { Brand } from "@/lib/catalog";
import { FilterSelect } from "@/components/ui/filter-select";
import { MessageSquare, ReceiptText, FileText } from "lucide-react";

const CLIENT_TYPES: { value: string; label: string }[] = [
  { value: "brand", label: "แบรนด์" },
  { value: "agency", label: "เอเจนซี่" },
  { value: "shop", label: "ร้านค้า" },
  { value: "individual", label: "บุคคล" },
];

const emptyForm = {
  name: "",
  type: "brand",
  contactName: "",
  phone: "",
  line: "",
  email: "",
  brandId: "",
  notes: "",
};

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!showArchived) params.set("status", "active");
    api<Client[]>(`/clients${params.toString() ? `?${params}` : ""}`)
      .then((res) => {
        setClients(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [q, showArchived]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<Brand[]>("/brands")
      .then(setBrands)
      .catch(() => setBrands([]));
  }, []);

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEdit(c: Client) {
    setEditId(c.id);
    setForm({
      name: c.name,
      type: c.type ?? "brand",
      contactName: c.contactName ?? "",
      phone: c.phone ?? "",
      line: c.line ?? "",
      email: c.email ?? "",
      brandId: c.brandId ?? "",
      notes: c.notes ?? "",
    });
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      name: form.name,
      type: form.type || undefined,
      contactName: form.contactName || undefined,
      phone: form.phone || undefined,
      line: form.line || undefined,
      email: form.email || undefined,
      brandId: form.brandId || undefined,
      notes: form.notes || undefined,
    };
    try {
      if (editId) {
        await api(`/clients/${editId}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/clients", { method: "POST", body: JSON.stringify(body) });
      }
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(c: Client) {
    const status = c.status === "archived" ? "active" : "archived";
    await api(`/clients/${c.id}`, { method: "PATCH", body: JSON.stringify({ status }) }).catch((err) =>
      setError(err instanceof Error ? err.message : "อัปเดตไม่สำเร็จ"),
    );
    load();
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell
      title="Clients / ลูกค้า"
      actions={
        <button
          onClick={openCreate}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + เพิ่มลูกค้า
        </button>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า / ผู้ติดต่อ..."
            className={`${inputCls} w-64 bg-zinc-900`}
          />
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              showArchived ? "border-amber-400 text-amber-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {showArchived ? "รวม archive แล้ว" : "แสดงเฉพาะ active"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSave} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm font-semibold text-amber-300">{editId ? "แก้ไขลูกค้า" : "ลูกค้าใหม่"}</p>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อลูกค้า *"
                className={inputCls}
              />
              <FilterSelect
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={CLIENT_TYPES.map((t) => ({ value: t.value, label: t.label }))}
              />
              <input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="ชื่อผู้ติดต่อ"
                className={inputCls}
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="เบอร์โทร"
                className={inputCls}
              />
              <input
                value={form.line}
                onChange={(e) => setForm({ ...form, line: e.target.value })}
                placeholder="LINE ID"
                className={inputCls}
              />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="อีเมล"
                className={inputCls}
              />
              <FilterSelect
                value={form.brandId}
                onChange={(v) => setForm({ ...form, brandId: v })}
                options={[
                  { value: "", label: "— ลิงก์แบรนด์ (ถ้ามี) —" },
                  ...brands.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="โน้ต"
              className={`${inputCls} w-full`}
              rows={2}
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="text-sm text-zinc-500 hover:text-zinc-300">
                ยกเลิก
              </button>
            </div>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {clients.map((c) => (
            <div
              key={c.id}
              className={`rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${c.status === "archived" ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between">
                <button
                  onClick={() => router.push(`/clients/${c.id}`)}
                  className="text-left text-base font-semibold text-zinc-100 hover:text-amber-300"
                >
                  {c.name}
                </button>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
                  {CLIENT_TYPES.find((t) => t.value === c.type)?.label ?? c.type ?? "—"}
                </span>
              </div>
              <div className="mt-1 space-y-0.5 text-xs text-zinc-500">
                {c.contactName && <p>{c.contactName}</p>}
                {c.phone && <p>{c.phone}</p>}
                {c.line && <p className="flex items-center gap-1"><MessageSquare className="size-3.5" /> {c.line}</p>}
              </div>
              <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-2">
                <span className="flex items-center gap-1 text-xs text-zinc-400"><ReceiptText className="size-3.5" /> {c.jobCount ?? 0} งาน</span>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => router.push(`/prompts?entityType=client&entityId=${c.id}`)}
                    title="Prompt ที่เชื่อมกับลูกค้ารายนี้"
                    className="inline-flex items-center gap-1 text-zinc-400 hover:text-amber-300"
                  >
                    <FileText className="size-3.5" /> Prompt
                  </button>
                  <button onClick={() => openEdit(c)} className="text-zinc-400 hover:text-amber-300">
                    แก้ไข
                  </button>
                  <button onClick={() => toggleArchive(c)} className="text-zinc-500 hover:text-red-300">
                    {c.status === "archived" ? "กู้คืน" : "archive"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {clients.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 py-12 text-center text-sm text-zinc-500">
            ยังไม่มีลูกค้า — กด &ldquo;+ เพิ่มลูกค้า&rdquo;
          </div>
        )}
      </div>
    </AppShell>
  );
}
