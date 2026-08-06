"use client";

// สูตรคลิป (Prompt Studio) — รวม 3 ชุดพรอมป์ไว้หน้าเดียว แบ่งแท็บด้านบน (อ้างอิง layout production):
//   ① สูตรคลิป (Base Prompt)  ② Prompt ประเภทสินค้า (แพ็กเกจ)  ③ Prompt ประเภทฉาก
// ทุกชุดแก้แล้วมีผลจริงตอน compose/recompose — เก็บ override ใน SystemSetting

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Clapperboard, Droplet, Package, Plus, RotateCcw, Save,
  Target, Tag,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import { api } from "@/lib/api";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";
const btnPrimary =
  "inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50";
const btnGhost =
  "inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800";

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

type TabKey = "recipes" | "producttype" | "packaging" | "texture" | "scene" | "domain";
const TABS: { key: TabKey; label: string; icon: typeof BookOpen }[] = [
  { key: "recipes", label: "สูตรคลิป", icon: BookOpen },
  { key: "producttype", label: "ประเภทสินค้า", icon: Tag },
  { key: "packaging", label: "ประเภทบรรจุภัณฑ์", icon: Package },
  { key: "texture", label: "เนื้อสัมผัส", icon: Droplet },
  { key: "scene", label: "Prompt ประเภทฉาก", icon: Clapperboard },
  { key: "domain", label: "Domain Prompt", icon: Target },
];
// ⚙️ พรอมระบบถูกถอดออก — บรรทัดจังหวะพูด/เสียง/งานกล้อง เป็นค่าตายตัวในโค้ด (สไตล์ HTML) ไม่มีแท็บให้แก้แล้ว

// ── ① Base Prompt (สูตรเล่าเรื่อง) ──
interface RecipeSection {
  name: string;
  note?: string;
}
interface Recipe {
  key: string;
  label: string;
  sceneFlow: RecipeSection[];
  promptEmphasis: string[];
  promptEmphasisVideo?: string[];
  negativeStill?: string[];
  negativeVideo?: string[];
  ctaDefault: string;
  builtin: boolean;
  overridden: boolean;
}
const CTA_OPTIONS = [
  { value: "basket", label: "จิ้มตะกร้า (basket)" },
  { value: "map", label: "พิกัด (map)" },
  { value: "line", label: "ทัก LINE (line)" },
  { value: "phone", label: "โทรสั่ง/จอง (phone)" },
  { value: "booking", label: "จองเลย (booking)" },
  { value: "signup", label: "สมัคร/ทดลองใช้ (signup)" },
];
const TYPE_LABEL: Record<string, string> = {
  product: "🛍 สินค้า",
  place: "📍 ร้าน/สถานที่",
  food: "🍜 อาหาร/เมนู",
  software: "💻 ซอฟต์แวร์",
};

// ── ② Prompt ประเภทสินค้า (แพ็กเกจ) ──
interface PackagingItem {
  key: string;
  label: string;
  prompt: string;
  promptStill?: string;
  promptVideo?: string;
  negative: string;
  negativeStill?: string;
  negativeVideo?: string;
  builtin: boolean;
  overridden: boolean;
}

// ── ③ Prompt ประเภทฉาก ──
interface SceneTypeBlock {
  rule: string; // ชุด "เห็นสินค้า"
  negative: string;
  ruleHidden?: string; // ชุด "ไม่เห็นสินค้า"
  negativeHidden?: string;
  showProduct?: boolean; // ชุดไหน active (และเป็นค่าเริ่มต้นของ shot ใหม่)
}
interface SceneBlocks {
  presenter: SceneTypeBlock;
  hands: SceneTypeBlock;
  product_only: SceneTypeBlock;
  productHiddenLine: string;
  productHiddenNegative: string;
}
const SCENE_LABEL: Record<string, string> = {
  presenter: "🎭 มีตัวละคร",
  hands: "🤚 เห็นแค่มือ",
  product_only: "📦 ไม่มีคน",
};

// ── Domain Prompt — พรอมป์ต่อช่วงเรื่อง ──
interface SectionPromptBlock {
  prompt: string; // ชุด "เห็นสินค้า"
  promptHidden?: string; // ชุด "ไม่เห็นสินค้า" (hook ใช้จริง — section อื่น fallback prompt)
  showProduct?: boolean; // เฉพาะ hook
}
type SectionPrompts = Record<
  "hook" | "reveal" | "interaction" | "demonstration" | "result" | "cta",
  SectionPromptBlock
>;
const SECTION_META: { key: keyof SectionPrompts; label: string; desc: string }[] = [
  { key: "hook", label: "🪝 Hook (เปิดหัว)", desc: "2 วิแรกหยุดนิ้ว — อารมณ์ชัด ปัญหาจริง" },
  { key: "reveal", label: "✨ Reveal (เผยสินค้า)", desc: "สินค้าโผล่ครั้งแรกแบบน่าจดจำ" },
  { key: "interaction", label: "🤲 Interaction (คลุกคลี)", desc: "จับ พลิก ส่องสินค้าอย่างสนใจจริง" },
  { key: "demonstration", label: "🖐 Demo (ใช้จริง)", desc: "ลงมือใช้จริง โฟกัสแอ็กชัน+รีแอ็กชัน" },
  { key: "result", label: "📈 Result (ผลลัพธ์)", desc: "โชว์ผลที่เห็นได้ ความพอใจจริง" },
  { key: "cta", label: "🛒 CTA (ปิดคลิป)", desc: "ชวนกดตะกร้า พลังปิดท้ายอบอุ่น" },
];
// section ของ step ตามตำแหน่ง: แรก = hook, ท้าย = cta, กลางไล่ reveal → interaction → demonstration → result (ตรรกะเดียวกับ normalizeSection ฝั่ง API)
function sectionForStep(i: number, total: number): keyof SectionPrompts {
  if (i === 0) return "hook";
  if (i === total - 1 && total > 1) return "cta";
  const middle: (keyof SectionPrompts)[] = ["reveal", "interaction", "demonstration", "result"];
  return middle[Math.min(Math.max(i - 1, 0), middle.length - 1)];
}

function PromptStudioInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabKey) || "recipes";
  const setTab = (t: TabKey) =>
    router.replace(t === "recipes" ? "/clip-jobs/recipes" : `/clip-jobs/recipes?tab=${t}`);

  // ═══ 🧼 ประเภทสินค้า (อ่านอย่างเดียว) ═══
  const [productTypes, setProductTypes] = useState<{ key: string; label: string; promptStill: string; promptVideo: string; negative: string }[]>([]);
  useEffect(() => {
    api<{ items: typeof productTypes }>("/clip-jobs/product-type-prompts")
      .then((res) => setProductTypes(res.items))
      .catch(() => setProductTypes([]));
  }, []);

  // ═══ 🧴 เนื้อสัมผัส (อ่านอย่างเดียว) ═══
  const [textures, setTextures] = useState<{ key: string; label: string; promptStill: string; promptVideo: string; negative: string }[]>([]);
  useEffect(() => {
    api<{ items: typeof textures }>("/clip-jobs/texture-prompts")
      .then((res) => setTextures(res.items))
      .catch(() => setTextures([]));
  }, []);

  // ═══ ① Base Prompt state ═══
  const [items, setItems] = useState<Recipe[]>([]);
  const [selKey, setSelKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Recipe | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [newSlug, setNewSlug] = useState("");
  const [negDefaults, setNegDefaults] = useState<{ still: string[]; video: string[] }>({ still: [], video: [] });
  const [hiddenRecipes, setHiddenRecipes] = useState<{ key: string; label: string }[]>([]); // 🚫 สูตรที่ซ่อนไว้

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Recipe[]; hidden?: { key: string; label: string }[]; negativeDefaults?: { still: string[]; video: string[] } }>(
        "/clip-jobs/recipes",
      );
      setItems(res.items);
      setHiddenRecipes(res.hidden ?? []);
      if (res.negativeDefaults) setNegDefaults(res.negativeDefaults);
    } catch (e) {
      setErr(errMsg(e, "โหลดสูตรไม่สำเร็จ"));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!selKey) return setDraft(null);
    const r = items.find((x) => x.key === selKey);
    setDraft(r ? (JSON.parse(JSON.stringify(r)) as Recipe) : null);
    setMsg(null);
    setErr(null);
  }, [selKey, items]);

  const grouped = useMemo(() => {
    const g = new Map<string, Recipe[]>();
    for (const r of items) {
      const type = r.key.split("/")[0];
      if (!g.has(type)) g.set(type, []);
      g.get(type)!.push(r);
    }
    return g;
  }, [items]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const [type, slug] = draft.key.split("/");
      await api(`/clip-jobs/recipes/${type}/${slug}`, {
        method: "PUT",
        body: JSON.stringify({
          label: draft.label,
          sceneFlow: draft.sceneFlow,
          promptEmphasis: draft.promptEmphasis,
          promptEmphasisVideo: draft.promptEmphasisVideo ?? [],
          negativeStill: draft.negativeStill ?? negDefaults.still,
          negativeVideo: draft.negativeVideo ?? negDefaults.video,
          ctaDefault: draft.ctaDefault,
        }),
      });
      setMsg("บันทึกแล้ว — มีผลกับ job ใหม่ทันที");
      await load();
    } catch (e) {
      setErr(errMsg(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!draft?.overridden) return;
    if (!confirm(draft.builtin ? "คืนสูตรนี้เป็นค่าเริ่มต้น?" : "ลบสูตร custom นี้ทิ้ง?")) return;
    setBusy(true);
    try {
      const [type, slug] = draft.key.split("/");
      await api(`/clip-jobs/recipes/${type}/${slug}`, { method: "DELETE" });
      setMsg(draft.builtin ? "คืนค่าเริ่มต้นแล้ว" : "ลบสูตรแล้ว");
      if (!draft.builtin) setSelKey(null);
      await load();
    } catch (e) {
      setErr(errMsg(e, "ทำรายการไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  // 🚫 ลบสูตรติดระบบ = ซ่อนออกจากรายการ/dropdown (กู้คืนได้ด้านล่าง)
  async function hideRecipe() {
    if (!draft) return;
    if (!confirm(`ลบสูตร "${draft.label}" ออกจากรายการ? (สูตรติดระบบจะถูกซ่อน กู้คืนได้ที่ท้ายแฟ้มซ้าย)`)) return;
    setBusy(true);
    try {
      const [type, slug] = draft.key.split("/");
      await api(`/clip-jobs/recipes/${type}/${slug}/hide`, { method: "POST" });
      setMsg("ลบสูตรออกจากรายการแล้ว");
      setSelKey(null);
      await load();
    } catch (e) {
      setErr(errMsg(e, "ลบไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  async function unhideRecipe(key: string) {
    setBusy(true);
    try {
      const [type, slug] = key.split("/");
      await api(`/clip-jobs/recipes/${type}/${slug}/unhide`, { method: "POST" });
      await load();
    } catch (e) {
      setErr(errMsg(e, "กู้คืนไม่สำเร็จ"));
    } finally {
      setBusy(false);
    }
  }

  function createCustom() {
    const slug = newSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    if (!slug) return;
    const key = `product/${slug}`;
    if (items.some((r) => r.key === key)) {
      setSelKey(key);
      return;
    }
    const fresh: Recipe = {
      key,
      label: `สูตรใหม่ (${slug})`,
      sceneFlow: [
        { name: "เปิดหัวดึงคนดู", note: "hook 3 วิแรก" },
        { name: "เผยสินค้า" },
        { name: "ใช้จริง/พิสูจน์" },
        { name: "ปิดการขาย" },
      ],
      promptEmphasis: ["photorealistic, authentic UGC feel"],
      promptEmphasisVideo: [],
      ctaDefault: "basket",
      builtin: false,
      overridden: false,
    };
    setItems((xs) => [...xs, fresh]);
    setSelKey(key);
    setNewSlug("");
  }

  function setFlow(i: number, patch: Partial<RecipeSection>) {
    setDraft((d) =>
      d ? { ...d, sceneFlow: d.sceneFlow.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d,
    );
  }

  // ═══ ② Packaging state ═══
  const [pkItems, setPkItems] = useState<PackagingItem[]>([]);
  const [pkSel, setPkSel] = useState<string | null>(null);
  const [pkDraft, setPkDraft] = useState<PackagingItem | null>(null);
  const [pkBusy, setPkBusy] = useState(false);
  const [pkMsg, setPkMsg] = useState<string | null>(null);
  const [pkNewKey, setPkNewKey] = useState("");

  const pkLoad = useCallback(async () => {
    try {
      const res = await api<{ items: PackagingItem[] }>("/clip-jobs/packaging-prompts");
      setPkItems(res.items);
    } catch (e) {
      setPkMsg("⚠ " + errMsg(e, "โหลดไม่สำเร็จ"));
    }
  }, []);
  useEffect(() => {
    void pkLoad();
  }, [pkLoad]);
  useEffect(() => {
    if (!pkSel) return setPkDraft(null);
    const r = pkItems.find((x) => x.key === pkSel);
    setPkDraft(r ? { ...r } : null);
    setPkMsg(null);
  }, [pkSel, pkItems]);

  async function pkSave() {
    if (!pkDraft) return;
    setPkBusy(true);
    setPkMsg(null);
    try {
      await api(`/clip-jobs/packaging-prompts/${pkDraft.key}`, {
        method: "PUT",
        body: JSON.stringify({ label: pkDraft.label, promptStill: pkDraft.promptStill ?? pkDraft.prompt, promptVideo: pkDraft.promptVideo ?? "", negativeStill: pkDraft.negativeStill ?? pkDraft.negative, negativeVideo: pkDraft.negativeVideo ?? "" }),
      });
      setPkMsg("บันทึกแล้ว — มีผลกับ shot ที่ recompose หลังจากนี้");
      await pkLoad();
    } catch (e) {
      setPkMsg("⚠ " + errMsg(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setPkBusy(false);
    }
  }

  async function pkReset() {
    if (!pkDraft?.overridden) return;
    if (!confirm(pkDraft.builtin ? "คืน prompt ประเภทนี้เป็นค่าเริ่มต้น?" : "ลบประเภท custom นี้ทิ้ง?")) return;
    setPkBusy(true);
    try {
      await api(`/clip-jobs/packaging-prompts/${pkDraft.key}`, { method: "DELETE" });
      if (!pkDraft.builtin) setPkSel(null);
      await pkLoad();
      setPkMsg("เรียบร้อย");
    } catch (e) {
      setPkMsg("⚠ " + errMsg(e, "ทำรายการไม่สำเร็จ"));
    } finally {
      setPkBusy(false);
    }
  }

  function pkCreateNew() {
    const key = pkNewKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
    if (!key) return;
    if (pkItems.some((r) => r.key === key)) return setPkSel(key);
    setPkItems((xs) => [
      ...xs,
      { key, label: `ประเภทใหม่ (${key})`, prompt: "Product form: ...", negative: "", builtin: false, overridden: false },
    ]);
    setPkSel(key);
    setPkNewKey("");
  }

  // ═══ ③ Scene blocks state ═══
  const [sbBlocks, setSbBlocks] = useState<SceneBlocks | null>(null);
  const [sbBusy, setSbBusy] = useState(false);
  const [sbMsg, setSbMsg] = useState<string | null>(null);

  const sbLoad = useCallback(async () => {
    try {
      const res = await api<{ current: SceneBlocks }>("/clip-jobs/scene-blocks");
      setSbBlocks(res.current);
    } catch (e) {
      setSbMsg("⚠ " + errMsg(e, "โหลดไม่สำเร็จ"));
    }
  }, []);
  useEffect(() => {
    void sbLoad();
  }, [sbLoad]);

  async function sbSave() {
    if (!sbBlocks) return;
    setSbBusy(true);
    setSbMsg(null);
    try {
      const res = await api<{ current: SceneBlocks }>("/clip-jobs/scene-blocks", {
        method: "PUT",
        body: JSON.stringify(sbBlocks),
      });
      setSbBlocks(res.current);
      setSbMsg("บันทึกแล้ว — มีผลกับ shot ที่ recompose หลังจากนี้");
    } catch (e) {
      setSbMsg("⚠ " + errMsg(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setSbBusy(false);
    }
  }

  async function sbReset() {
    if (!confirm("คืนบล็อกประเภทฉากทั้งหมดเป็นค่าเริ่มต้น?")) return;
    setSbBusy(true);
    try {
      const res = await api<{ current: SceneBlocks }>("/clip-jobs/scene-blocks", { method: "DELETE" });
      setSbBlocks(res.current);
      setSbMsg("คืนค่าเริ่มต้นแล้ว");
    } catch (e) {
      setSbMsg("⚠ " + errMsg(e, "ทำรายการไม่สำเร็จ"));
    } finally {
      setSbBusy(false);
    }
  }

  // ═══ Domain Prompt state ═══
  const [dpBlocks, setDpBlocks] = useState<SectionPrompts | null>(null);
  const [dpBusy, setDpBusy] = useState(false);
  const [dpMsg, setDpMsg] = useState<string | null>(null);

  const dpLoad = useCallback(async () => {
    try {
      const res = await api<{ current: SectionPrompts }>("/clip-jobs/section-prompts");
      setDpBlocks(res.current);
    } catch (e) {
      setDpMsg("⚠ " + errMsg(e, "โหลดไม่สำเร็จ"));
    }
  }, []);
  useEffect(() => {
    void dpLoad();
  }, [dpLoad]);

  async function dpSave() {
    if (!dpBlocks) return;
    setDpBusy(true);
    setDpMsg(null);
    try {
      const res = await api<{ current: SectionPrompts }>("/clip-jobs/section-prompts", {
        method: "PUT",
        body: JSON.stringify(dpBlocks),
      });
      setDpBlocks(res.current);
      setDpMsg("บันทึกแล้ว — มีผลกับ shot ที่ recompose/แตก storyboard หลังจากนี้");
    } catch (e) {
      setDpMsg("⚠ " + errMsg(e, "บันทึกไม่สำเร็จ"));
    } finally {
      setDpBusy(false);
    }
  }

  async function dpReset() {
    if (!confirm("คืน Domain Prompt ทั้งหมดเป็นค่าเริ่มต้น?")) return;
    setDpBusy(true);
    try {
      const res = await api<{ current: SectionPrompts }>("/clip-jobs/section-prompts", { method: "DELETE" });
      setDpBlocks(res.current);
      setDpMsg("คืนค่าเริ่มต้นแล้ว");
    } catch (e) {
      setDpMsg("⚠ " + errMsg(e, "ทำรายการไม่สำเร็จ"));
    } finally {
      setDpBusy(false);
    }
  }

  return (
    <AppShell title="สูตรคลิป (Prompt Studio)">
      {/* แท็บด้านบน — pill แบบ production */}
      <div className="mb-5 flex w-fit flex-wrap gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? "bg-amber-400 font-semibold text-zinc-950"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <t.icon className="size-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══ ① สูตรคลิป (Base Prompt) ═══ */}
      {tab === "recipes" && (
        <div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-400">
              สูตร = ลำดับการเล่าที่ AI ใช้ตอนคิดคอนเซปต์/แตก storyboard — ระบบจับคู่สูตรกับหมวดสินค้าอัตโนมัติ
              หรือเลือกเองตอนสร้างงานก็ได้
            </p>
            <div className="flex items-center gap-2">
              <input
                className={inputCls + " w-40"}
                placeholder="ชื่อสูตรใหม่ (slug)"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCustom()}
              />
              <button className={btnGhost} onClick={createCustom} disabled={!newSlug.trim()}>
                <Plus className="size-4" /> สร้างสูตร
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="space-y-4">
              {[...grouped.entries()].map(([type, rs]) => (
                <div key={type}>
                  <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    {TYPE_LABEL[type] ?? type}
                  </p>
                  <div className="space-y-1">
                    {rs.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setSelKey(r.key)}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                          selKey === r.key
                            ? "bg-amber-400/15 text-amber-300"
                            : "text-zinc-300 hover:bg-zinc-800/60"
                        }`}
                      >
                        <span className="block truncate">{r.label}</span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          {r.key}
                          {r.overridden && " · แก้แล้ว"}
                          {!r.builtin && " · custom"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* 🚫 สูตรที่ซ่อนไว้ — กู้คืนได้ */}
              {hiddenRecipes.length > 0 && (
                <div className="mt-3 border-t border-zinc-800 pt-2">
                  <p className="mb-1 px-3 text-[11px] text-zinc-500">🚫 สูตรที่ลบ/ซ่อนไว้ ({hiddenRecipes.length})</p>
                  {hiddenRecipes.map((h) => (
                    <div key={h.key} className="flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-800/40">
                      <span className="truncate">{h.label}</span>
                      <button
                        onClick={() => void unhideRecipe(h.key)}
                        disabled={busy}
                        className="shrink-0 rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                      >
                        กู้คืน
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!draft ? (
              <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-sm text-zinc-500">
                เลือกสูตรจากแฟ้มด้านซ้ายเพื่อแก้ไข
              </div>
            ) : (
              <div className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-zinc-500">{draft.key}</p>
                    <input
                      className={inputCls + " mt-1 text-base font-medium"}
                      value={draft.label}
                      onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                    />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {draft.overridden && (
                      <button className={btnGhost} onClick={reset} disabled={busy}>
                        <RotateCcw className="size-4" />
                        {draft.builtin ? "คืนค่าเริ่มต้น" : "ลบสูตร"}
                      </button>
                    )}
                    {draft.builtin && (
                      <button
                        className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                        onClick={hideRecipe}
                        disabled={busy}
                        title="ซ่อนสูตรนี้ออกจากรายการและ dropdown สร้าง job — กู้คืนได้"
                      >
                        🗑 ลบสูตร
                      </button>
                    )}
                    <button className={btnPrimary} onClick={save} disabled={busy}>
                      <Save className="size-4" /> บันทึก
                    </button>
                  </div>
                </div>

                {msg && <p className="text-sm text-emerald-400">✓ {msg}</p>}
                {err && <p className="text-sm text-rose-400">⚠ {err}</p>}

                <div>
                  <p className="mb-2 text-sm font-medium text-zinc-200">
                    ลำดับการเล่า (sceneFlow) — ป้อนเข้า AI ทั้งตอนคิดคอนเซปต์และแตก storyboard
                  </p>
                  <div className="space-y-2">
                    {draft.sceneFlow.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="mt-2 w-6 shrink-0 text-right font-mono text-xs text-zinc-500">
                          {i + 1}.
                        </span>
                        <input
                          className={inputCls + " flex-[2]"}
                          placeholder="ชื่อช่วง เช่น แกะกล่อง"
                          value={s.name}
                          onChange={(e) => setFlow(i, { name: e.target.value })}
                        />
                        <input
                          className={inputCls + " flex-[3]"}
                          placeholder="จุดเน้นของช่วงนี้ (ไม่บังคับ)"
                          value={s.note ?? ""}
                          onChange={(e) => setFlow(i, { note: e.target.value })}
                        />
                        <button
                          className="mt-1 px-2 text-zinc-500 hover:text-rose-400"
                          onClick={() =>
                            setDraft({ ...draft, sceneFlow: draft.sceneFlow.filter((_, j) => j !== i) })
                          }
                          title="ลบช่วงนี้"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className={btnGhost + " mt-2"}
                    onClick={() => setDraft({ ...draft, sceneFlow: [...draft.sceneFlow, { name: "" }] })}
                    disabled={draft.sceneFlow.length >= 8}
                  >
                    <Plus className="size-4" /> เพิ่มช่วง (สูงสุด 8)
                  </button>
                </div>

                {/* 🎯 Domain Prompt ต่อช่วง + 🎛 Master — ค่ากลางชุดเดียวกับแท็บ Domain Prompt (ใช้ร่วมทุกสูตร) */}
                {dpBlocks && (
                  <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-zinc-200">🎯 Prompt ของแต่ละช่วง (Domain Prompt)</p>
                        <p className="text-[11px] text-zinc-500">
                          ค่ากลางชุดเดียวกับแท็บ Domain Prompt — แก้ที่นี่ = อัปเดตที่เดียวกัน ใช้ร่วมทุกสูตร
                        </p>
                      </div>
                      <button className={btnPrimary + " shrink-0"} onClick={dpSave} disabled={dpBusy}>
                        <Save className="size-4" /> บันทึก Domain Prompt
                      </button>
                    </div>
                    {dpMsg && <p className="text-xs text-emerald-400">{dpMsg}</p>}

                    <div className="space-y-2">
                      {draft.sceneFlow.map((s, i) => {
                        const sec = sectionForStep(i, draft.sceneFlow.length);
                        const meta = SECTION_META.find((m) => m.key === sec);
                        return (
                          <div key={i} className="flex items-start gap-2">
                            <span className="mt-2 w-6 shrink-0 text-right font-mono text-xs text-zinc-500">
                              {i + 1}.
                            </span>
                            <div className="flex-1 space-y-1">
                              <p className="text-[11px] text-zinc-500">
                                {s.name || "(ยังไม่ตั้งชื่อ)"} → <span className="text-zinc-300">{meta?.label ?? sec}</span>
                              </p>
                              <textarea
                                className={inputCls + " h-14 text-xs leading-relaxed"}
                                value={dpBlocks[sec].prompt}
                                onChange={(e) =>
                                  setDpBlocks({ ...dpBlocks, [sec]: { ...dpBlocks[sec], prompt: e.target.value } })
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                      <p className="text-[11px] text-zinc-600">
                        💡 หลายช่วงชี้ section เดียวกันได้ (แก้ที่ไหนก็ค่าเดียวกัน) · ชุด &quot;ไม่เห็นสินค้า&quot; ของ Hook แก้ที่แท็บ Domain Prompt
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-zinc-200">
                      🖼 จุดเน้นภาพ (promptEmphasis) — ผนวกเข้าพรอมป์ภาพนิ่งทุกฉาก · EN บรรทัดละข้อ
                    </p>
                    <textarea
                      className={inputCls + " h-28 font-mono text-xs leading-relaxed"}
                      value={draft.promptEmphasis.join("\n")}
                      onChange={(e) => setDraft({ ...draft, promptEmphasis: e.target.value.split("\n") })}
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-zinc-200">
                      🎬 จุดเน้นวิดีโอ (promptEmphasisVideo) — ผนวกเข้าพรอมป์วิดีโอทุกฉาก · EN บรรทัดละข้อ (ว่าง = ไม่ใส่)
                    </p>
                    <textarea
                      className={inputCls + " h-28 font-mono text-xs leading-relaxed"}
                      placeholder={"smooth confident hand movement\nspeech finished within the first 4 seconds\na soft closed-mouth smile, hands giving the product a calm final touch"}
                      value={(draft.promptEmphasisVideo ?? []).join("\n")}
                      onChange={(e) => setDraft({ ...draft, promptEmphasisVideo: e.target.value.split("\n") })}
                    />
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="mb-2 text-sm font-medium text-zinc-200">
                      🚫 Negative ภาพนิ่ง — ปิดท้าย prompt ภาพ (AVOID: ...) เสมอ · บรรทัดละข้อ (สูงสุด 24)
                    </p>
                    <textarea
                      className={inputCls + " h-32 font-mono text-[11px] leading-relaxed"}
                      value={(draft.negativeStill ?? negDefaults.still).join("\n")}
                      onChange={(e) => setDraft({ ...draft, negativeStill: e.target.value.split("\n") })}
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">
                      ยังไม่เคยแก้ = ใช้ชุดกลางของระบบ (แสดงอยู่) · ลบทุกบรรทัด = ไม่ใส่ negative เลย
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-zinc-200">
                      🚫 Negative วิดีโอ — ปิดท้าย prompt วิดีโอ (AVOID: ...) เสมอ · บรรทัดละข้อ (สูงสุด 24)
                    </p>
                    <textarea
                      className={inputCls + " h-32 font-mono text-[11px] leading-relaxed"}
                      value={(draft.negativeVideo ?? negDefaults.video).join("\n")}
                      onChange={(e) => setDraft({ ...draft, negativeVideo: e.target.value.split("\n") })}
                    />
                    <p className="mt-1 text-[11px] text-zinc-500">
                      กันอาการเฉพาะวิดีโอ: morphing / flicker / ฉลากละลายกลางคลิป ฯลฯ
                    </p>
                  </div>
                </div>

                <div className="max-w-xs">
                  <p className="mb-2 text-sm font-medium text-zinc-200">CTA ปิดคลิป (ค่าเริ่มต้น)</p>
                  <select
                    className={inputCls}
                    value={draft.ctaDefault}
                    onChange={(e) => setDraft({ ...draft, ctaDefault: e.target.value })}
                  >
                    {CTA_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ② Prompt ประเภทสินค้า ═══ */}
      {tab === "packaging" && (
        <div>
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="text-sm text-zinc-400">
              🧴 บล็อกพรอมป์ต่อรูปแบบแพ็กเกจ — เลือกรูปแบบที่ตัวสินค้า (หน้าสร้าง Clip Job / หน้าแก้ไขสินค้า)
              แล้วระบบผนวกเข้า prompt ทุกฉากที่เห็นสินค้าอัตโนมัติ
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <input
                className={inputCls + " w-40"}
                placeholder="key ใหม่ เช่น roll_on"
                value={pkNewKey}
                onChange={(e) => setPkNewKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && pkCreateNew()}
              />
              <button className={btnGhost} onClick={pkCreateNew} disabled={!pkNewKey.trim()}>
                <Plus className="size-4" /> เพิ่มประเภท
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
              {pkItems.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setPkSel(r.key)}
                  className={`block w-full rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                    pkSel === r.key ? "bg-amber-400/15 text-amber-300" : "text-zinc-300 hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="block truncate">{r.label}</span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {r.key}
                    {r.overridden && " · แก้แล้ว"}
                    {!r.builtin && " · custom"}
                  </span>
                </button>
              ))}
            </div>

            {!pkDraft ? (
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-zinc-800 text-sm text-zinc-500">
                เลือกประเภทจากรายการซ้ายเพื่อแก้ prompt
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] text-zinc-500">{pkDraft.key}</p>
                    <input
                      className={inputCls + " mt-1 max-w-sm font-medium"}
                      value={pkDraft.label}
                      onChange={(e) => setPkDraft({ ...pkDraft, label: e.target.value })}
                    />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {pkDraft.overridden && (
                      <button className={btnGhost} onClick={pkReset} disabled={pkBusy}>
                        <RotateCcw className="size-4" /> {pkDraft.builtin ? "คืนค่าเริ่มต้น" : "ลบ"}
                      </button>
                    )}
                    <button className={btnPrimary} onClick={pkSave} disabled={pkBusy}>
                      <Save className="size-4" /> บันทึก
                    </button>
                  </div>
                </div>
                {pkMsg && <p className="text-sm text-emerald-400">{pkMsg}</p>}
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                    🖼 Prompt ภาพนิ่ง (EN — ภาษาหยุดนิ่ง: วิธีถือ/สภาพแพ็กเกจ — เข้าภาพนิ่งทุกฉากที่เห็นสินค้า)
                  </label>
                  <textarea
                    className={inputCls + " h-32 font-mono text-[11px] leading-relaxed"}
                    placeholder="เช่น Product held between fingers, tear notch visible at the top, glossy texture..."
                    value={pkDraft.promptStill ?? pkDraft.prompt}
                    onChange={(e) => setPkDraft({ ...pkDraft, promptStill: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                    🎬 Prompt วิดีโอ (EN — การเคลื่อนไหว/ฟิสิกส์: เท/บีบ/ไหล/เขย่า — เข้าคลิปทุกฉากที่เห็นสินค้า)
                  </label>
                  <textarea
                    className={inputCls + " h-32 font-mono text-[11px] leading-relaxed"}
                    placeholder="เช่น Tear across the notch, then squeeze the jelly upward into the mouth in one smooth motion..."
                    value={pkDraft.promptVideo ?? ""}
                    onChange={(e) => setPkDraft({ ...pkDraft, promptVideo: e.target.value })}
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">เว้นว่างได้ — ถ้าเว้น ระบบจะใช้ภาพนิ่งแทนในคลิป</p>
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                    🖼 Negative ภาพนิ่ง (กันเพี้ยนเฉพาะแพ็กเกจ — คั่นด้วย , )
                  </label>
                  <textarea
                    className={inputCls + " h-20 font-mono text-[11px] leading-relaxed"}
                    value={pkDraft.negativeStill ?? pkDraft.negative}
                    onChange={(e) => setPkDraft({ ...pkDraft, negativeStill: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                    🎬 Negative วิดีโอ (เช่น ไหลต่อเนื่อง/เปลี่ยนรูปกลางคลิป — คั่นด้วย , )
                  </label>
                  <textarea
                    className={inputCls + " h-20 font-mono text-[11px] leading-relaxed"}
                    placeholder="เช่น shampoo changing color or viscosity mid-pour, endless overflowing product..."
                    value={pkDraft.negativeVideo ?? ""}
                    onChange={(e) => setPkDraft({ ...pkDraft, negativeVideo: e.target.value })}
                  />
                  <p className="mt-1 text-[10px] text-zinc-500">เว้นว่างได้ — ถ้าเว้น ระบบใช้ negative ภาพนิ่งแทนในคลิป</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ 🧼 ประเภทสินค้า (อ่านอย่างเดียว) ═══ */}
      {tab === "producttype" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            🧼 ประเภทสินค้า (ยาสีฟัน/สบู่/โฟมล้างหน้า...) — แอ็กชันใช้งานหลักของสินค้า · เลือกที่สินค้า
            แล้วระบบฉีด <b>ก่อน</b> ประเภทบรรจุภัณฑ์และเนื้อสัมผัส (ทำงานก่อน)
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {productTypes.map((t) => (
              <div key={t.key} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center gap-2">
                  <Tag className="size-4 text-emerald-300" />
                  <span className="text-sm font-semibold text-zinc-100">{t.label}</span>
                  <span className="font-mono text-[11px] text-zinc-500">{t.key}</span>
                </div>
                <div className="text-xs text-zinc-400"><span className="text-zinc-500">ภาพนิ่ง:</span> {t.promptStill}</div>
                <div className="text-xs text-zinc-400"><span className="text-zinc-500">วิดีโอ:</span> {t.promptVideo}</div>
                <div className="text-[11px] text-red-300/70">AVOID: {t.negative}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ 🧴 เนื้อสัมผัส (อ่านอย่างเดียว) ═══ */}
      {tab === "texture" && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            🧴 พรอมเนื้อสัมผัสของตัวสินค้า (เจล/ครีม/เม็ด/โฟม...) — เลือกที่สินค้า (field เนื้อสัมผัส) แล้วระบบ
            ผนวกต่อท้าย Prompt ประเภทสินค้าเสมอ · ขวดฝาเกลียว/ขวดปั๊ม = วิธีใช้ที่ &quot;นำเข้า&quot; การโชว์เนื้อนี้
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {textures.map((t) => (
              <div key={t.key} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                <div className="flex items-center gap-2">
                  <Droplet className="size-4 text-amber-300" />
                  <span className="text-sm font-semibold text-zinc-100">{t.label}</span>
                  <span className="font-mono text-[11px] text-zinc-500">{t.key}</span>
                </div>
                <div className="text-xs text-zinc-400">
                  <span className="text-zinc-500">ภาพนิ่ง:</span> {t.promptStill}
                </div>
                <div className="text-xs text-zinc-400">
                  <span className="text-zinc-500">วิดีโอ:</span> {t.promptVideo}
                </div>
                <div className="text-[11px] text-red-300/70">AVOID: {t.negative}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ③ Prompt ประเภทฉาก ═══ */}
      {tab === "scene" &&
        (!sbBlocks ? (
          <p className="text-sm text-zinc-500">กำลังโหลด...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-zinc-400">
                กติกา + negative ที่ผนวกเข้า prompt ของทุก shot ตามชนิดฉาก — แก้แล้วกด recompose ที่ shot
                เพื่อให้ prompt อัปเดต
              </p>
              <div className="flex shrink-0 gap-2">
                <button className={btnGhost} onClick={sbReset} disabled={sbBusy}>
                  <RotateCcw className="size-4" /> คืนค่าเริ่มต้น
                </button>
                <button className={btnPrimary} onClick={sbSave} disabled={sbBusy}>
                  <Save className="size-4" /> บันทึกบล็อก
                </button>
              </div>
            </div>
            {sbMsg && <p className="text-sm text-emerald-400">{sbMsg}</p>}

            <div className="grid gap-4 lg:grid-cols-3">
              {(["presenter", "hands", "product_only"] as const).map((t) => (
                <div key={t} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-zinc-200">{SCENE_LABEL[t]}</p>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                      กติกาฉาก (rule — เข้า prompt ทุก shot ชนิดนี้)
                    </label>
                    <textarea
                      className={inputCls + " h-24 text-xs leading-relaxed"}
                      value={sbBlocks[t].rule}
                      onChange={(e) =>
                        setSbBlocks({ ...sbBlocks, [t]: { ...sbBlocks[t], rule: e.target.value } })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                      Negative (กันเพี้ยน — คั่นด้วย , )
                    </label>
                    <textarea
                      className={inputCls + " h-24 font-mono text-[11px] leading-relaxed"}
                      value={sbBlocks[t].negative}
                      onChange={(e) =>
                        setSbBlocks({ ...sbBlocks, [t]: { ...sbBlocks[t], negative: e.target.value } })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                  🚫 บรรทัด &ldquo;ซ่อนสินค้า&rdquo; — แทนที่ reference สินค้าเมื่อปิดการเห็นสินค้าใน shot
                </label>
                <textarea
                  className={inputCls + " h-20 text-xs leading-relaxed"}
                  value={sbBlocks.productHiddenLine}
                  onChange={(e) => setSbBlocks({ ...sbBlocks, productHiddenLine: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-zinc-500">
                  Negative เพิ่มเมื่อซ่อนสินค้า (กันสินค้าหลุดเข้าเฟรม)
                </label>
                <textarea
                  className={inputCls + " h-20 font-mono text-[11px] leading-relaxed"}
                  value={sbBlocks.productHiddenNegative}
                  onChange={(e) => setSbBlocks({ ...sbBlocks, productHiddenNegative: e.target.value })}
                />
              </div>
            </div>
          </div>
        ))}
      {/* ═══ ④ Domain Prompt — พรอมป์ต่อช่วงเรื่อง ═══ */}
      {tab === "domain" &&
        (!dpBlocks ? (
          <p className="text-sm text-zinc-500">กำลังโหลด...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-zinc-400">
                🎯 พลังของแต่ละช่วงเรื่อง (hook → reveal → demo → result → cta) — ผนวกเข้า prompt ของ shot
                ตาม section อัตโนมัติ · สวิตช์ที่ Hook = ค่าเริ่มต้นเห็น/ซ่อนสินค้าของ shot ช่วง hook ตอนแตก
                storyboard (สลับรายตัวได้ที่ Shot Board — ปุ่มที่ shot ชนะเสมอ)
              </p>
              <div className="flex shrink-0 gap-2">
                <button className={btnGhost} onClick={dpReset} disabled={dpBusy}>
                  <RotateCcw className="size-4" /> คืนค่าเริ่มต้น
                </button>
                <button className={btnPrimary} onClick={dpSave} disabled={dpBusy}>
                  <Save className="size-4" /> บันทึก
                </button>
              </div>
            </div>
            {dpMsg && <p className="text-sm text-emerald-400">{dpMsg}</p>}

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {SECTION_META.map((s) => (
                <div key={s.key} className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">{s.label}</p>
                      <p className="text-[11px] text-zinc-500">{s.desc}</p>
                    </div>
                    {s.key === "hook" && (
                      <button
                        type="button"
                        onClick={() =>
                          setDpBlocks({
                            ...dpBlocks,
                            hook: { ...dpBlocks.hook, showProduct: dpBlocks.hook.showProduct === false },
                          })
                        }
                        title="ค่าเริ่มต้นเห็น/ซ่อนสินค้าของ shot ช่วง hook ตอนแตก storyboard ใหม่"
                        className={`shrink-0 rounded-lg border px-2 py-0.5 text-[11px] transition-colors ${
                          dpBlocks.hook.showProduct === false
                            ? "border-rose-500/60 bg-rose-500/10 font-semibold text-rose-300"
                            : "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {dpBlocks.hook.showProduct === false ? "🚫 เริ่มต้น: ซ่อนสินค้า" : "📦 เริ่มต้น: เห็นสินค้า"}
                      </button>
                    )}
                  </div>
                  {s.key === "hook" ? (
                    (() => {
                      const showActive = dpBlocks.hook.showProduct !== false;
                      return (
                        <div className="space-y-2">
                          {/* ── ชุดเห็นสินค้า ── */}
                          <div
                            className={`space-y-1 rounded-lg border p-2 transition-opacity ${
                              showActive
                                ? "border-emerald-600/40"
                                : "pointer-events-none border-zinc-800 opacity-40"
                            }`}
                          >
                            <p className="text-[11px] font-semibold text-emerald-400">
                              📦 Hook เห็นสินค้า {showActive ? "· ทำงานอยู่" : "· 🔒 ปิดอยู่ (shot ที่เห็นสินค้ายังใช้ชุดนี้)"}
                            </p>
                            <textarea
                              disabled={!showActive}
                              className={inputCls + " h-24 text-xs leading-relaxed disabled:cursor-not-allowed"}
                              value={dpBlocks.hook.prompt}
                              onChange={(e) =>
                                setDpBlocks({ ...dpBlocks, hook: { ...dpBlocks.hook, prompt: e.target.value } })
                              }
                            />
                          </div>
                          {/* ── ชุดไม่เห็นสินค้า ── */}
                          <div
                            className={`space-y-1 rounded-lg border p-2 transition-opacity ${
                              !showActive
                                ? "border-rose-600/40"
                                : "pointer-events-none border-zinc-800 opacity-40"
                            }`}
                          >
                            <p className="text-[11px] font-semibold text-rose-400">
                              🚫 Hook ไม่เห็นสินค้า {!showActive ? "· ทำงานอยู่" : "· 🔒 ปิดอยู่ (shot ที่ซ่อนสินค้ายังใช้ชุดนี้)"}
                            </p>
                            <textarea
                              disabled={showActive}
                              placeholder="ว่าง = ใช้ชุดเห็นสินค้า"
                              className={inputCls + " h-24 text-xs leading-relaxed disabled:cursor-not-allowed"}
                              value={dpBlocks.hook.promptHidden ?? ""}
                              onChange={(e) =>
                                setDpBlocks({
                                  ...dpBlocks,
                                  hook: { ...dpBlocks.hook, promptHidden: e.target.value },
                                })
                              }
                            />
                          </div>
                        </div>
                      );
                    })()
                  ) : (
                    <textarea
                      className={inputCls + " h-28 text-xs leading-relaxed"}
                      value={dpBlocks[s.key].prompt}
                      onChange={(e) =>
                        setDpBlocks({ ...dpBlocks, [s.key]: { ...dpBlocks[s.key], prompt: e.target.value } })
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

    </AppShell>
  );
}

export default function PromptStudioPage() {
  return (
    <Suspense fallback={null}>
      <PromptStudioInner />
    </Suspense>
  );
}
