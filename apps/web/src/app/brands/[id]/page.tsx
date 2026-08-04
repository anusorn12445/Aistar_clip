"use client";

import { useCallback, useEffect, useState } from "react";
import { FilterSelect } from "@/components/ui/filter-select";
import Link from "next/link";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import {
  api,
  fetchBrand,
  type BrandColorToken,
  type BrandDetail,
  type BrandFontRow,
} from "@/lib/api";
import { formatFileSize, uploadAsset } from "@/lib/assets";
import { useAssetImage } from "@/lib/media";
import BrandAudienceSection from "./BrandAudienceSection";
import { X, ArrowLeft, Brain, Check, Palette, FileText, Image as ImageIcon } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-400";

// ── chip-list editor (พิมพ์แล้ว Enter เพื่อเพิ่ม) ──
function TagListEditor({
  label,
  hint,
  values,
  onChange,
  placeholder,
  tone = "amber",
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  tone?: "amber" | "red";
}) {
  const [draft, setDraft] = useState("");
  const chipCls =
    tone === "red"
      ? "bg-red-900/60 text-red-200"
      : "bg-amber-400/15 text-amber-200";
  const xCls = tone === "red" ? "text-red-300 hover:text-red-100" : "text-amber-300 hover:text-amber-100";

  function add() {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-sm font-medium text-zinc-200">{label}</label>
        {hint && <span className="text-[11px] text-zinc-500">{hint}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {values.map((v) => (
          <span key={v} className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs ${chipCls}`}>
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className={xCls}>
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder ?? "พิมพ์แล้วกด Enter"}
          className={`${inputCls} w-52`}
        />
      </div>
    </div>
  );
}

// ── platformGuides: key-value rows (preset + custom key) ──
const PLATFORM_PRESETS = ["facebook", "tiktok", "instagram"];

function PlatformGuidesEditor({
  value,
  onChange,
}: {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const [customKey, setCustomKey] = useState("");
  const keys = [...new Set([...PLATFORM_PRESETS, ...Object.keys(value)])];

  function setGuide(key: string, guide: string) {
    onChange({ ...value, [key]: guide });
  }
  function removeKey(key: string) {
    const next = { ...value };
    delete next[key];
    onChange(next);
  }
  function addCustom() {
    const k = customKey.trim().toLowerCase();
    if (k && !keys.includes(k)) onChange({ ...value, [k]: "" });
    setCustomKey("");
  }

  return (
    <div className="space-y-2">
      {keys.map((key) => (
        <div key={key} className="flex items-start gap-2">
          <span className="w-24 shrink-0 pt-2 text-sm capitalize text-zinc-300">{key}</span>
          <textarea
            value={value[key] ?? ""}
            onChange={(e) => setGuide(key, e.target.value)}
            rows={1}
            placeholder={`แนวการเขียนบน ${key}...`}
            className={inputCls}
          />
          {!PLATFORM_PRESETS.includes(key) && (
            <button
              type="button"
              onClick={() => removeKey(key)}
              className="pt-2 text-zinc-500 hover:text-red-400"
              title="ลบแพลตฟอร์ม"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={customKey}
          onChange={(e) => setCustomKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="+ แพลตฟอร์มอื่น เช่น youtube (Enter เพื่อเพิ่ม)"
          className={`${inputCls} w-72`}
        />
      </div>
    </div>
  );
}

// ── brandColors: ตาราง token / dark / light / usage ──
const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

function ColorTableEditor({
  rows,
  onChange,
}: {
  rows: BrandColorToken[];
  onChange: (next: BrandColorToken[]) => void;
}) {
  function set(i: number, patch: Partial<BrandColorToken>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  const pickerValue = (hex: string | null | undefined) =>
    hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#888888";

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
              <th className="pb-2 pr-3 font-medium">Token</th>
              <th className="pb-2 pr-3 font-medium">ค่า Dark (#hex)</th>
              <th className="pb-2 pr-3 font-medium">ค่า Light (#hex)</th>
              <th className="pb-2 pr-3 font-medium">ใช้ทำ</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="py-2 pr-3">
                  <input
                    value={r.token}
                    onChange={(e) => set(i, { token: e.target.value })}
                    placeholder="brand.primary"
                    className={`${inputCls} font-mono text-xs`}
                  />
                </td>
                {(["dark", "light"] as const).map((side) => (
                  <td key={side} className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={pickerValue(r[side])}
                        onChange={(e) => set(i, { [side]: e.target.value })}
                        className="h-8 w-9 shrink-0 cursor-pointer rounded border border-zinc-700 bg-zinc-900"
                        title={`เลือกสี ${side}`}
                      />
                      <input
                        value={r[side] ?? ""}
                        onChange={(e) => set(i, { [side]: e.target.value })}
                        placeholder="#34d399"
                        className={`${inputCls} w-24 font-mono text-xs ${
                          r[side] && !HEX_RE.test(r[side]!) ? "border-red-500/60" : ""
                        }`}
                      />
                    </div>
                  </td>
                ))}
                <td className="py-2 pr-3">
                  <input
                    value={r.usage ?? ""}
                    onChange={(e) => set(i, { usage: e.target.value })}
                    placeholder="สีหลัก — โลโก้ ปุ่ม"
                    className={inputCls}
                  />
                </td>
                <td className="py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
                    className="text-zinc-500 hover:text-red-400"
                    title="ลบแถว"
                  >
                    <X className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, { token: "", dark: "", light: "", usage: "" }])}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
      >
        + เพิ่มสี
      </button>
      <p className="text-[11px] text-zinc-500">ต้องมี token + ค่าสีอย่างน้อยหนึ่งฝั่ง (dark หรือ light) เป็น #hex</p>
    </div>
  );
}

// ── brandFonts: role / family / note ──
const FONT_ROLE_OPTIONS = [
  { value: "heading", label: "Heading — พาดหัว" },
  { value: "body", label: "Body — เนื้อหา" },
  { value: "display", label: "Display — สโลแกน" },
  { value: "other", label: "อื่นๆ" },
];

function FontRowsEditor({
  rows,
  onChange,
}: {
  rows: BrandFontRow[];
  onChange: (next: BrandFontRow[]) => void;
}) {
  function set(i: number, patch: Partial<BrandFontRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={r.role}
            onChange={(v) => set(i, { role: v })}
            className="w-44"
            options={FONT_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <input
            value={r.family}
            onChange={(e) => set(i, { family: e.target.value })}
            placeholder="เช่น Noto Sans Thai"
            className={`${inputCls} w-52`}
          />
          <input
            value={r.note ?? ""}
            onChange={(e) => set(i, { note: e.target.value })}
            placeholder="โน้ต เช่น ใช้กับสโลแกนเท่านั้น"
            className={`${inputCls} flex-1`}
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            className="text-zinc-500 hover:text-red-400"
            title="ลบแถว"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, { role: "heading", family: "", note: "" }])}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
      >
        + เพิ่มฟอนต์
      </button>
    </div>
  );
}

// ── โลโก้ต่อ version (icon/full/mono) — upload ผ่าน asset เดิม ──
const LOGO_SLOTS: { role: "logo_icon" | "logo_full" | "logo_mono"; label: string }[] = [
  { role: "logo_icon", label: "Icon" },
  { role: "logo_full", label: "Full" },
  { role: "logo_mono", label: "Mono" },
];

function LogoSlot({
  label,
  assetId,
  busy,
  onFile,
}: {
  label: string;
  assetId: string | null;
  busy: boolean;
  onFile: (f: File) => void;
}) {
  const url = useAssetImage(assetId);
  return (
    <label className="cursor-pointer text-center">
      <div className="flex h-24 items-center justify-center overflow-hidden rounded-xl border border-dashed border-zinc-700 bg-zinc-950 transition hover:border-amber-400/50">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`โลโก้ ${label}`} className="max-h-24 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-zinc-600">{busy ? "..." : "+ อัปโหลด"}</span>
        )}
      </div>
      <span className="mt-1.5 block text-[11px] text-zinc-500">{label}</span>
      <input
        type="file"
        accept="image/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

export default function BrandKnowledgePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [brand, setBrand] = useState<BrandDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // form state (เฉพาะ knowledge fields)
  const [brandStory, setBrandStory] = useState("");
  const [toneOfVoice, setToneOfVoice] = useState("");
  const [usp, setUsp] = useState("");
  const [visualIdentity, setVisualIdentity] = useState("");
  const [competitorsNote, setCompetitorsNote] = useState("");
  const [doList, setDoList] = useState<string[]>([]);
  const [dontList, setDontList] = useState<string[]>([]);
  const [keyMessages, setKeyMessages] = useState<string[]>([]);
  const [restrictedClaims, setRestrictedClaims] = useState<string[]>([]);

  // ── Brand Book เต็มรูป ──
  // Foundation
  const [mission, setMission] = useState("");
  const [vision, setVision] = useState("");
  const [coreValues, setCoreValues] = useState<string[]>([]);
  const [positioning, setPositioning] = useState("");
  const [personality, setPersonality] = useState("");
  const [tagline, setTagline] = useState("");
  const [taglineFont, setTaglineFont] = useState("");
  // Verbal
  const [wordBankUse, setWordBankUse] = useState<string[]>([]);
  const [wordBankAvoid, setWordBankAvoid] = useState<string[]>([]);
  const [exampleOnBrand, setExampleOnBrand] = useState("");
  const [exampleOffBrand, setExampleOffBrand] = useState("");
  const [platformGuides, setPlatformGuides] = useState<Record<string, string>>({});
  // Visual
  const [nameUsage, setNameUsage] = useState("");
  const [logoUsageNote, setLogoUsageNote] = useState("");
  const [moodNote, setMoodNote] = useState("");
  const [brandColors, setBrandColors] = useState<BrandColorToken[]>([]);
  const [brandFonts, setBrandFonts] = useState<BrandFontRow[]>([]);
  // Governance
  const [bookVersion, setBookVersion] = useState("");
  const [bookApproverName, setBookApproverName] = useState("");
  const [bookApproverContact, setBookApproverContact] = useState("");

  const load = useCallback(async () => {
    try {
      const b = await fetchBrand(id);
      setBrand(b);
      setBrandStory(b.brandStory ?? "");
      setToneOfVoice(b.toneOfVoice ?? "");
      setUsp(b.usp ?? "");
      setVisualIdentity(b.visualIdentity ?? "");
      setCompetitorsNote(b.competitorsNote ?? "");
      setDoList(b.doList ?? []);
      setDontList(b.dontList ?? []);
      setKeyMessages(b.keyMessages ?? []);
      setRestrictedClaims(b.restrictedClaims ?? []);
      // Brand Book เต็มรูป
      setMission(b.mission ?? "");
      setVision(b.vision ?? "");
      setCoreValues(b.coreValues ?? []);
      setPositioning(b.positioning ?? "");
      setPersonality(b.personality ?? "");
      setTagline(b.tagline ?? "");
      setTaglineFont(b.taglineFont ?? "");
      setWordBankUse(b.wordBankUse ?? []);
      setWordBankAvoid(b.wordBankAvoid ?? []);
      setExampleOnBrand(b.exampleOnBrand ?? "");
      setExampleOffBrand(b.exampleOffBrand ?? "");
      setPlatformGuides(b.platformGuides ?? {});
      setNameUsage(b.nameUsage ?? "");
      setLogoUsageNote(b.logoUsageNote ?? "");
      setMoodNote(b.moodNote ?? "");
      setBrandColors(Array.isArray(b.brandColors) ? b.brandColors : []);
      setBrandFonts(Array.isArray(b.brandFonts) ? b.brandFonts : []);
      setBookVersion(b.bookVersion ?? "");
      setBookApproverName(b.bookApproverName ?? "");
      setBookApproverContact(b.bookApproverContact ?? "");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดแบรนด์ไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      // ตัดแถวสี/ฟอนต์ที่ยังกรอกไม่ครบทิ้งก่อนส่ง (API ตรวจ shape เข้ม)
      const cleanColors = brandColors.filter(
        (c) => c.token.trim() && (c.dark?.trim() || c.light?.trim()),
      );
      const cleanFonts = brandFonts.filter((f) => f.family.trim());
      const cleanGuides = Object.fromEntries(
        Object.entries(platformGuides).filter(([, v]) => v.trim()),
      );
      await api(`/brands/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          brandStory,
          toneOfVoice,
          usp,
          visualIdentity,
          competitorsNote,
          doList,
          dontList,
          keyMessages,
          restrictedClaims,
          // Brand Book เต็มรูป
          mission,
          vision,
          coreValues,
          positioning,
          personality,
          tagline,
          taglineFont,
          wordBankUse,
          wordBankAvoid,
          exampleOnBrand,
          exampleOffBrand,
          platformGuides: cleanGuides,
          nameUsage,
          logoUsageNote,
          moodNote,
          brandColors: cleanColors,
          brandFonts: cleanFonts,
          bookVersion,
          bookApproverName,
          bookApproverContact,
        }),
      });
      setSavedAt(new Date().toLocaleTimeString("th-TH"));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  // โลโก้ล่าสุดต่อ role — brandBook.assets เรียง createdAt desc จาก API แล้ว
  const logoAssetIdFor = (role: string) =>
    brand?.brandBook.assets.find((a) => a.linkRole === role)?.assetId ?? null;

  async function onUploadLogo(role: "logo_icon" | "logo_full" | "logo_mono", file: File) {
    setSaving(true);
    setError(null);
    try {
      await uploadAsset(file, {
        assetType: "brand_logo",
        entityType: "brand",
        entityId: id,
        linkRole: role,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดโลโก้ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function onUploadBook(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      await uploadAsset(file, { assetType: "document", entityType: "brand", entityId: id, linkRole: "reference" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell
      title="ฐานความรู้แบรนด์"
      actions={
        <div className="flex items-center gap-3">
          {savedAt && <span className="text-xs text-emerald-400">บันทึกแล้ว {savedAt}</span>}
          <Link
            href={`/brands/${id}/book`}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ดู Brand Book
          </Link>
          <button
            onClick={save}
            disabled={saving || !brand}
            className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "บันทึกความรู้"}
          </button>
        </div>
      }
    >
      <div className="space-y-6 p-6">
        <div className="min-w-0">
          <Link href="/products" className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-amber-300">
            <ArrowLeft className="size-3.5" /> กลับไปสินค้า / แบรนด์
          </Link>
          <h1 className="flex items-center gap-2 truncate text-2xl font-bold text-zinc-100">
            <Brain className="size-5 shrink-0" /> {brand ? brand.name : "ฐานความรู้แบรนด์"}
          </h1>
          <p className="text-xs text-zinc-500">
            AI จะฉีดความรู้นี้เข้า prompt ทุกครั้งที่คิดคอนเทนต์/ทำสตอรีบอร์ด → output on-brand อัตโนมัติ
          </p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {!brand && !error && <p className="text-sm text-zinc-500">กำลังโหลด...</p>}

        {brand && (
          <>
            {/* 🏛️ แก่นแบรนด์ (Foundation) */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="text-lg font-semibold">แก่นแบรนด์ (Brand Foundation)</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Mission — พันธกิจ</label>
                  <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} placeholder="แบรนด์นี้อยู่เพื่ออะไร..." className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Vision — วิสัยทัศน์</label>
                  <textarea value={vision} onChange={(e) => setVision(e.target.value)} rows={2} placeholder="อยากไปถึงจุดไหน..." className={inputCls} />
                </div>
              </div>
              <TagListEditor
                label="Core Values — ค่านิยมหลัก"
                values={coreValues}
                onChange={setCoreValues}
                placeholder="เช่น จริงใจ"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">Positioning — เราคือใคร ให้ใคร ต่างยังไง</label>
                <textarea value={positioning} onChange={(e) => setPositioning(e.target.value)} rows={2} placeholder="สำหรับ[กลุ่มเป้าหมาย] แบรนด์คือ[อะไร] ต่างจากคู่แข่งตรง[อะไร]" className={inputCls} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">บุคลิกแบรนด์ (Archetype)</label>
                  <input value={personality} onChange={(e) => setPersonality(e.target.value)} placeholder="เช่น The Caregiver — เพื่อนสาวคนโต" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">Tagline / สโลแกน</label>
                  <input value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="เช่น Naturally Radiant, Always." className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">ฟอนต์สโลแกน (Google Font)</label>
                  <input value={taglineFont} onChange={(e) => setTaglineFont(e.target.value)} placeholder="เช่น Great Vibes" className={inputCls} />
                </div>
              </div>
            </section>

            {/* เรื่องราวแบรนด์ + โทนเสียง */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">เรื่องราวแบรนด์ (Brand Story)</label>
                <textarea
                  value={brandStory}
                  onChange={(e) => setBrandStory(e.target.value)}
                  rows={4}
                  placeholder="ตัวตน/ที่มา/ภารกิจของแบรนด์..."
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">โทนเสียง (Tone of Voice)</label>
                <input
                  value={toneOfVoice}
                  onChange={(e) => setToneOfVoice(e.target.value)}
                  placeholder="เช่น เป็นกันเอง สนุก จริงใจ"
                  className={inputCls}
                />
              </div>
            </section>

            {/* Do / Don't */}
            <section className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2">
              <TagListEditor
                label="Do — สิ่งที่ควรทำ/พูด"
                values={doList}
                onChange={setDoList}
                placeholder="เช่น พูดจริงใจ"
              />
              <TagListEditor
                label="Don't — สิ่งที่ห้ามทำ/พูด"
                values={dontList}
                onChange={setDontList}
                placeholder="เช่น อย่าโอเวอร์เคลม"
                tone="red"
              />
            </section>

            {/* 🗣️ ภาษาแบรนด์ (Verbal Identity) */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="text-lg font-semibold">ภาษาแบรนด์ (Verbal Identity)</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <TagListEditor
                  label="Word Bank — คำที่ใช้"
                  values={wordBankUse}
                  onChange={setWordBankUse}
                  placeholder="เช่น อ่อนโยน"
                />
                <TagListEditor
                  label="Word Bank — คำที่ห้ามใช้"
                  values={wordBankAvoid}
                  onChange={setWordBankAvoid}
                  placeholder="เช่น ขาวใน 7 วัน"
                  tone="red"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-sm font-medium text-zinc-200"><Check className="size-3.5" /> ตัวอย่างประโยค on-brand</label>
                  <textarea value={exampleOnBrand} onChange={(e) => setExampleOnBrand(e.target.value)} rows={3} placeholder="ประโยคที่เขียนถูกโทนแบรนด์..." className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-sm font-medium text-zinc-200"><X className="size-3.5" /> ตัวอย่างประโยค off-brand</label>
                  <textarea value={exampleOffBrand} onChange={(e) => setExampleOffBrand(e.target.value)} rows={3} placeholder="ประโยคแบบที่ห้ามเขียน..." className={inputCls} />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">แนวการเขียนต่อแพลตฟอร์ม</label>
                <PlatformGuidesEditor value={platformGuides} onChange={setPlatformGuides} />
              </div>
            </section>

            {/* สารหลัก + USP */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <TagListEditor
                label="สารหลัก (Key Messages)"
                hint="สารที่ต้องสื่อในทุกคอนเทนต์"
                values={keyMessages}
                onChange={setKeyMessages}
                placeholder="เช่น ผิวดีใน 7 วัน"
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">จุดขาย (USP)</label>
                <textarea
                  value={usp}
                  onChange={(e) => setUsp(e.target.value)}
                  rows={2}
                  placeholder="จุดที่ต่างจากคู่แข่ง..."
                  className={inputCls}
                />
              </div>
            </section>

            {/* คำ/เคลมต้องห้าม */}
            <section className="space-y-3 rounded-2xl border border-red-900/40 bg-zinc-900 p-6">
              <TagListEditor
                label="คำ/เคลมต้องห้าม (Restricted Claims)"
                hint="ระดับแบรนด์ — AI จะเลี่ยงคำเหล่านี้"
                values={restrictedClaims}
                onChange={setRestrictedClaims}
                placeholder="เช่น รักษาสิวหายขาด"
                tone="red"
              />
            </section>

            {/* อัตลักษณ์ภาพ + คู่แข่ง */}
            <section className="grid grid-cols-1 gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="flex items-center gap-1 text-sm font-medium text-zinc-200"><Palette className="size-3.5" /> อัตลักษณ์ภาพ (Visual Identity)</label>
                <textarea
                  value={visualIdentity}
                  onChange={(e) => setVisualIdentity(e.target.value)}
                  rows={3}
                  placeholder="สี / มู้ด / สไตล์..."
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">คู่แข่ง (Competitors)</label>
                <textarea
                  value={competitorsNote}
                  onChange={(e) => setCompetitorsNote(e.target.value)}
                  rows={3}
                  placeholder="คู่แข่งหลัก + จุดต่าง..."
                  className={inputCls}
                />
              </div>
            </section>

            {/* 🎨 อัตลักษณ์ภาพ (โครงใหม่จาก SRS §2) */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="flex items-center gap-1.5 text-lg font-semibold"><Palette className="size-4" /> อัตลักษณ์ภาพ (โครงสร้างใหม่)</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">ชื่อ & วิธีเขียนแบรนด์</label>
                <textarea value={nameUsage} onChange={(e) => setNameUsage(e.target.value)} rows={2} placeholder="เช่น เขียนตัวพิมพ์ใหญ่เสมอ เน้น RA ด้วยสีแบรนด์ · ไทยใช้ 'นารา'" className={inputCls} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">โลโก้ (แยก version)</label>
                <div className="grid grid-cols-3 gap-3 sm:max-w-md">
                  {LOGO_SLOTS.map((s) => (
                    <LogoSlot
                      key={s.role}
                      label={s.label}
                      assetId={logoAssetIdFor(s.role)}
                      busy={saving}
                      onFile={(f) => void onUploadLogo(s.role, f)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">กติกาการใช้โลโก้ (spec + misuse)</label>
                <textarea value={logoUsageNote} onChange={(e) => setLogoUsageNote(e.target.value)} rows={3} placeholder={"ใช้: โปรไฟล์ = Icon · ปก = Full\nห้าม: ยืด/บีบ เปลี่ยนสีนอก palette"} className={inputCls} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">สี Palette (token)</label>
                <ColorTableEditor rows={brandColors} onChange={setBrandColors} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">ฟอนต์ (แยกบทบาท)</label>
                <FontRowsEditor rows={brandFonts} onChange={setBrandFonts} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-200">มู้ดภาพ (สไตล์ภาพถ่าย/กราฟิก + do/don&apos;t)</label>
                <textarea value={moodNote} onChange={(e) => setMoodNote(e.target.value)} rows={2} placeholder="แสงธรรมชาติ ผิวจริง · ฟิลเตอร์ขาวเว่อร์" className={inputCls} />
              </div>
            </section>

            {/* กลุ่มเป้าหมาย */}
            <BrandAudienceSection brandId={id} />

            {/* 📋 การกำกับ (Governance) */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">การกำกับ (Governance)</h3>
                {brand.bookUpdatedAt && (
                  <span className="text-xs text-zinc-500">
                    เนื้อหา book อัปเดตล่าสุด{" "}
                    {new Date(brand.bookUpdatedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">เวอร์ชัน Brand Book</label>
                  <input value={bookVersion} onChange={(e) => setBookVersion(e.target.value)} placeholder="เช่น 2.1" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">เจ้าของแบรนด์ / ผู้อนุมัติ</label>
                  <input value={bookApproverName} onChange={(e) => setBookApproverName(e.target.value)} placeholder="เช่น คุณนารา วงศ์เภสัช" className={inputCls} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-200">ช่องทางติดต่อผู้อนุมัติ</label>
                  <input value={bookApproverContact} onChange={(e) => setBookApproverContact(e.target.value)} placeholder="อีเมล/LINE" className={inputCls} />
                </div>
              </div>
            </section>

            {/* Brand Book */}
            <section className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">
                  ไฟล์ Brand Book
                  <span className="ml-2 text-sm font-normal text-zinc-500">
                    ({brand.brandBook.count})
                  </span>
                </h3>
                <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
                  + อัปโหลดไฟล์
                  <input type="file" onChange={onUploadBook} className="hidden" disabled={saving} />
                </label>
              </div>
              {brand.brandBook.assets.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  ยังไม่มีไฟล์ brand book — อัปโหลด PDF/รูป guideline ได้ที่นี่
                </p>
              ) : (
                <ul className="space-y-2">
                  {brand.brandBook.assets.map((a) => (
                    <li
                      key={a.linkId}
                      className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2"
                    >
                      <span className="text-lg">{a.mimeType.startsWith("image/") ? <ImageIcon className="size-4" /> : <FileText className="size-4" />}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-zinc-100">{a.originalFilename}</p>
                        <p className="text-[11px] text-zinc-500">
                          {a.mimeType} · {formatFileSize(a.fileSize)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
