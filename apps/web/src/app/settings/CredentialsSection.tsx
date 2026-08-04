"use client";

import { useEffect, useState } from "react";
import { Bot, Cloud, Smartphone, Check, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";

export type SettingGroup = "ai" | "storage" | "notify";

export interface SettingItem {
  key: string;
  group: SettingGroup;
  isSecret: boolean;
  hasValue: boolean;
  source: "db" | "env" | null;
  preview: string | null; // secret → '••••abcd' / non-secret → ค่าเต็ม / null = ยังไม่ตั้งค่า
}

export interface SettingsResponse {
  groups: { group: SettingGroup; items: SettingItem[] }[];
}

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

const FIELD_META: Record<string, { label: string; hint?: string }> = {
  ANTHROPIC_API_KEY: { label: "ANTHROPIC_API_KEY", hint: "API key จาก console.anthropic.com" },
  ANTHROPIC_MODEL: { label: "ANTHROPIC_MODEL", hint: "ค่าเริ่มต้น claude-opus-4-8" },
  OPENAI_API_KEY: {
    label: "OPENAI_API_KEY (ChatGPT)",
    hint: "API key จาก platform.openai.com — สำหรับฟีเจอร์ gen ภาพในระบบ (กำลังต่อยอด)",
  },
  XAI_API_KEY: {
    label: "XAI_API_KEY (Grok)",
    hint: "API key จาก console.x.ai — สำหรับฟีเจอร์ gen ภาพในระบบ (กำลังต่อยอด)",
  },
  R2_ACCOUNT_ID: { label: "R2_ACCOUNT_ID", hint: "Account ID (หน้า R2 overview ด้านขวา)" },
  R2_ACCESS_KEY_ID: { label: "R2_ACCESS_KEY_ID" },
  R2_SECRET_ACCESS_KEY: { label: "R2_SECRET_ACCESS_KEY" },
  R2_BUCKET: { label: "R2_BUCKET", hint: "ชื่อ bucket ที่จะเก็บไฟล์" },
  R2_PUBLIC_DOMAIN: { label: "R2_PUBLIC_DOMAIN", hint: "โดเมนสาธารณะของ bucket เช่น cdn.aistar.co" },
  LINE_CHANNEL_ACCESS_TOKEN: {
    label: "LINE_CHANNEL_ACCESS_TOKEN",
    hint: "Channel access token จาก LINE Developers Console (Messaging API)",
  },
};

const SECTION_META: Record<
  SettingGroup,
  { icon: LucideIcon; title: string; note?: string; pending?: boolean; help?: string[] }
> = {
  ai: {
    icon: Bot,
    title: "AI (Claude)",
    note: "ค่าที่บันทึกที่นี่จะ override ค่าใน .env และมีผลทันที ไม่ต้อง restart API",
  },
  storage: {
    icon: Cloud,
    title: "Cloudflare R2",
    pending: true,
    help: [
      "Cloudflare Dashboard → R2 → Manage API Tokens → สร้าง token แล้วคัดลอก Access Key ID / Secret Access Key",
      "Account ID อยู่ที่หน้า R2 overview (แถบด้านขวา)",
    ],
  },
  notify: {
    icon: Smartphone,
    title: "LINE แจ้งเตือน",
    pending: true,
  },
};

function SourceTag({ source }: { source: SettingItem["source"] }) {
  if (!source) return null;
  return (
    <span className="text-[10px] text-zinc-500">
      {source === "db" ? "จากหน้านี้" : "จาก .env"}
    </span>
  );
}

function SettingsGroup({
  group,
  items,
  refreshKey,
  onReload,
}: {
  group: SettingGroup;
  items: SettingItem[];
  refreshKey: number;
  onReload: () => Promise<void>;
}) {
  const meta = SECTION_META[group];
  const Icon = meta.icon;
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // เติมค่า non-secret ปัจจุบันลง input / secret เริ่มว่างเสมอ (โชว์ preview เป็น placeholder)
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of items) next[item.key] = item.isSecret ? "" : (item.preview ?? "");
    setDrafts(next);
    // refreshKey เปลี่ยนทุกครั้งที่โหลดข้อมูลใหม่ → reset drafts ให้ตรงกับ server
  }, [items, refreshKey]);

  const isDirty = (item: SettingItem) =>
    item.isSecret ? (drafts[item.key] ?? "") !== "" : (drafts[item.key] ?? "") !== (item.preview ?? "");

  const dirtyItems = items.filter(isDirty);

  async function save() {
    if (!dirtyItems.length) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      // ส่งเฉพาะ key ที่ผู้ใช้แก้จริง — ไม่ส่ง secret ที่ไม่ได้พิมพ์ทับ
      await api<SettingsResponse>("/settings", {
        method: "PUT",
        body: JSON.stringify({
          items: dirtyItems.map((i) => ({ key: i.key, value: drafts[i.key] ?? "" })),
        }),
      });
      await onReload();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function clearSecret(item: SettingItem) {
    if (
      !window.confirm(
        `ล้างค่า ${item.key} ที่ตั้งจากหน้านี้?\nระบบจะกลับไปใช้ค่าจาก .env (ถ้ามี)`,
      )
    )
      return;
    setError(null);
    try {
      await api<SettingsResponse>("/settings", {
        method: "PUT",
        body: JSON.stringify({ items: [{ key: item.key, value: "" }] }),
      });
      await onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ล้างค่าไม่สำเร็จ");
    }
  }

  const aiKey = group === "ai" ? items.find((i) => i.key === "ANTHROPIC_API_KEY") : undefined;

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4" /> {meta.title}
        </h2>
        {aiKey && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              aiKey.hasValue ? "bg-emerald-900 text-emerald-200" : "bg-zinc-800 text-zinc-400"
            }`}
          >
            {aiKey.hasValue ? "เชื่อมต่อแล้ว" : "ยังไม่ตั้งค่า"}
          </span>
        )}
        {meta.pending && (
          <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-300">
            รอเปิดใช้ — กรอกค่าเก็บไว้ได้เลย
          </span>
        )}
      </div>

      {meta.note && <p className="text-xs text-zinc-500">{meta.note}</p>}
      {group === "storage" && (
        <p className="text-xs text-zinc-500">
          ระบบจัดเก็บไฟล์บน R2 กำลังจะมา — กรอกค่าเตรียมไว้ก่อนได้
        </p>
      )}
      {meta.help && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-zinc-500">
          {meta.help.map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const fm = FIELD_META[item.key] ?? { label: item.key };
          return (
            <div key={item.key} className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-zinc-300">{fm.label}</label>
                <SourceTag source={item.source} />
              </div>
              <div className="flex gap-2">
                <input
                  type={item.isSecret ? "password" : "text"}
                  value={drafts[item.key] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [item.key]: e.target.value }))}
                  placeholder={
                    item.isSecret
                      ? (item.preview ?? "ยังไม่ตั้งค่า — วางค่าใหม่ที่นี่")
                      : (fm.hint ?? "")
                  }
                  autoComplete="off"
                  className={inputCls}
                />
                {item.isSecret && item.source === "db" && (
                  <button
                    type="button"
                    onClick={() => clearSecret(item)}
                    title="ล้างค่าที่ตั้งจากหน้านี้ (กลับไปใช้ .env)"
                    className="shrink-0 rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 hover:bg-red-950"
                  >
                    ล้างค่า
                  </button>
                )}
              </div>
              {fm.hint && !item.isSecret && (
                <p className="text-[11px] text-zinc-600">{fm.hint}</p>
              )}
              {item.isSecret && isDirty(item) && (
                <p className="text-[11px] text-amber-300/80">จะบันทึกค่าใหม่ทับค่าเดิม</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirtyItems.length}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        {saved && <span className="inline-flex items-center gap-1 text-sm text-emerald-300"><Check className="size-3.5" /> บันทึกแล้ว</span>}
        {error && <span className="text-sm text-red-400">{error}</span>}
      </div>
    </section>
  );
}

// ⚙️ ระบบ / Credentials — รวมทุก group (AI / R2 / LINE) ของ /settings
export default function CredentialsSection({
  data,
  refreshKey,
  onReload,
}: {
  data: SettingsResponse | null;
  refreshKey: number;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-400">
        ตั้งค่า credential ของ integration ทั้งหมดจากหน้านี้ — ค่าที่บันทึกจะ override ค่าใน{" "}
        <code className="rounded bg-zinc-800 px-1 text-xs">.env</code>
      </p>
      {!data && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}
      {data?.groups.map((g) => (
        <SettingsGroup
          key={g.group}
          group={g.group}
          items={g.items}
          refreshKey={refreshKey}
          onReload={onReload}
        />
      ))}
    </div>
  );
}
