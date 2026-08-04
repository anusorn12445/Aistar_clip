"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clapperboard, ClipboardList, Package } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import { api } from "@/lib/api";
import {
  archiveTemplate,
  cloneTemplate,
  fetchTemplates,
  TEMPLATE_STATUS_LABEL,
  type InteractionTemplate,
  type Paged,
} from "@/lib/interaction";

const filterCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";
const btnPrimary =
  "rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50";
const btnGhost =
  "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800";

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function fmtDur(sec: number | null | undefined): string {
  if (sec == null) return "—";
  return `${Math.round(sec * 10) / 10} วิ`;
}

function TemplateCard({
  t,
  onClone,
  onArchive,
}: {
  t: InteractionTemplate;
  onClone: () => void;
  onArchive: () => void;
}) {
  const st = TEMPLATE_STATUS_LABEL[t.status] ?? TEMPLATE_STATUS_LABEL.draft;
  return (
    <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/interaction-templates/${t.id}`} className="min-w-0 hover:text-amber-300">
          <p className="truncate font-medium text-zinc-100">{t.name}</p>
          <p className="font-mono text-[11px] text-zinc-500">
            {t.displayCode} · {t.version}
          </p>
        </Link>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {t.packagingType && (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-900/50 px-2 py-0.5 text-[11px] text-blue-200">
            <Package className="size-4" /> {t.packagingType}
          </span>
        )}
        {t.productCategory && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
            {t.productCategory}
          </span>
        )}
        {t.storyboardType && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-900/50 px-2 py-0.5 text-[11px] text-purple-200">
            <Clapperboard className="size-4" /> {t.storyboardType}
          </span>
        )}
        {t.platform && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{t.platform}</span>
        )}
      </div>
      <p className="text-xs text-zinc-400">
        {t.stepCount ?? 0} steps · รวม {fmtDur(t.totalDurationSec)}
        {t.targetDurationSec != null && (
          <span className="text-zinc-500"> / เป้าหมาย {fmtDur(t.targetDurationSec)}</span>
        )}
      </p>
      <div className="flex justify-end gap-1.5">
        <Link href={`/interaction-templates/${t.id}`} className={btnGhost}>
          แก้ไข
        </Link>
        <button type="button" onClick={onClone} className={btnGhost}>
          Clone
        </button>
        {t.status !== "archived" && (
          <button type="button" onClick={onArchive} className={`${btnGhost} hover:text-red-300`}>
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

export default function InteractionTemplatesPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [fPackaging, setFPackaging] = useState("");
  const [fCategory, setFCategory] = useState("");
  const [fStatus, setFStatus] = useState("");

  const [data, setData] = useState<Paged<InteractionTemplate> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filters: Record<string, string> = {
    q,
    packagingType: fPackaging,
    productCategory: fCategory,
    status: fStatus,
  };
  const filterKey = JSON.stringify(filters);

  const load = useCallback(async () => {
    try {
      setData(await fetchTemplates(filters));
      setError(null);
    } catch (err) {
      setError(errMsg(err, "โหลด interaction templates ไม่สำเร็จ"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  async function handleCreate() {
    const name = window.prompt("ชื่อเทมเพลตใหม่ (เช่น สูตรเปิดขวดเซรั่ม)");
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const created = await api<InteractionTemplate>("/interaction-templates", {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      router.push(`/interaction-templates/${created.id}`);
    } catch (err) {
      setError(errMsg(err, "สร้างเทมเพลตไม่สำเร็จ"));
      setCreating(false);
    }
  }

  async function handleClone(t: InteractionTemplate) {
    try {
      const copy = await cloneTemplate(t.id);
      router.push(`/interaction-templates/${copy.id}`);
    } catch (err) {
      setError(errMsg(err, "clone ไม่สำเร็จ"));
    }
  }

  async function handleArchive(t: InteractionTemplate) {
    if (!window.confirm(`archive เทมเพลต "${t.name}" ?`)) return;
    try {
      await archiveTemplate(t.id);
      await load();
    } catch (err) {
      setError(errMsg(err, "archive ไม่สำเร็จ"));
    }
  }

  return (
    <AppShell title="Interaction Templates">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหาชื่อ / ITPL-code..."
            className={`${filterCls} min-w-48 flex-1`}
          />
          <input
            value={fPackaging}
            onChange={(e) => setFPackaging(e.target.value)}
            placeholder="แพ็กเกจ เช่น bottle"
            className={`${filterCls} w-36`}
          />
          <input
            value={fCategory}
            onChange={(e) => setFCategory(e.target.value)}
            placeholder="หมวดสินค้า เช่น beauty"
            className={`${filterCls} w-36`}
          />
          <FilterSelect
            value={fStatus}
            onChange={setFStatus}
            options={[
              { value: "", label: "ทุก status (ไม่รวม archived)" },
              { value: "draft", label: "Draft" },
              { value: "active", label: "Active" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <button onClick={handleCreate} disabled={creating} className={btnPrimary}>
            + สร้างเทมเพลต
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {data?.items.map((t) => (
            <TemplateCard
              key={t.id}
              t={t}
              onClone={() => void handleClone(t)}
              onArchive={() => void handleArchive(t)}
            />
          ))}
        </div>
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <ClipboardList className="mx-auto size-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">ยังไม่มีเทมเพลตตาม filter ที่เลือก</p>
            <p className="mt-1 text-xs text-zinc-500">
              สร้าง &quot;สูตรคลิป&quot; ต่อ packaging — ผูกท่าจาก Gesture Library + มือจาก Hand Library
            </p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
