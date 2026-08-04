"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  api,
  getToken,
  fetchCharacterBlueprints,
  type Character,
  type CharacterList,
  type CharacterBlueprint,
} from "@/lib/api";
import ReverseCapture from "./ReverseCapture";
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clapperboard,
  Dna,
  Drama,
  FileText,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  List,
  Pencil,
  RefreshCw,
  Sparkles,
  TriangleAlert,
  Undo2,
  Wallet,
} from "lucide-react";

// list response อาจแนบ field เสริม (มาจาก API build ใหม่ — build เก่าไม่มี ก็ fallback ได้)
type CharacterRow = Character & {
  thumbAssetId?: string | null;
  age?: number | null;
  region?: string | null;
};

interface AiStatus {
  configured: boolean;
  model: string;
}

interface AiDraftResponse {
  draft: {
    persona?: Record<string, unknown>;
    visualDna?: Record<string, unknown>;
    commerceProfile?: Record<string, unknown>;
    voiceProfile?: Record<string, unknown>;
    suggested: { age?: number; gender?: string; region?: string; roleLabel?: string };
  };
  provenance: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  blueprintId?: string | null;
  missingRequired?: string[];
}

// GET /characters/stats — summary bar + facet dropdowns (API build เก่าไม่มี → ซ่อน)
interface CharacterStats {
  total: number;
  byStatus: Record<string, number>;
  ready: number;
  missingImage: number;
  archived?: number;
  facets: {
    universes: string[];
    regions: string[];
    genders: string[];
    seriesNames: string[];
  };
}

interface TagOption {
  id: string;
  name: string;
  useCount: number;
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

const SORT_OPTIONS = [
  { value: "updatedAt", label: "อัปเดตล่าสุด" },
  { value: "createdAt", label: "สร้างล่าสุด" },
  { value: "nameTh", label: "ชื่อ ก→ฮ" },
  { value: "gmv", label: "GMV สูงสุด" },
  { value: "views", label: "วิวสูงสุด" },
  { value: "usage", label: "ใช้บ่อยสุด" },
];

const LEVEL_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High" };

// key ทั้งหมดที่นับเป็น "filter" (ไม่รวม sortBy/page ที่เป็น view state)
const FILTER_KEYS = [
  "q",
  "status",
  "universe",
  "seriesName",
  "gender",
  "region",
  "ageMin",
  "ageMax",
  "hasImage",
  "bibleComplete",
  "hasVoice",
  "productCategory",
  "claimRisk",
  "brandSafety",
  "availability",
  "tagIds",
  // relationship-based filters
  "categoryIds",
  "reviewedProductId",
  "seriesId",
  "brandId",
  "clientId",
  "campaignId",
  "tieInProductId",
  "audienceSegmentId",
  "hasLived",
  "sortByGmv",
  "archived",
] as const;

// key ที่อยู่ในแผงตัวกรองเพิ่มเติม (ใช้เปิดแผงอัตโนมัติ + โชว์ตัวเลขบนปุ่ม)
const PANEL_KEYS = [
  "gender",
  "region",
  "ageMin",
  "ageMax",
  "seriesName",
  "hasImage",
  "bibleComplete",
  "hasVoice",
  "productCategory",
  "claimRisk",
  "brandSafety",
  "availability",
  "tagIds",
  "categoryIds",
  "reviewedProductId",
  "seriesId",
  "brandId",
  "clientId",
  "campaignId",
  "tieInProductId",
  "audienceSegmentId",
  "hasLived",
  "sortByGmv",
] as const;

// entity picker: source endpoint → {id,label} options (graceful fallback ถ้าไม่มีสิทธิ์/build เก่า)
interface EntityOption {
  id: string;
  label: string;
}

// single-select ตัวกรองแบบ entity — ซ่อนถ้าไม่มี option (ไม่มีสิทธิ์/ไม่มีข้อมูล)
function EntitySelect({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string;
  value: string;
  options: EntityOption[];
  onChange: (v: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: placeholder },
        ...options.map((o) => ({ value: o.id, label: o.label })),
      ]}
      className="max-w-[13rem]"
    />
  );
}

function CharactersInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<CharacterList | null>(null);
  const [stats, setStats] = useState<CharacterStats | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  // relationship-based filter options — โหลดครั้งเดียว, ล้มเหลว/ไม่มีสิทธิ์ = ซ่อนตัวกรองนั้น
  const [categoryOptions, setCategoryOptions] = useState<EntityOption[]>([]);
  const [productOptions, setProductOptions] = useState<EntityOption[]>([]);
  const [seriesOptions, setSeriesOptions] = useState<EntityOption[]>([]);
  const [brandOptions, setBrandOptions] = useState<EntityOption[]>([]);
  const [clientOptions, setClientOptions] = useState<EntityOption[]>([]);
  const [campaignOptions, setCampaignOptions] = useState<EntityOption[]>([]);
  const [segmentOptions, setSegmentOptions] = useState<EntityOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  // โหมดสร้าง: forward = กรอกในระบบ (เดิม) | reverse = สร้างจากภายนอก (gen ที่อื่นแล้ววางกลับ)
  const [createMode, setCreateMode] = useState<"forward" | "reverse">("forward");
  const [form, setForm] = useState({ nameTh: "", nameEn: "", nickname: "", oneLineConcept: "", universe: "" });
  const [saving, setSaving] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  // Blueprint (พิมพ์เขียว) selector — โชว์ทั้งสองโหมด, default = isDefault blueprint
  const [blueprints, setBlueprints] = useState<CharacterBlueprint[]>([]);
  const [blueprintId, setBlueprintId] = useState<string>("");
  // required fields ที่ยังว่างหลัง AI ร่าง (forward wizard) — amber warning ก่อนสร้าง
  const [wizardMissing, setWizardMissing] = useState<string[] | null>(null);
  const [pendingDraft, setPendingDraft] = useState<AiDraftResponse | null>(null);
  // image-first: grid เป็นค่า default — สลับเป็น table ได้เมื่ออยากไล่ดูข้อมูลแบบเรียงคอลัมน์
  const [view, setView] = useState<"grid" | "table">("grid");
  // แผงตัวกรองเพิ่มเติม — เปิดอัตโนมัติถ้า URL มี filter ในแผงอยู่แล้ว (share/refresh-safe)
  const [panelOpen, setPanelOpen] = useState(false);

  // debounced text inputs → sync ลง URL
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const [catInput, setCatInput] = useState(searchParams.get("productCategory") ?? "");
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      if (!("page" in patch)) params.delete("page"); // เปลี่ยน filter → กลับหน้า 1
      router.replace(`/characters${params.toString() ? `?${params}` : ""}`);
    },
    [router, searchParams],
  );

  const setParamDebounced = useCallback(
    (key: string, value: string, ms = 400) => {
      if (debounceTimers.current[key]) clearTimeout(debounceTimers.current[key]);
      debounceTimers.current[key] = setTimeout(() => setParam({ [key]: value }), ms);
    },
    [setParam],
  );

  // hydrate text inputs จาก URL ตอน mount เท่านั้น
  useEffect(() => {
    setQInput(searchParams.get("q") ?? "");
    setCatInput(searchParams.get("productCategory") ?? "");
    if (PANEL_KEYS.some((k) => searchParams.get(k))) setPanelOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStats = useCallback(() => {
    // API build เก่ายังไม่มี endpoint นี้ — เงียบ ๆ ซ่อน summary bar ไป
    api<CharacterStats>("/characters/stats").then(setStats).catch(() => setStats(null));
  }, []);

  const loadTags = useCallback(() => {
    api<TagOption[]>("/tags?entityType=character")
      .then((t) => setTagOptions(Array.isArray(t) ? t : []))
      .catch(() => setTagOptions([]));
  }, []);

  // โหลด option list ของ entity picker ทั้งหมด — endpoint ต่างสิทธิ์กัน จึง catch แยกแต่ละอัน
  const loadFilterOptions = useCallback(() => {
    type Arr<T> = T[] | { items: T[] };
    const toArr = <T,>(r: Arr<T>): T[] => (Array.isArray(r) ? r : (r?.items ?? []));
    const grab = <T,>(
      path: string,
      map: (t: T) => EntityOption,
      set: (o: EntityOption[]) => void,
    ) =>
      api<Arr<T>>(path)
        .then((r) => set(toArr<T>(r).map(map)))
        .catch(() => set([]));

    void grab<{ id: string; label: string }>(
      "/character-categories?status=active",
      (c) => ({ id: c.id, label: c.label }),
      setCategoryOptions,
    );
    void grab<{ id: string; name: string; displayCode?: string }>(
      "/products?pageSize=50",
      (p) => ({ id: p.id, label: p.name }),
      setProductOptions,
    );
    void grab<{ id: string; name: string }>(
      "/series",
      (s) => ({ id: s.id, label: s.name }),
      setSeriesOptions,
    );
    void grab<{ id: string; name: string }>(
      "/brands",
      (b) => ({ id: b.id, label: b.name }),
      setBrandOptions,
    );
    void grab<{ id: string; name: string }>(
      "/clients",
      (c) => ({ id: c.id, label: c.name }),
      setClientOptions,
    );
    void grab<{ id: string; name: string }>(
      "/campaigns",
      (c) => ({ id: c.id, label: c.name }),
      setCampaignOptions,
    );
    void grab<{ id: string; name: string }>(
      "/audience-segments?status=active",
      (s) => ({ id: s.id, label: s.name }),
      setSegmentOptions,
    );
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    loadStats();
    loadTags();
    loadFilterOptions();
    api<AiStatus>("/ai/status").then(setAiStatus).catch(() => setAiStatus(null));
    // active blueprints สำหรับ selector — default = isDefault ตัวแรก (API build เก่า → เงียบ)
    fetchCharacterBlueprints({ status: "active" })
      .then((list) => {
        setBlueprints(list);
        const def = list.find((b) => b.isDefault) ?? list[0];
        if (def) setBlueprintId((cur) => cur || def.id);
      })
      .catch(() => setBlueprints([]));
  }, [router, loadStats, loadTags, loadFilterOptions]);

  // โหลด list ตาม URL — ทุก filter/sort/page share ได้ refresh ได้
  useEffect(() => {
    if (!getToken()) return;
    const query = searchParams.toString();
    api<CharacterList>(`/characters${query ? `?${query}` : ""}`)
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams]);

  async function reload() {
    const query = searchParams.toString();
    try {
      setData(await api<CharacterList>(`/characters${query ? `?${query}` : ""}`));
      loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );
  const panelActive = useMemo(
    () => PANEL_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );

  const sortBy = searchParams.get("sortBy") ?? "updatedAt";
  const isMetricSort = sortBy === "gmv" || sortBy === "views";
  const archivedView = searchParams.get("archived") === "1";
  const selectedTagIds = useMemo(
    () => (searchParams.get("tagIds") ?? "").split(",").filter(Boolean),
    [searchParams],
  );
  const selectedCategoryIds = useMemo(
    () => (searchParams.get("categoryIds") ?? "").split(",").filter(Boolean),
    [searchParams],
  );

  function clearFilters() {
    setQInput("");
    setCatInput("");
    router.replace("/characters");
  }

  // summary chip → เซ็ต filter ชุดใหม่ทั้งก้อน (ล้างของเดิมก่อน คง sort ไว้)
  function applyChip(patch: Record<string, string>) {
    setQInput("");
    setCatInput("");
    const params = new URLSearchParams();
    const sort = searchParams.get("sortBy");
    if (sort) params.set("sortBy", sort);
    for (const [k, v] of Object.entries(patch)) if (v) params.set(k, v);
    router.replace(`/characters${params.toString() ? `?${params}` : ""}`);
  }

  function chipActive(patch: Record<string, string>) {
    return (
      FILTER_KEYS.every((k) => (searchParams.get(k) ?? "") === (patch[k] ?? "")) &&
      Object.entries(patch).every(([k, v]) => (searchParams.get(k) ?? "") === v)
    );
  }

  function toggleTag(tagId: string) {
    const next = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((t) => t !== tagId)
      : [...selectedTagIds, tagId];
    setParam({ tagIds: next.join(",") });
  }

  function toggleCategory(catId: string) {
    const next = selectedCategoryIds.includes(catId)
      ? selectedCategoryIds.filter((c) => c !== catId)
      : [...selectedCategoryIds, catId];
    setParam({ categoryIds: next.join(",") });
  }

  // สร้างตัวละครจาก draft ที่ AI ร่าง — persist พร้อม blueprintId แล้วไปหน้า detail
  async function finalizeAiCreate(res: AiDraftResponse) {
    const created = await api<Character>("/characters", {
      method: "POST",
      body: JSON.stringify({
        nameTh: form.nameTh,
        nameEn: form.nameEn || undefined,
        nickname: form.nickname || undefined,
        oneLineConcept: form.oneLineConcept,
        universe: form.universe || undefined,
        blueprintId: blueprintId || undefined,
        age: res.draft.suggested.age,
        gender: res.draft.suggested.gender,
        region: res.draft.suggested.region,
        roleLabel: res.draft.suggested.roleLabel,
        persona: res.draft.persona,
        visualDna: res.draft.visualDna,
        commerceProfile: res.draft.commerceProfile,
      }),
    });
    setForm({ nameTh: "", nameEn: "", nickname: "", oneLineConcept: "", universe: "" });
    setShowForm(false);
    setWizardMissing(null);
    setPendingDraft(null);
    router.push(`/characters/${created.id}`);
  }

  async function handleAiCreate() {
    if (!form.nameTh || !form.oneLineConcept) {
      setError("AI wizard ต้องการอย่างน้อย ชื่อไทย + คอนเซ็ปต์หนึ่งบรรทัด");
      return;
    }
    setAiBusy(true);
    setError(null);
    setWizardMissing(null);
    setPendingDraft(null);
    try {
      const res = await api<AiDraftResponse>("/ai/characters/draft", {
        method: "POST",
        body: JSON.stringify({
          nameTh: form.nameTh,
          nameEn: form.nameEn || undefined,
        nickname: form.nickname || undefined,
          oneLineConcept: form.oneLineConcept,
          universe: form.universe || undefined,
          blueprintId: blueprintId || undefined,
        }),
      });
      // ถ้ามี required fields ที่ AI ร่างมาไม่ครบ (ตาม blueprint) → โชว์ amber note ให้ยืนยันก่อนสร้าง
      if (res.missingRequired && res.missingRequired.length > 0) {
        setPendingDraft(res);
        setWizardMissing(res.missingRequired);
        return;
      }
      await finalizeAiCreate(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI wizard ล้มเหลว");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api<Character>("/characters", {
        method: "POST",
        body: JSON.stringify({
          nameTh: form.nameTh,
          nameEn: form.nameEn || undefined,
        nickname: form.nickname || undefined,
          oneLineConcept: form.oneLineConcept || undefined,
          universe: form.universe || undefined,
          blueprintId: blueprintId || undefined,
        }),
      });
      setForm({ nameTh: "", nameEn: "", nickname: "", oneLineConcept: "", universe: "" });
      setShowForm(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  // กู้คืนจาก archive → กลับเป็น draft
  const [restoringId, setRestoringId] = useState<string | null>(null);
  async function handleRestore(id: string) {
    setRestoringId(id);
    setError(null);
    try {
      await api(`/characters/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "draft" }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "กู้คืนไม่สำเร็จ");
    } finally {
      setRestoringId(null);
    }
  }

  function fmtMetric(c: Character): string {
    const v = c.metric ?? 0;
    return sortBy === "gmv" ? `฿${v.toLocaleString()}` : `${v.toLocaleString()}`;
  }

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";
  const chipBase = "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm transition-colors";

  return (
    <AppShell
      title="Characters"
      actions={
        archivedView ? undefined : (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            + สร้าง Character
          </button>
        )
      }
    >
      <div className="space-y-4">
        {/* summary bar — คลิกเพื่อ filter ทันที (จาก /characters/stats) */}
        {stats && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyChip({})}
              className={`${chipBase} ${
                chipActive({})
                  ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50"
                  : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
              }`}
            >
              ทั้งหมด {stats.total}
            </button>
            <button
              onClick={() => applyChip({ status: "approved", hasImage: "1" })}
              className={`${chipBase} ${
                chipActive({ status: "approved", hasImage: "1" })
                  ? "bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/50"
                  : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
              }`}
            >
              <CircleCheck className="size-4" /> พร้อมใช้ {stats.ready}
            </button>
            <button
              onClick={() => applyChip({ hasImage: "0" })}
              className={`${chipBase} ${
                chipActive({ hasImage: "0" })
                  ? "bg-blue-400/15 text-blue-300 ring-1 ring-blue-400/50"
                  : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
              }`}
            >
              <ImageIcon className="size-4" /> รอรูป {stats.missingImage}
            </button>
            <button
              onClick={() => applyChip({ status: "draft" })}
              className={`${chipBase} ${
                chipActive({ status: "draft" })
                  ? "bg-zinc-400/15 text-zinc-200 ring-1 ring-zinc-400/50"
                  : "bg-zinc-900 text-zinc-300 ring-1 ring-zinc-800 hover:bg-zinc-800"
              }`}
            >
              <FileText className="size-4" /> Draft {stats.byStatus.draft ?? 0}
            </button>
            {(stats.archived ?? 0) > 0 && (
              <button
                onClick={() => applyChip(archivedView ? {} : { archived: "1" })}
                className={`${chipBase} ${
                  archivedView
                    ? "bg-orange-400/15 text-orange-300 ring-1 ring-orange-400/50"
                    : "bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:bg-zinc-800"
                }`}
              >
                <Archive className="size-4" /> ดูตัวที่เก็บแล้ว ({stats.archived})
              </button>
            )}
          </div>
        )}

        {/* banner โหมดดู archive */}
        {archivedView && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-orange-800/60 bg-orange-950/30 px-4 py-3 text-sm text-orange-200">
            <span>
              <Archive className="inline size-4 align-text-bottom" /> กำลังดูตัวละครที่เก็บแล้ว — กด &ldquo;
              <Undo2 className="inline size-4 align-text-bottom" /> กู้คืน&rdquo; เพื่อดึงกลับมาเป็น Draft
            </span>
            <button
              onClick={() => applyChip({})}
              className="rounded-lg border border-orange-700 px-3 py-1 text-xs text-orange-200 hover:bg-orange-900/40"
            >
              กลับไปดูตัวปกติ
            </button>
          </div>
        )}

        {/* filter bar แถวแรก — ค้นหา / status / universe / sort / เปิดแผงตัวกรอง */}
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={qInput}
              onChange={(e) => {
                setQInput(e.target.value);
                setParamDebounced("q", e.target.value);
              }}
              onKeyDown={(e) => e.key === "Enter" && setParam({ q: qInput })}
              placeholder="ค้นหาชื่อหรือรหัส character..."
              className={`${inputCls} w-60`}
            />
            <FilterSelect
              value={searchParams.get("status") ?? ""}
              onChange={(v) => setParam({ status: v })}
              options={[
                { value: "", label: "Status: ทั้งหมด" },
                ...Object.entries(STATUS_LABEL).map(([v, m]) => ({ value: v, label: m.label })),
              ]}
              className="w-fit"
            />
            <FilterSelect
              value={searchParams.get("universe") ?? ""}
              onChange={(v) => setParam({ universe: v })}
              options={[
                { value: "", label: "Universe: ทั้งหมด" },
                ...(stats?.facets.universes ?? []).map((u) => ({ value: u, label: u })),
              ]}
              className="w-fit"
            />
            <FilterSelect
              value={sortBy}
              onChange={(v) => setParam({ sortBy: v === "updatedAt" ? "" : v })}
              options={SORT_OPTIONS.map((s) => ({ value: s.value, label: `เรียง: ${s.label}` }))}
              className="w-fit"
            />
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm ${
                panelOpen || panelActive > 0
                  ? "border-amber-400/50 text-amber-300"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              ตัวกรอง {panelActive > 0 ? `(${panelActive}) ` : ""}
              {panelOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
            {activeFilters > 0 && (
              <button
                onClick={clearFilters}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                ล้าง filter ({activeFilters})
              </button>
            )}
            {/* toggle grid | table */}
            <div className="ml-auto flex overflow-hidden rounded-lg border border-zinc-700 text-sm">
              <button
                onClick={() => setView("grid")}
                title="มุมมองการ์ด"
                className={`inline-flex items-center gap-1 px-3 py-2 ${view === "grid" ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-zinc-800"}`}
              >
                <LayoutGrid className="size-4" /> การ์ด
              </button>
              <button
                onClick={() => setView("table")}
                title="มุมมองตาราง"
                className={`inline-flex items-center gap-1 px-3 py-2 ${view === "table" ? "bg-amber-400/10 text-amber-300" : "text-zinc-400 hover:bg-zinc-800"}`}
              >
                <List className="size-4" /> ตาราง
              </button>
            </div>
          </div>

          {/* แผงตัวกรองเพิ่มเติม */}
          {panelOpen && (
            <div className="space-y-3 border-t border-zinc-800 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  value={searchParams.get("gender") ?? ""}
                  onChange={(v) => setParam({ gender: v })}
                  options={[
                    { value: "", label: "เพศ: ทั้งหมด" },
                    ...(stats?.facets.genders ?? []).map((g) => ({ value: g, label: g })),
                  ]}
                  className="w-fit"
                />
                <FilterSelect
                  value={searchParams.get("region") ?? ""}
                  onChange={(v) => setParam({ region: v })}
                  options={[
                    { value: "", label: "ภูมิภาค: ทั้งหมด" },
                    ...(stats?.facets.regions ?? []).map((r) => ({ value: r, label: r })),
                  ]}
                  className="w-fit"
                />
                <FilterSelect
                  value={searchParams.get("seriesName") ?? ""}
                  onChange={(v) => setParam({ seriesName: v })}
                  options={[
                    { value: "", label: "Series: ทั้งหมด" },
                    ...(stats?.facets.seriesNames ?? []).map((s) => ({ value: s, label: s })),
                  ]}
                  className="w-fit"
                />
                <span className="flex items-center gap-1 text-sm text-zinc-500">
                  อายุ
                  <input
                    type="number"
                    min={0}
                    defaultValue={searchParams.get("ageMin") ?? ""}
                    onChange={(e) => setParamDebounced("ageMin", e.target.value)}
                    placeholder="ต่ำสุด"
                    className={`${inputCls} w-20 px-2`}
                  />
                  –
                  <input
                    type="number"
                    min={0}
                    defaultValue={searchParams.get("ageMax") ?? ""}
                    onChange={(e) => setParamDebounced("ageMax", e.target.value)}
                    placeholder="สูงสุด"
                    className={`${inputCls} w-20 px-2`}
                  />
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  value={searchParams.get("hasImage") ?? ""}
                  onChange={(v) => setParam({ hasImage: v })}
                  options={[
                    { value: "", label: "รูป: ทั้งหมด" },
                    { value: "1", label: "มีรูป" },
                    { value: "0", label: "ไม่มีรูป" },
                  ]}
                  className="w-fit"
                />
                <FilterSelect
                  value={searchParams.get("bibleComplete") ?? ""}
                  onChange={(v) => setParam({ bibleComplete: v })}
                  options={[
                    { value: "", label: "Bible: ทั้งหมด" },
                    { value: "1", label: "Bible ครบ" },
                    { value: "0", label: "Bible ไม่ครบ" },
                  ]}
                  className="w-fit"
                />
                <FilterSelect
                  value={searchParams.get("hasVoice") ?? ""}
                  onChange={(v) => setParam({ hasVoice: v })}
                  options={[
                    { value: "", label: "เสียง: ทั้งหมด" },
                    { value: "1", label: "มีเสียง" },
                    { value: "0", label: "ไม่มีเสียง" },
                  ]}
                  className="w-fit"
                />
                <input
                  value={catInput}
                  onChange={(e) => {
                    setCatInput(e.target.value);
                    setParamDebounced("productCategory", e.target.value);
                  }}
                  placeholder="หมวดสินค้า เช่น ความงาม, ขนม"
                  className={`${inputCls} w-52`}
                />
                <FilterSelect
                  value={searchParams.get("claimRisk") ?? ""}
                  onChange={(v) => setParam({ claimRisk: v })}
                  options={[
                    { value: "", label: "Claim risk: ทั้งหมด" },
                    ...Object.entries(LEVEL_LABEL).map(([v, l]) => ({ value: v, label: l })),
                  ]}
                  className="w-fit"
                />
                <FilterSelect
                  value={searchParams.get("brandSafety") ?? ""}
                  onChange={(v) => setParam({ brandSafety: v })}
                  options={[
                    { value: "", label: "Brand safety: ทั้งหมด" },
                    ...Object.entries(LEVEL_LABEL).map(([v, l]) => ({ value: v, label: l })),
                  ]}
                  className="w-fit"
                />
                <FilterSelect
                  value={searchParams.get("availability") ?? ""}
                  onChange={(v) => setParam({ availability: v })}
                  options={[
                    { value: "", label: "สถานะงาน: ทั้งหมด" },
                    { value: "free", label: "ว่าง" },
                    { value: "busy", label: "กำลังใช้งาน" },
                    { value: "unused", label: "ไม่เคยถูกใช้" },
                  ]}
                  className="w-fit"
                />
              </div>

              {tagOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-sm text-zinc-500">Tags:</span>
                  {tagOptions.map((t) => {
                    const on = selectedTagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTag(t.id)}
                        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                          on
                            ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        #{t.name}
                        {t.useCount > 0 && <span className="ml-1 opacity-60">{t.useCount}</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ประเภทตัวละคร — multi-select chips (ANY: มีอย่างน้อยหนึ่ง) */}
              {categoryOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
                    <Drama className="size-4" /> ประเภท:
                  </span>
                  {categoryOptions.map((c) => {
                    const on = selectedCategoryIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => toggleCategory(c.id)}
                        className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                          on
                            ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/50"
                            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* ความสัมพันธ์ — entity pickers (ซ่อนอันที่ไม่มีสิทธิ์/ไม่มีข้อมูล) */}
              <div className="flex flex-wrap items-center gap-2">
                <EntitySelect
                  placeholder="รีวิวสินค้า: ทั้งหมด"
                  value={searchParams.get("reviewedProductId") ?? ""}
                  options={productOptions}
                  onChange={(v) => setParam({ reviewedProductId: v })}
                />
                <EntitySelect
                  placeholder="สินค้า Tie-in: ทั้งหมด"
                  value={searchParams.get("tieInProductId") ?? ""}
                  options={productOptions}
                  onChange={(v) => setParam({ tieInProductId: v })}
                />
                <EntitySelect
                  placeholder="Series: ทั้งหมด"
                  value={searchParams.get("seriesId") ?? ""}
                  options={seriesOptions}
                  onChange={(v) => setParam({ seriesId: v })}
                />
                <EntitySelect
                  placeholder="แบรนด์: ทั้งหมด"
                  value={searchParams.get("brandId") ?? ""}
                  options={brandOptions}
                  onChange={(v) => setParam({ brandId: v })}
                />
                <EntitySelect
                  placeholder="ลูกค้า: ทั้งหมด"
                  value={searchParams.get("clientId") ?? ""}
                  options={clientOptions}
                  onChange={(v) => setParam({ clientId: v })}
                />
                <EntitySelect
                  placeholder="แคมเปญ: ทั้งหมด"
                  value={searchParams.get("campaignId") ?? ""}
                  options={campaignOptions}
                  onChange={(v) => setParam({ campaignId: v })}
                />
                <EntitySelect
                  placeholder="กลุ่มผู้ชม: ทั้งหมด"
                  value={searchParams.get("audienceSegmentId") ?? ""}
                  options={segmentOptions}
                  onChange={(v) => setParam({ audienceSegmentId: v })}
                />
                <FilterSelect
                  value={searchParams.get("hasLived") ?? ""}
                  onChange={(v) => setParam({ hasLived: v })}
                  options={[
                    { value: "", label: "ไลฟ์: ทั้งหมด" },
                    { value: "1", label: "เคยไลฟ์" },
                    { value: "0", label: "ไม่เคยไลฟ์" },
                  ]}
                  className="w-fit"
                />
                <label className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={searchParams.get("sortByGmv") === "1"}
                    onChange={(e) => setParam({ sortByGmv: e.target.checked ? "1" : "" })}
                    className="accent-amber-400"
                  />
                  <Wallet className="size-4" /> เรียงตามยอดขาย
                </label>
              </div>
            </div>
          )}
        </div>

        {showForm && !archivedView && (
          <div className="space-y-3">
            {/* mode switch: กรอกในระบบ (เดิม) | สร้างจากภายนอก (reverse-capture) */}
            <div className="flex gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1 text-sm">
              <button
                onClick={() => setCreateMode("forward")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 font-medium transition-colors ${
                  createMode === "forward"
                    ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <Pencil className="size-4" /> กรอกในระบบ
              </button>
              <button
                onClick={() => setCreateMode("reverse")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-3 py-2 font-medium transition-colors ${
                  createMode === "reverse"
                    ? "bg-amber-400/15 text-amber-300 ring-1 ring-amber-400/50"
                    : "text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                <RefreshCw className="size-4" /> สร้างจากภายนอก
              </button>
            </div>

            {/* Blueprint (พิมพ์เขียว) selector — โชว์ทั้งสองโหมด คุมมาตรฐานการสร้าง */}
            {blueprints.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3">
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-200">
                  <Dna className="size-4" /> พิมพ์เขียว (Blueprint)
                </span>
                <FilterSelect
                  value={blueprintId}
                  onChange={setBlueprintId}
                  options={blueprints.map((b) => ({
                    value: b.id,
                    label: (b.icon ? `${b.icon} ` : "") + b.name + (b.isDefault ? " (default)" : ""),
                  }))}
                  className="w-fit"
                />
                {(() => {
                  const bp = blueprints.find((b) => b.id === blueprintId);
                  const summary = bp?.houseRules?.trim() || bp?.description?.trim();
                  return summary ? (
                    <span
                      title={summary}
                      className="inline-flex items-center gap-1 cursor-help text-xs text-zinc-500"
                    >
                      <Info className="size-4 shrink-0" /> {summary.length > 60 ? `${summary.slice(0, 60)}…` : summary}
                    </span>
                  ) : null;
                })()}
              </div>
            )}

            {createMode === "reverse" ? (
              <ReverseCapture
                aiConfigured={Boolean(aiStatus?.configured)}
                blueprintId={blueprintId || undefined}
              />
            ) : (
          <form
            onSubmit={handleCreate}
            className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6"
          >
            <p className="text-sm text-zinc-400">
              Wizard step 1 — กรอกแค่นี้พอ เดี๋ยว AI ช่วยร่างส่วนที่เหลือ (Phase 1.5)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <input
                required
                value={form.nameTh}
                onChange={(e) => setForm({ ...form, nameTh: e.target.value })}
                placeholder="ชื่อไทย *"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              <input
                value={form.nameEn}
                onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
                placeholder="ชื่ออังกฤษ"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
              <input
                value={form.nickname}
                onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                placeholder="ชื่อเล่น"
                className="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
              />
            </div>
            <input
              value={form.oneLineConcept}
              onChange={(e) => setForm({ ...form, oneLineConcept: e.target.value })}
              placeholder="คอนเซ็ปต์หนึ่งบรรทัด เช่น สาวอีสานสายแซ่บ รีวิวของถูกปากตรงใจ"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <input
              value={form.universe}
              onChange={(e) => setForm({ ...form, universe: e.target.value })}
              placeholder="Universe / Series"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400"
            />
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving || aiBusy}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังสร้าง..." : "สร้าง Draft เปล่า"}
              </button>
              {aiStatus?.configured && (
                <button
                  type="button"
                  onClick={handleAiCreate}
                  disabled={aiBusy || saving}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  <Sparkles className="size-4" />
                  {aiBusy ? "AI กำลังร่าง Character Bible..." : "สร้างด้วย AI Wizard"}
                </button>
              )}
              {aiStatus && !aiStatus.configured && (
                <span className="text-xs text-zinc-500">
                  ตั้งค่า ANTHROPIC_API_KEY เพื่อเปิดใช้ AI Wizard
                </span>
              )}
            </div>

            {/* amber note: required fields ที่ blueprint กำหนดแต่ AI ร่างมาไม่ครบ */}
            {wizardMissing && wizardMissing.length > 0 && pendingDraft && (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p>
                  <TriangleAlert className="inline size-4 align-text-bottom" /> ตามพิมพ์เขียว ยังมีฟิลด์บังคับที่ AI ร่างมาไม่ครบ:{" "}
                  <span className="font-semibold">{wizardMissing.join(", ")}</span> — เติมให้ครบทีหลังในหน้า
                  detail ได้
                </p>
                <button
                  type="button"
                  onClick={() => void finalizeAiCreate(pendingDraft)}
                  className="rounded-lg bg-amber-400 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-300"
                >
                  สร้างตัวละครต่อ (ข้ามคำเตือน)
                </button>
              </div>
            )}
          </form>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* card grid — เห็นหน้า character ก่อนตัวหนังสือ */}
        {view === "grid" && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {(data?.items as CharacterRow[] | undefined)?.map((c) => {
                const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
                const tags = c.tags ?? [];
                return (
                  <button
                    key={c.id}
                    onClick={() => router.push(`/characters/${c.id}`)}
                    className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 text-left transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-xl hover:shadow-black/40"
                  >
                    <CoverImage
                      assetId={c.thumbAssetId}
                      entityType="character"
                      entityId={c.id}
                      name={c.nameTh}
                      aspect="aspect-[3/4]"
                      className="rounded-none"
                    >
                      {/* chips บนรูป */}
                      <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 backdrop-blur-sm">
                        {c.displayCode}
                      </span>
                      <span
                        className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}
                      >
                        {st.label}
                      </span>
                      {/* metric badge เมื่อเรียงด้วย GMV/วิว */}
                      {isMetricSort && c.metric != null && (
                        <span className="absolute right-2 top-8 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-300 backdrop-blur-sm">
                          {fmtMetric(c)}
                        </span>
                      )}
                      {/* ชื่อ overlay ล่างพร้อม gradient */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-10">
                        <p className="truncate text-sm font-semibold text-white">
                          {c.nameTh}
                          {c.nameEn && (
                            <span className="ml-1 text-xs font-normal text-zinc-300">
                              ({c.nameEn})
                            </span>
                          )}
                        </p>
                      </div>
                    </CoverImage>
                    <div className="space-y-1 px-3 py-2.5">
                      <p className="truncate text-xs text-zinc-400">
                        {c.persona?.one_line_concept ?? "ยังไม่มีคอนเซ็ปต์"}
                      </p>
                      {(c.categories?.length ?? 0) > 0 && (
                        <p className="flex flex-wrap items-center gap-1">
                          {(c.categories ?? []).slice(0, 3).map((cat) => (
                            <span
                              key={cat.id}
                              className="inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-200"
                            >
                              <Drama className="size-3.5" /> {cat.label}
                            </span>
                          ))}
                          {(c.categories?.length ?? 0) > 3 && (
                            <span className="text-[10px] text-zinc-500">
                              +{(c.categories?.length ?? 0) - 3}
                            </span>
                          )}
                        </p>
                      )}
                      {(tags.length > 0 || (c.campaignActiveCount ?? 0) > 0) && (
                        <p className="flex flex-wrap items-center gap-1">
                          {tags.slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300"
                            >
                              #{t.name}
                            </span>
                          ))}
                          {tags.length > 3 && (
                            <span className="text-[10px] text-zinc-500">+{tags.length - 3}</span>
                          )}
                          {(c.campaignActiveCount ?? 0) > 0 && (
                            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                              <Clapperboard className="size-3.5" /> {c.campaignActiveCount} งาน
                            </span>
                          )}
                        </p>
                      )}
                      <p className="flex flex-wrap gap-x-2 text-[11px] text-zinc-500">
                        {c.age != null && <span>อายุ {c.age}</span>}
                        {c.region && <span>{c.region}</span>}
                        {c.universe && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <Sparkles className="size-3.5 shrink-0" /> {c.universe}
                          </span>
                        )}
                        <span className="ml-auto">{c.version}</span>
                      </p>
                      {/* reverse-link: Prompt Library กรองเฉพาะ prompt ที่เชื่อมกับตัวละครนี้
                          (การ์ดเป็น <button> — ใช้ span role=button กัน nested button) */}
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/prompts?entityType=character&entityId=${c.id}`);
                        }}
                        title="Prompt ที่เชื่อมกับตัวละครนี้"
                        className="mt-1 inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-amber-300"
                      >
                        <FileText className="size-3.5" /> Prompt
                      </span>
                      {archivedView && (
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (restoringId === null) void handleRestore(c.id);
                          }}
                          className={`mt-1 inline-flex items-center gap-1 rounded-lg border border-orange-500/50 px-2.5 py-1 text-[11px] text-orange-300 hover:bg-orange-500/10 ${
                            restoringId !== null ? "opacity-50" : ""
                          }`}
                        >
                          {restoringId === c.id ? (
                            "กำลังกู้คืน..."
                          ) : (
                            <>
                              <Undo2 className="size-3.5" /> กู้คืน
                            </>
                          )}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            {data && data.items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
                <Drama className="mx-auto size-8 text-zinc-600" />
                <p className="mt-2 text-sm">
                  {activeFilters > 0
                    ? "ไม่พบ character ตาม filter — ลองล้าง filter ดู"
                    : "ยังไม่มี character — สร้างตัวแรกด้วยปุ่ม “+ สร้าง Character”"}
                </p>
              </div>
            )}
          </>
        )}

        {/* table view */}
        {view === "table" && (
          <div className="overflow-hidden rounded-2xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-medium">รหัส</th>
                  <th className="px-4 py-3 font-medium">ชื่อ</th>
                  <th className="px-4 py-3 font-medium">คอนเซ็ปต์</th>
                  <th className="px-4 py-3 font-medium">Universe</th>
                  <th className="px-4 py-3 font-medium">Tags</th>
                  <th className="px-4 py-3 font-medium">Version</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {isMetricSort && (
                    <th className="px-4 py-3 text-right font-medium">
                      {sortBy === "gmv" ? "GMV" : "Views"}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {data?.items.map((c) => {
                  const st = STATUS_LABEL[c.status] ?? STATUS_LABEL.draft;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/characters/${c.id}`)}
                      className="cursor-pointer hover:bg-zinc-900/50"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-amber-300">{c.displayCode}</td>
                      <td className="px-4 py-3">
                        {c.nameTh}
                        {c.nameEn && <span className="ml-1 text-zinc-500">({c.nameEn})</span>}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/prompts?entityType=character&entityId=${c.id}`);
                          }}
                          title="Prompt ที่เชื่อมกับตัวละครนี้"
                          className="ml-2 inline-flex items-center rounded-md border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-amber-300"
                        >
                          <FileText className="size-3.5" />
                        </button>
                      </td>
                      <td className="max-w-60 truncate px-4 py-3 text-zinc-400">
                        {c.persona?.one_line_concept ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{c.universe ?? "—"}</td>
                      <td className="px-4 py-3 text-zinc-400">
                        {(c.tags ?? []).length > 0
                          ? (c.tags ?? [])
                              .slice(0, 3)
                              .map((t) => `#${t.name}`)
                              .join(" ") + ((c.tags ?? []).length > 3 ? ` +${(c.tags ?? []).length - 3}` : "")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{c.version}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
                        {archivedView && (
                          <button
                            disabled={restoringId !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleRestore(c.id);
                            }}
                            className="ml-2 inline-flex items-center gap-1 rounded-lg border border-orange-500/50 px-2 py-0.5 text-[11px] text-orange-300 hover:bg-orange-500/10 disabled:opacity-50"
                          >
                            {restoringId === c.id ? (
                              "กำลังกู้คืน..."
                            ) : (
                              <>
                                <Undo2 className="size-3.5" /> กู้คืน
                              </>
                            )}
                          </button>
                        )}
                      </td>
                      {isMetricSort && (
                        <td className="px-4 py-3 text-right font-semibold text-emerald-300">
                          {fmtMetric(c)}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {data && data.items.length === 0 && (
                  <tr>
                    <td colSpan={isMetricSort ? 8 : 7} className="px-4 py-10 text-center text-zinc-500">
                      {activeFilters > 0
                        ? "ไม่พบ character ตาม filter — ลองล้าง filter ดู"
                        : "ยังไม่มี character — สร้างตัวแรกด้วยปุ่ม “+ สร้าง Character”"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* pagination */}
        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button
              disabled={data.page <= 1}
              onClick={() => setParam({ page: String(data.page - 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> ก่อนหน้า
            </button>
            <span>
              หน้า {data.page} / {Math.ceil(data.total / data.pageSize)}
            </span>
            <button
              disabled={data.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setParam({ page: String(data.page + 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              ถัดไป <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {data && (
          <p className="text-xs text-zinc-500">
            ทั้งหมด {data.total} ตัว · หน้า {data.page}
          </p>
        )}
      </div>
    </AppShell>
  );
}

export default function CharactersPage() {
  return (
    <Suspense fallback={null}>
      <CharactersInner />
    </Suspense>
  );
}
