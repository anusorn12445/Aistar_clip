"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import CoverPicker from "@/components/CoverPicker";
import PromptViewerModal from "@/components/PromptViewerModal";
import RelationPicker from "@/components/RelationPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { buildPromptVersionVariants } from "@/lib/promptBuilders";
import {
  api,
  getToken,
  type Character,
  type CharacterList,
  type Client,
  type BrandListItem,
} from "@/lib/api";
import type { Paged, Product } from "@/lib/catalog";
import {
  PROMPT_TYPES,
  PROMPT_TYPE_LABEL,
  RELATION_ENTITY_TYPES,
  RELATION_TYPE_META,
  addPromptRelation,
  fetchPromptRelations,
  removePromptRelation,
  type Platform,
  type Prompt,
  type PromptDetail,
  type PromptList,
  type PromptRelation,
  type PromptVersion,
  type RelationEntityType,
} from "@/lib/prompts";
import PromptExamples from "./PromptExamples";
import QuickCapture from "./QuickCapture";
import HubTab from "./HubTab";
import {
  Check,
  Eye,
  Globe,
  Image as ImageIcon,
  LayoutGrid,
  Link as LinkIcon,
  List,
  Pencil,
  Star,
  Trash2,
  Undo2,
  X,
  Zap,
} from "lucide-react";

// list อาจแนบ field เสริมจาก API build ใหม่ — build เก่าไม่มี ก็ fallback ผ่าน thumbnails endpoint ได้
type PromptRow = Prompt & {
  exampleThumbAssetId?: string | null;
  exampleCount?: number;
};

// ชื่อ entity ของ relation filter ที่ deep-link มา (?entityType=..&entityId=..) — best-effort
async function resolveRelName(t: RelationEntityType, id: string): Promise<string> {
  try {
    if (t === "character") return (await api<Character>(`/characters/${id}`)).nameTh;
    if (t === "product") return (await api<Product>(`/products/${id}`)).name;
    if (t === "client") return (await api<Client>(`/clients/${id}`)).name;
    return (await api<{ name: string }>(`/brands/${id}`)).name;
  } catch {
    return `${id.slice(0, 8)}…`;
  }
}

// chip แถว "🔗 เชื่อมกับ" — ใช้ทั้งการ์ด, ตาราง (read-only), detail panel และฟอร์ม (staged)
function RelationChips({
  relations,
  onRemove,
  onAdd,
  addLabel = "+ เชื่อม",
}: {
  relations: PromptRelation[];
  onRemove?: (rel: PromptRelation) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  if (relations.length === 0 && !onAdd) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {relations.map((r) => (
        <span
          key={`${r.entityType}-${r.entityId}`}
          title={`${RELATION_TYPE_META[r.entityType].label}: ${r.name}${r.code ? ` (${r.code})` : ""}`}
          className="flex max-w-40 items-center gap-1 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
        >
          <span>{RELATION_TYPE_META[r.entityType].icon}</span>
          <span className="truncate">{r.name}</span>
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(r);
              }}
              title="เอาการเชื่อมออก"
              className="text-zinc-500 hover:text-red-300"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="rounded-full border border-dashed border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-amber-400/50 hover:text-amber-300"
        >
          {addLabel}
        </button>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  internal_review: { label: "รอตรวจ", cls: "bg-blue-900 text-blue-200" },
  revision_needed: { label: "ต้องแก้", cls: "bg-orange-900 text-orange-200" },
  approved: { label: "Approved", cls: "bg-emerald-900 text-emerald-200" },
  production_ready: { label: "Production Ready", cls: "bg-amber-900 text-amber-200" },
  rejected: { label: "Rejected", cls: "bg-red-900 text-red-200" },
  archived: { label: "Archived", cls: "bg-zinc-800 text-zinc-500" },
};

const NEW_PLATFORM = "__new__";

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

const emptyPromptForm = {
  name: "",
  promptType: "identity",
  body: "",
  negativeBody: "",
  targetPlatform: "",
  newPlatform: "",
  modelName: "",
  modelVersion: "",
  seed: "",
  generationParams: "",
};

const emptyVersionForm = {
  body: "",
  negativeBody: "",
  targetPlatform: "",
  newPlatform: "",
  modelName: "",
  modelVersion: "",
  seed: "",
  performanceNote: "",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard ไม่พร้อม — ไม่ต้องทำอะไร */
        }
      }}
      className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
    >
      {copied ? "คัดลอกแล้ว" : "คัดลอก"}
    </button>
  );
}

function VersionBlock({
  v,
  promptName,
  isCurrent,
  onEdit,
  onUse,
}: {
  v: PromptVersion;
  promptName?: string;
  /** version ล่าสุด = ตัวที่ใช้อยู่ (ทีมขอ: แก้ไข/เปลี่ยนตัวที่ใช้ได้) */
  isCurrent?: boolean;
  onEdit?: () => void;
  onUse?: () => void;
}) {
  // 👁️ ดู/ก๊อป — เปิด shared PromptViewerModal ของ version นี้ (body + Model/Params, negative แยกใน "ข้อมูลภายใน")
  const [showViewer, setShowViewer] = useState(false);
  return (
    <div className={`rounded-xl border p-4 ${isCurrent ? "border-amber-400/40 bg-zinc-950/60" : "border-zinc-800 bg-zinc-950/60"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="rounded-full bg-amber-400/10 px-2 py-0.5 font-mono font-semibold text-amber-300">
          {v.versionLabel}
        </span>
        {isCurrent && (
          <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 font-semibold text-emerald-300">
            <Check className="size-4" /> ตัวที่ใช้อยู่
          </span>
        )}
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">{v.targetPlatform}</span>
        {v.modelName && (
          <span>
            {v.modelName}
            {v.modelVersion ? ` ${v.modelVersion}` : ""}
          </span>
        )}
        {v.seed && <span className="font-mono">seed: {v.seed}</span>}
        <button
          type="button"
          onClick={() => setShowViewer(true)}
          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
        >
          <Eye className="size-4" /> ดู/ก๊อป
        </button>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title="เอาเนื้อหา version นี้ไปแก้ — บันทึกเป็น version ใหม่ (ประวัติเดิมไม่หาย)"
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-amber-300"
          >
            <Pencil className="size-4" /> แก้ไข
          </button>
        )}
        {onUse && !isCurrent && (
          <button
            type="button"
            onClick={onUse}
            title="เปลี่ยนกลับมาใช้ version นี้ — ระบบจะก๊อปขึ้นเป็น version ล่าสุดให้"
            className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
          >
            <Undo2 className="size-4" /> ใช้ตัวนี้
          </button>
        )}
        <span className="ml-auto">{new Date(v.createdAt).toLocaleString("th-TH")}</span>
      </div>
      {showViewer && (
        <PromptViewerModal
          title={`ดู/ก๊อป Prompt — ${promptName ? `${promptName} ` : ""}${v.versionLabel}`}
          variants={buildPromptVersionVariants(v)}
          onClose={() => setShowViewer(false)}
        />
      )}
      <div className="relative">
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 pr-24 font-mono text-xs leading-relaxed text-zinc-200">
          {v.body}
        </pre>
        <div className="absolute right-2 top-2">
          <CopyButton text={v.body} />
        </div>
      </div>
      {v.negativeBody && (
        <div className="relative mt-2">
          <p className="mb-1 text-xs text-red-300/80">Negative prompt</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-3 pr-24 font-mono text-xs leading-relaxed text-red-200/80">
            {v.negativeBody}
          </pre>
          <div className="absolute right-2 top-7">
            <CopyButton text={v.negativeBody} />
          </div>
        </div>
      )}
      {v.performanceNote && (
        <p className="mt-2 text-xs text-zinc-400">
          <span className="text-zinc-500">Performance note:</span> {v.performanceNote}
        </p>
      )}
      {v.sourceUrl && (
        <p className="mt-2 truncate text-xs text-zinc-400">
          <span className="text-zinc-500">ที่มา:</span>{" "}
          <a
            href={v.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-300/80 underline-offset-2 hover:underline"
          >
            {v.sourceUrl}
          </a>
        </p>
      )}
    </div>
  );
}

function PromptsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PromptList | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [error, setError] = useState<string | null>(null);

  // แท็บ: ⭐ คลังหลัก (เดิม, default) | 🌐 ทุกแหล่ง (Prompt Hub) — sync URL ?tab=hub
  const [tab, setTab] = useState<"library" | "hub">(() =>
    searchParams.get("tab") === "hub" ? "hub" : "library",
  );

  // image-first: การ์ดเป็นค่า default — สลับเป็นตารางได้เมื่ออยากไล่ดูข้อมูลแบบคอลัมน์
  const [view, setView] = useState<"grid" | "table">("grid");
  // ปกที่เพิ่งอัปโหลด/ตั้ง/ลบใน session นี้ (promptId → assetId | null) — โชว์ทันทีไม่ต้อง refetch
  const [covers, setCovers] = useState<Record<string, string | null>>({});

  // filters
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("");
  const [fPlatform, setFPlatform] = useState("");
  // relation filter — คู่เดียวเสมอ (API รับ entityType+entityId คู่เดียว) — sync กับ URL
  // ค่าแรกอ่านจาก deep-link (?entityType=product&entityId=...) — ชื่อ resolve ทีหลังใน effect
  const [relFilter, setRelFilter] = useState<PromptRelation | null>(() => {
    const et = searchParams.get("entityType");
    const eid = searchParams.get("entityId");
    if (et && eid && (RELATION_ENTITY_TYPES as string[]).includes(et)) {
      return { entityType: et as RelationEntityType, entityId: eid, name: "…" };
    }
    return null;
  });

  // entity lists สำหรับ dropdown filter (ตัวละคร/สินค้า/ลูกค้า/แบรนด์)
  const [fCharacters, setFCharacters] = useState<Character[]>([]);
  const [fProducts, setFProducts] = useState<Product[]>([]);
  const [fClients, setFClients] = useState<Client[]>([]);
  const [fBrands, setFBrands] = useState<BrandListItem[]>([]);

  // RelationPicker: card = เชื่อม prompt ที่มีอยู่ทันที, form/capture = stage ไว้ก่อน
  const [pickerFor, setPickerFor] = useState<
    | { mode: "card"; promptId: string; linked: PromptRelation[] }
    | { mode: "form" }
    | null
  >(null);
  // relations ที่ stage ไว้ในฟอร์มสร้าง prompt (ยิง POST หลังสร้างสำเร็จ)
  const [stagedRels, setStagedRels] = useState<PromptRelation[]>([]);

  // quick-capture modal (⚡ เพิ่มเร็ว — วางจาก Facebook)
  const [showCapture, setShowCapture] = useState(false);

  // create prompt form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyPromptForm });
  const [saving, setSaving] = useState(false);

  // detail panel
  const [detail, setDetail] = useState<PromptDetail | null>(null);
  const [detailRels, setDetailRels] = useState<PromptRelation[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showVersionForm, setShowVersionForm] = useState(false);
  const [vForm, setVForm] = useState({ ...emptyVersionForm });
  const [vSaving, setVSaving] = useState(false);

  const load = useCallback(
    async (opts?: {
      q?: string;
      promptType?: string;
      targetPlatform?: string;
      relFilter?: PromptRelation | null;
    }) => {
      try {
        const params = new URLSearchParams();
        const query = opts?.q ?? q;
        const type = opts?.promptType ?? fType;
        const platform = opts?.targetPlatform ?? fPlatform;
        const rel = opts?.relFilter !== undefined ? opts.relFilter : relFilter;
        if (query) params.set("q", query);
        if (type) params.set("promptType", type);
        if (platform) params.set("targetPlatform", platform);
        if (rel) {
          params.set("entityType", rel.entityType);
          params.set("entityId", rel.entityId);
        }
        const qs = params.toString();
        const res = await api<PromptList>(`/prompts${qs ? `?${qs}` : ""}`);
        setData(res);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
      }
    },
    [q, fType, fPlatform, relFilter],
  );

  // สลับแท็บ + sync URL (?tab=hub) ให้ deep-link/แชร์ได้
  function switchTab(next: "library" | "hub") {
    setTab(next);
    const params = new URLSearchParams(window.location.search);
    if (next === "hub") params.set("tab", "hub");
    else params.delete("tab");
    const qs = params.toString();
    router.replace(`/prompts${qs ? `?${qs}` : ""}`);
  }

  // หลัง snapshot จาก hub — ผู้ใช้กด "ดูในคลังหลัก" → สลับแท็บ + ค้นหาด้วยชื่อ prompt
  function handleOpenInLibrary(promptName: string) {
    setQ(promptName);
    switchTab("library");
    void load({ q: promptName });
  }

  // เปลี่ยน relation filter (คู่เดียว) + sync URL ให้ deep-link/แชร์ได้
  function applyRelFilter(rel: PromptRelation | null) {
    setRelFilter(rel);
    const params = new URLSearchParams(window.location.search);
    if (rel) {
      params.set("entityType", rel.entityType);
      params.set("entityId", rel.entityId);
    } else {
      params.delete("entityType");
      params.delete("entityId");
    }
    const qs = params.toString();
    router.replace(`/prompts${qs ? `?${qs}` : ""}`);
    void load({ relFilter: rel });
  }

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    // deep-link จากหน้า entity (📝 Prompt) — relFilter ถูกอ่านจาก URL ตั้งแต่ useState แล้ว
    // เหลือแค่ resolve ชื่อ entity มาแสดงบน chip (best-effort, async)
    void load();
    if (relFilter && relFilter.name === "…") {
      const { entityType, entityId } = relFilter;
      void resolveRelName(entityType, entityId).then((name) =>
        setRelFilter((cur) => (cur && cur.entityId === entityId ? { ...cur, name } : cur)),
      );
    }
    api<Platform[]>("/platforms")
      .then(setPlatforms)
      .catch(() => setPlatforms([]));
    // entity lists ของ dropdown filter — โหลดเงียบ ๆ พังก็แค่ dropdown ว่าง
    api<CharacterList>("/characters")
      .then((r) => setFCharacters(r.items))
      .catch(() => setFCharacters([]));
    api<Paged<Product>>("/products?pageSize=100")
      .then((r) => setFProducts(r.items))
      .catch(() => setFProducts([]));
    api<Client[]>("/clients?status=active")
      .then(setFClients)
      .catch(() => setFClients([]));
    api<BrandListItem[]>("/brands?status=active")
      .then(setFBrands)
      .catch(() => setFBrands([]));
    // โหลดครั้งแรกเท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  // relations ของ prompt (จาก list) — ใช้เติม linked ให้ picker + chips บนการ์ด
  function relationsOf(promptId: string): PromptRelation[] {
    const row = data?.items.find((p) => p.id === promptId);
    return row?.relations ?? [];
  }

  async function handleRemoveRelation(promptId: string, rel: PromptRelation) {
    setError(null);
    try {
      await removePromptRelation(promptId, rel);
      await load();
      if (detail?.id === promptId) {
        setDetailRels((rels) =>
          rels.filter((r) => !(r.entityType === rel.entityType && r.entityId === rel.entityId)),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เอาการเชื่อมออกไม่สำเร็จ");
    }
  }

  async function handlePickRelation(rel: PromptRelation) {
    if (!pickerFor) return;
    if (pickerFor.mode === "form") {
      setStagedRels((rels) =>
        rels.some((r) => r.entityType === rel.entityType && r.entityId === rel.entityId)
          ? rels
          : [...rels, rel],
      );
      setPickerFor(null);
      return;
    }
    const promptId = pickerFor.promptId;
    setPickerFor(null);
    setError(null);
    try {
      await addPromptRelation(promptId, rel);
      await load();
      if (detail?.id === promptId) {
        setDetailRels(await fetchPromptRelations(promptId));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "เชื่อมไม่สำเร็จ");
    }
  }

  function resolvePlatform(selected: string, freeText: string): string {
    return selected === NEW_PLATFORM ? freeText.trim() : selected;
  }

  function parseParams(raw: string): Record<string, unknown> | undefined {
    if (!raw.trim()) return undefined;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("generation params ต้องเป็น JSON object");
    }
    return parsed as Record<string, unknown>;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const targetPlatform = resolvePlatform(form.targetPlatform, form.newPlatform);
      if (!targetPlatform) throw new Error("กรุณาเลือกหรือระบุ platform");
      let generationParams: Record<string, unknown> | undefined;
      try {
        generationParams = parseParams(form.generationParams);
      } catch {
        throw new Error("Generation params ต้องเป็น JSON ที่ถูกต้อง เช่น {\"cfg\": 7}");
      }
      const created = await api<Prompt>("/prompts", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          promptType: form.promptType,
          body: form.body,
          negativeBody: form.negativeBody || undefined,
          targetPlatform,
          modelName: form.modelName || undefined,
          modelVersion: form.modelVersion || undefined,
          seed: form.seed || undefined,
          generationParams,
        }),
      });
      // relations ที่ stage ไว้ — ยิงหลังสร้างสำเร็จ (ผูกกับ version ล่าสุดฝั่ง API)
      for (const rel of stagedRels) {
        await addPromptRelation(created.id, rel).catch(() => {
          /* เชื่อมพลาดไม่ควรทำให้การสร้างล้ม — แก้เองได้จาก chip บนการ์ด */
        });
      }
      setForm({ ...emptyPromptForm });
      setStagedRels([]);
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function openDetail(id: string) {
    if (detail?.id === id) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    setShowVersionForm(false);
    try {
      const res = await api<PromptDetail>(`/prompts/${id}`);
      setDetail(res);
      fetchPromptRelations(id)
        .then(setDetailRels)
        .catch(() => setDetailRels(relationsOf(id)));
      const latest = res.versions[0];
      setVForm({
        ...emptyVersionForm,
        body: latest?.body ?? "",
        negativeBody: latest?.negativeBody ?? "",
        targetPlatform: latest?.targetPlatform ?? "",
        modelName: latest?.modelName ?? "",
        modelVersion: latest?.modelVersion ?? "",
        seed: latest?.seed ?? "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setDetailLoading(false);
    }
  }

  async function toggleBest(p: { id: string; bestFlag: boolean }) {
    setError(null);
    try {
      await api<Prompt>(`/prompts/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ bestFlag: !p.bestFlag }),
      });
      await load();
      if (detail?.id === p.id) {
        setDetail({ ...detail, bestFlag: !p.bestFlag });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "toggle best flag ไม่สำเร็จ");
    }
  }

  // ✏️ แก้ชื่อ prompt (ทีมขอ: แก้ไข prompt ได้)
  async function renamePrompt() {
    if (!detail) return;
    const name = window.prompt("ชื่อ prompt ใหม่", detail.name)?.trim();
    if (!name || name === detail.name) return;
    setError(null);
    try {
      await api<Prompt>(`/prompts/${detail.id}`, { method: "PATCH", body: JSON.stringify({ name }) });
      setDetail({ ...detail, name });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "แก้ชื่อไม่สำเร็จ");
    }
  }

  // 🗑 ลบออกจากคลัง = archive (soft delete — กู้คืนได้จาก filter Archived, ประวัติไม่หาย)
  async function archivePrompt() {
    if (!detail) return;
    if (!confirm(`ลบ "${detail.name}" ออกจากคลัง?\n(เก็บเป็น Archived — ดูย้อนหลังได้ ไม่หายถาวร)`)) return;
    setError(null);
    try {
      await api(`/prompts/${detail.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "archived" }),
      });
      setDetail(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
    }
  }

  // ✏️ แก้ไขจาก version เดิม — เติมฟอร์มด้วยเนื้อหา version นั้น บันทึก = version ใหม่ (ประวัติอยู่ครบ)
  function editFromVersion(v: PromptVersion) {
    setVForm({
      body: v.body,
      negativeBody: v.negativeBody ?? "",
      targetPlatform: v.targetPlatform,
      newPlatform: "",
      modelName: v.modelName ?? "",
      modelVersion: v.modelVersion ?? "",
      seed: v.seed ?? "",
      performanceNote: "",
    });
    setShowVersionForm(true);
  }

  // ↩️ เปลี่ยน prompt ที่ใช้ — ก๊อป version เก่าขึ้นเป็น version ล่าสุด (ตัวที่ใช้)
  async function useVersion(v: PromptVersion) {
    if (!detail) return;
    if (!confirm(`เปลี่ยนมาใช้ ${v.versionLabel}?\n(ระบบจะก๊อปเนื้อหาขึ้นเป็น version ล่าสุดให้ — ประวัติเดิมอยู่ครบ)`)) return;
    setError(null);
    try {
      await api<PromptVersion>(`/prompts/${detail.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          body: v.body,
          negativeBody: v.negativeBody || undefined,
          targetPlatform: v.targetPlatform,
          modelName: v.modelName || undefined,
          modelVersion: v.modelVersion || undefined,
          seed: v.seed || undefined,
          performanceNote: `ใช้ซ้ำจาก ${v.versionLabel}`,
        }),
      });
      const res = await api<PromptDetail>(`/prompts/${detail.id}`);
      setDetail(res);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยน version ไม่สำเร็จ");
    }
  }

  async function handleCreateVersion(e: React.FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setVSaving(true);
    setError(null);
    try {
      const targetPlatform =
        vForm.targetPlatform === NEW_PLATFORM
          ? vForm.newPlatform.trim()
          : vForm.targetPlatform.trim();
      if (!targetPlatform) throw new Error("กรุณาเลือกหรือระบุ platform");
      await api<PromptVersion>(`/prompts/${detail.id}/versions`, {
        method: "POST",
        body: JSON.stringify({
          body: vForm.body,
          negativeBody: vForm.negativeBody || undefined,
          targetPlatform,
          modelName: vForm.modelName || undefined,
          modelVersion: vForm.modelVersion || undefined,
          seed: vForm.seed || undefined,
          performanceNote: vForm.performanceNote || undefined,
        }),
      });
      const res = await api<PromptDetail>(`/prompts/${detail.id}`);
      setDetail(res);
      setShowVersionForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้าง version ไม่สำเร็จ");
    } finally {
      setVSaving(false);
    }
  }

  function platformSelect(
    value: string,
    freeText: string,
    onChange: (v: { selected?: string; freeText?: string }) => void,
    required = true,
  ) {
    const knownKeys = platforms.map((p) => p.key);
    const isKnown = value === "" || value === NEW_PLATFORM || knownKeys.includes(value);
    return (
      <div className="flex gap-2">
        <select
          required={required}
          value={isKnown ? value : NEW_PLATFORM}
          onChange={(e) => onChange({ selected: e.target.value })}
          className={`${inputCls} flex-1`}
        >
          <option value="">— เลือก platform —</option>
          {platforms.map((p) => (
            <option key={p.id} value={p.key}>
              {p.name} ({p.key})
            </option>
          ))}
          {!isKnown && <option value={NEW_PLATFORM}>{value}</option>}
          <option value={NEW_PLATFORM}>+ platform ใหม่ (พิมพ์เอง)</option>
        </select>
        {(value === NEW_PLATFORM || !isKnown) && (
          <input
            required={required}
            value={freeText}
            onChange={(e) => onChange({ freeText: e.target.value })}
            placeholder="เช่น sora, pika..."
            className={`${inputCls} flex-1`}
          />
        )}
      </div>
    );
  }

  return (
    <AppShell
      title="Prompt Library"
      actions={
        tab === "hub" ? undefined : (
        <div className="flex gap-2">
          <button
            onClick={() => setShowCapture(true)}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            <Zap className="size-4" /> เพิ่มเร็ว (วางจาก Facebook)
          </button>
          <button
            onClick={() =>
              setShowForm((v) => {
                // auto-link v1: เปิดฟอร์มตอน filter relation ค้างอยู่ → stage relation นั้นให้เลย
                // (chip โชว์ในฟอร์ม เอาออกได้ถ้าไม่ต้องการ)
                if (!v) setStagedRels(relFilter ? [relFilter] : []);
                return !v;
              })
            }
            className="rounded-lg border border-zinc-700 px-4 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
          >
            + สร้าง Prompt
          </button>
        </div>
        )
      }
    >
      {showCapture && (
        <QuickCapture
          platforms={platforms}
          // auto-link v1: capture ตอน filter relation ค้างอยู่ → pre-stage relation นั้น (เอาออกได้)
          initialRelations={relFilter ? [relFilter] : []}
          onSaved={() => void load()}
          onClose={() => setShowCapture(false)}
        />
      )}
      {pickerFor && (
        <RelationPicker
          title={pickerFor.mode === "card" ? "เชื่อม Prompt กับ..." : "เชื่อมกับ (ไม่บังคับ)"}
          linked={pickerFor.mode === "card" ? pickerFor.linked : stagedRels}
          onPick={(rel) => void handlePickRelation(rel)}
          onClose={() => setPickerFor(null)}
        />
      )}
      <div className="space-y-6">
        {/* แท็บ: คลังหลัก (Prompt Library เดิม) | ทุกแหล่ง (Prompt Hub — live reference) */}
        <div className="flex gap-2">
          <button
            onClick={() => switchTab("library")}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              tab === "library"
                ? "border-amber-400 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <Star className="size-4" /> คลังหลัก
          </button>
          <button
            onClick={() => switchTab("hub")}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${
              tab === "hub"
                ? "border-amber-400 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <Globe className="size-4" /> ทุกแหล่ง
          </button>
        </div>

        {tab === "hub" && <HubTab onOpenInLibrary={handleOpenInLibrary} />}

        {tab === "library" && (
        <>
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load({ q })}
            placeholder="ค้นหาชื่อ prompt..."
            className={`${inputCls} min-w-52 flex-1 border-zinc-700 bg-zinc-900`}
          />
          <FilterSelect
            value={fType}
            onChange={(v) => {
              setFType(v);
              load({ promptType: v });
            }}
            options={[
              { value: "", label: "ทุกประเภท" },
              ...PROMPT_TYPES.map((t) => ({ value: t, label: PROMPT_TYPE_LABEL[t] })),
            ]}
          />
          <FilterSelect
            value={fPlatform}
            onChange={(v) => {
              setFPlatform(v);
              load({ targetPlatform: v });
            }}
            options={[
              { value: "", label: "ทุก platform" },
              ...platforms.map((p) => ({ value: p.key, label: p.name })),
            ]}
          />
          <button
            onClick={() => load()}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
          >
            ค้นหา
          </button>
          {/* toggle การ์ด | ตาราง */}
          <div className="ml-auto flex overflow-hidden rounded-lg border border-zinc-700 text-sm">
            <button
              onClick={() => setView("grid")}
              title="มุมมองการ์ด"
              className={`px-3 py-2 ${view === "grid" ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              <LayoutGrid className="size-4" /> การ์ด
            </button>
            <button
              onClick={() => setView("table")}
              title="มุมมองตาราง"
              className={`px-3 py-2 ${view === "table" ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-zinc-800"}`}
            >
              <List className="size-4" /> ตาราง
            </button>
          </div>
        </div>

        {/* relation filter — กรองตาม entity ที่เชื่อม (คู่เดียว: เลือกใหม่ = แทนที่ของเดิม) */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-zinc-500"><LinkIcon className="size-4" /> เชื่อมกับ:</span>
          <FilterSelect
            value={relFilter?.entityType === "character" ? relFilter.entityId : ""}
            onChange={(v) => {
              const c = fCharacters.find((x) => x.id === v);
              applyRelFilter(
                c
                  ? { entityType: "character", entityId: c.id, name: c.nameTh, code: c.displayCode }
                  : null,
              );
            }}
            options={[
              { value: "", label: "ตัวละคร: ทั้งหมด" },
              ...fCharacters.map((c) => ({ value: c.id, label: `${c.nameTh} (${c.displayCode})` })),
            ]}
          />
          <FilterSelect
            value={relFilter?.entityType === "product" ? relFilter.entityId : ""}
            onChange={(v) => {
              const p = fProducts.find((x) => x.id === v);
              applyRelFilter(
                p
                  ? { entityType: "product", entityId: p.id, name: p.name, code: p.displayCode }
                  : null,
              );
            }}
            options={[
              { value: "", label: "สินค้า: ทั้งหมด" },
              ...fProducts.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
          <FilterSelect
            value={relFilter?.entityType === "client" ? relFilter.entityId : ""}
            onChange={(v) => {
              const c = fClients.find((x) => x.id === v);
              applyRelFilter(
                c ? { entityType: "client", entityId: c.id, name: c.name } : null,
              );
            }}
            options={[
              { value: "", label: "ลูกค้า: ทั้งหมด" },
              ...fClients.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <FilterSelect
            value={relFilter?.entityType === "brand" ? relFilter.entityId : ""}
            onChange={(v) => {
              const b = fBrands.find((x) => x.id === v);
              applyRelFilter(b ? { entityType: "brand", entityId: b.id, name: b.name } : null);
            }}
            options={[
              { value: "", label: "แบรนด์: ทั้งหมด" },
              ...fBrands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          {relFilter && (
            <span className="flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs text-amber-300">
              {RELATION_TYPE_META[relFilter.entityType].icon} {relFilter.name}
              <button
                type="button"
                onClick={() => applyRelFilter(null)}
                title="ล้าง filter การเชื่อม"
                className="text-amber-300/70 hover:text-amber-200"
              >
                <X className="size-4" />
              </button>
            </span>
          )}
        </div>

        {/* create form */}
        {showForm && (
          <form
            onSubmit={handleCreate}
            className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <p className="text-sm text-zinc-400">
              สร้าง prompt ใหม่ — ระบบจะบันทึกเป็น draft พร้อม version แรก (v1)
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อ prompt เช่น Praewa identity core *"
                className={inputCls}
              />
              <FilterSelect
                value={form.promptType}
                onChange={(v) => setForm({ ...form, promptType: v })}
                options={PROMPT_TYPES.map((t) => ({ value: t, label: PROMPT_TYPE_LABEL[t] }))}
              />
            </div>
            {platformSelect(form.targetPlatform, form.newPlatform, (v) =>
              setForm({
                ...form,
                ...(v.selected !== undefined ? { targetPlatform: v.selected } : {}),
                ...(v.freeText !== undefined ? { newPlatform: v.freeText } : {}),
              }),
            )}
            <textarea
              required
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Prompt body *"
              rows={5}
              className={`${inputCls} w-full font-mono`}
            />
            <textarea
              value={form.negativeBody}
              onChange={(e) => setForm({ ...form, negativeBody: e.target.value })}
              placeholder="Negative prompt (ถ้ามี)"
              rows={2}
              className={`${inputCls} w-full font-mono`}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                value={form.modelName}
                onChange={(e) => setForm({ ...form, modelName: e.target.value })}
                placeholder="Model เช่น grok-image"
                className={inputCls}
              />
              <input
                value={form.modelVersion}
                onChange={(e) => setForm({ ...form, modelVersion: e.target.value })}
                placeholder="Model version"
                className={inputCls}
              />
              <input
                value={form.seed}
                onChange={(e) => setForm({ ...form, seed: e.target.value })}
                placeholder="Seed"
                className={inputCls}
              />
            </div>
            <textarea
              value={form.generationParams}
              onChange={(e) => setForm({ ...form, generationParams: e.target.value })}
              placeholder='Generation params (JSON) เช่น {"cfg": 7, "aspect_ratio": "9:16"}'
              rows={2}
              className={`${inputCls} w-full font-mono`}
            />
            {/* เชื่อมกับ entity (staged) — ยิง POST relations หลังสร้างสำเร็จ */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500"><LinkIcon className="size-4" /> เชื่อมกับ (ไม่บังคับ):</span>
              <RelationChips
                relations={stagedRels}
                onRemove={(rel) =>
                  setStagedRels((rels) =>
                    rels.filter(
                      (r) => !(r.entityType === rel.entityType && r.entityId === rel.entityId),
                    ),
                  )
                }
                onAdd={() => setPickerFor({ mode: "form" })}
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังสร้าง..." : "สร้าง Draft"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* image-first card grid — เห็นรูปตัวอย่างก่อนตัวหนังสือ (CEO directive) */}
        {view === "grid" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {(data?.items as PromptRow[] | undefined)?.map((p) => {
                const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.draft;
                const lv = p.latestVersion;
                const coverOverride = covers[p.id];
                const count =
                  coverOverride === null ? 0 : (p.exampleCount ?? (coverOverride ? 1 : 0));
                return (
                  <div
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDetail(p.id)}
                    className={`group cursor-pointer overflow-hidden rounded-2xl border bg-zinc-900 text-left transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-xl hover:shadow-black/40 ${
                      detail?.id === p.id ? "border-amber-400/50" : "border-zinc-800"
                    }`}
                  >
                    <CoverImage
                      assetId={coverOverride === null ? undefined : coverOverride}
                      entityType="prompt"
                      entityId={p.id}
                      name={p.name}
                      aspect="aspect-[4/3]"
                      className="rounded-none"
                    >
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-zinc-200 backdrop-blur-sm">
                        {PROMPT_TYPE_LABEL[p.promptType] ?? p.promptType}
                      </span>
                      <div
                        className="absolute bottom-2 left-2 z-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CoverPicker
                          entityType="prompt"
                          entityId={p.id}
                          name={p.name}
                          assetType="prompt_example"
                          onChanged={(assetId) =>
                            setCovers((m) => ({ ...m, [p.id]: assetId }))
                          }
                          triggerClass="rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-zinc-100 backdrop-blur-sm hover:bg-black/90"
                        />
                      </div>
                      <span
                        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}
                      >
                        {st.label}
                      </span>
                      {p.bestFlag && (
                        <span className="absolute right-2 top-8 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300 backdrop-blur-sm">
                          <Star className="size-4" /> Best
                        </span>
                      )}
                      {count > 0 && (
                        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] text-zinc-100 backdrop-blur-sm">
                          <ImageIcon className="size-4" /> {count}
                        </span>
                      )}
                    </CoverImage>
                    <div className="space-y-1 px-3 py-2.5">
                      <p className="truncate text-sm font-semibold text-zinc-100">{p.name}</p>
                      <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-zinc-500">
                        {lv ? (
                          <span className="text-amber-300">{lv.targetPlatform}</span>
                        ) : (
                          <span>—</span>
                        )}
                        {lv?.modelName && <span className="truncate">{lv.modelName}</span>}
                        <span className="ml-auto font-mono">{lv?.versionLabel ?? ""}</span>
                      </p>
                      {/* 🔗 เชื่อมกับ: ตัวละคร/สินค้า/ลูกค้า/แบรนด์ — × ถอดได้, + เชื่อมเพิ่ม */}
                      <RelationChips
                        relations={p.relations ?? []}
                        onRemove={(rel) => void handleRemoveRelation(p.id, rel)}
                        onAdd={() =>
                          setPickerFor({
                            mode: "card",
                            promptId: p.id,
                            linked: p.relations ?? [],
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {data && data.items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
                <p className="text-3xl"><ImageIcon className="size-4" /></p>
                <p className="mt-2 text-sm">
                  ยังไม่มี prompt — สร้างตัวแรกด้วยปุ่ม &ldquo;+ สร้าง Prompt&rdquo;
                </p>
              </div>
            )}
          </>
        )}

        {/* prompt table */}
        {view === "table" && (
        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="w-10 px-4 py-3 font-medium"><Star className="size-4" /></th>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">ประเภท</th>
                <th className="px-4 py-3 font-medium">Platform</th>
                <th className="px-4 py-3 font-medium">Model</th>
                <th className="px-4 py-3 font-medium">เชื่อมกับ</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">อัปเดต</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data?.items.map((p) => {
                const st = STATUS_LABEL[p.status] ?? STATUS_LABEL.draft;
                const lv = p.latestVersion;
                return (
                  <tr
                    key={p.id}
                    onClick={() => openDetail(p.id)}
                    className={`cursor-pointer hover:bg-zinc-900/50 ${detail?.id === p.id ? "bg-zinc-900/70" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBest(p);
                        }}
                        title={p.bestFlag ? "เอาออกจาก best" : "ทำเครื่องหมาย best (ต้องมีสิทธิ์ Approve)"}
                        className={`text-lg leading-none ${p.bestFlag ? "text-amber-400" : "text-zinc-700 hover:text-zinc-500"}`}
                      >
                        <Star className="size-4" />
                      </button>
                    </td>
                    <td className="px-4 py-3 font-medium">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-400">
                      {PROMPT_TYPE_LABEL[p.promptType] ?? p.promptType}
                    </td>
                    <td className="px-4 py-3">
                      {lv ? (
                        <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-amber-300">
                          {lv.targetPlatform}
                        </span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {lv?.modelName ? `${lv.modelName}${lv.modelVersion ? ` ${lv.modelVersion}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {(p.relations?.length ?? 0) > 0 ? (
                        <RelationChips relations={p.relations ?? []} />
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                      {lv?.versionLabel ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(p.updatedAt).toLocaleDateString("th-TH")}
                    </td>
                  </tr>
                );
              })}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-zinc-500">
                    ยังไม่มี prompt — สร้างตัวแรกด้วยปุ่ม &ldquo;+ สร้าง Prompt&rdquo;
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        )}
        {data && (
          <p className="text-xs text-zinc-500">
            ทั้งหมด {data.total} รายการ · หน้า {data.page}
          </p>
        )}

        {/* detail panel */}
        {detailLoading && <p className="text-sm text-zinc-500">กำลังโหลดรายละเอียด...</p>}
        {detail && !detailLoading && (
          <section className="space-y-4 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-semibold">
                {detail.bestFlag && <span className="mr-1 text-amber-400"><Star className="size-4" /></span>}
                {detail.name}
              </h2>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                {PROMPT_TYPE_LABEL[detail.promptType] ?? detail.promptType}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${(STATUS_LABEL[detail.status] ?? STATUS_LABEL.draft).cls}`}
              >
                {(STATUS_LABEL[detail.status] ?? STATUS_LABEL.draft).label}
              </span>
              <button
                onClick={() => void renamePrompt()}
                title="แก้ชื่อ prompt"
                className="text-sm text-zinc-500 hover:text-amber-300"
              >
                <Pencil className="size-4" />
              </button>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={() => void archivePrompt()}
                  title="ลบออกจากคลัง (เก็บเป็น Archived — กู้ดูย้อนหลังได้)"
                  className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 className="size-4" /> ลบ
                </button>
                <button
                  onClick={() => toggleBest(detail)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    detail.bestFlag
                      ? "border-amber-400/50 text-amber-300 hover:bg-amber-400/10"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {detail.bestFlag ? "Best — เอาออก" : "ทำเครื่องหมาย Best"}
                </button>
                <button
                  onClick={() => setShowVersionForm((v) => !v)}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
                >
                  + สร้าง version ใหม่
                </button>
                <button
                  onClick={() => setDetail(null)}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  ปิด
                </button>
              </div>
            </div>

            {/* 🔗 เชื่อมกับ (ตัวละคร/สินค้า/ลูกค้า/แบรนด์) — จัดการจาก detail ได้เหมือนบนการ์ด */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500"><LinkIcon className="size-4" /> เชื่อมกับ:</span>
              <RelationChips
                relations={detailRels}
                onRemove={(rel) => void handleRemoveRelation(detail.id, rel)}
                onAdd={() =>
                  setPickerFor({ mode: "card", promptId: detail.id, linked: detailRels })
                }
              />
            </div>

            {showVersionForm && (
              <form
                onSubmit={handleCreateVersion}
                className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4"
              >
                <p className="text-xs text-zinc-400">
                  version ใหม่จะได้ label ต่อจากเดิมอัตโนมัติ (v{detail.versions.length + 1})
                </p>
                {platformSelect(vForm.targetPlatform, vForm.newPlatform, (v) =>
                  setVForm({
                    ...vForm,
                    ...(v.selected !== undefined ? { targetPlatform: v.selected } : {}),
                    ...(v.freeText !== undefined ? { newPlatform: v.freeText } : {}),
                  }),
                )}
                <textarea
                  required
                  value={vForm.body}
                  onChange={(e) => setVForm({ ...vForm, body: e.target.value })}
                  placeholder="Prompt body *"
                  rows={5}
                  className={`${inputCls} w-full font-mono`}
                />
                <textarea
                  value={vForm.negativeBody}
                  onChange={(e) => setVForm({ ...vForm, negativeBody: e.target.value })}
                  placeholder="Negative prompt (ถ้ามี)"
                  rows={2}
                  className={`${inputCls} w-full font-mono`}
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    value={vForm.modelName}
                    onChange={(e) => setVForm({ ...vForm, modelName: e.target.value })}
                    placeholder="Model"
                    className={inputCls}
                  />
                  <input
                    value={vForm.modelVersion}
                    onChange={(e) => setVForm({ ...vForm, modelVersion: e.target.value })}
                    placeholder="Model version"
                    className={inputCls}
                  />
                  <input
                    value={vForm.seed}
                    onChange={(e) => setVForm({ ...vForm, seed: e.target.value })}
                    placeholder="Seed"
                    className={inputCls}
                  />
                </div>
                <input
                  value={vForm.performanceNote}
                  onChange={(e) => setVForm({ ...vForm, performanceNote: e.target.value })}
                  placeholder="Performance note เช่น หน้าตรง identity ดี แต่มือเพี้ยน"
                  className={`${inputCls} w-full`}
                />
                <button
                  type="submit"
                  disabled={vSaving}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                >
                  {vSaving ? "กำลังบันทึก..." : "บันทึก version"}
                </button>
              </form>
            )}

            <PromptExamples
              promptId={detail.id}
              name={detail.name}
              onCoverChanged={(assetId) => setCovers((m) => ({ ...m, [detail.id]: assetId }))}
              onChanged={() => void load()}
              onError={setError}
            />

            <div className="space-y-3">
              {detail.versions.map((v, i) => (
                <VersionBlock
                  key={v.id}
                  v={v}
                  promptName={detail.name}
                  isCurrent={i === 0}
                  onEdit={() => editFromVersion(v)}
                  onUse={() => void useVersion(v)}
                />
              ))}
            </div>
          </section>
        )}
        </>
        )}
      </div>
    </AppShell>
  );
}

// useSearchParams ต้องอยู่ใต้ Suspense (Next.js CSR bailout) — pattern เดียวกับหน้า products
export default function PromptsPage() {
  return (
    <Suspense fallback={null}>
      <PromptsInner />
    </Suspense>
  );
}
