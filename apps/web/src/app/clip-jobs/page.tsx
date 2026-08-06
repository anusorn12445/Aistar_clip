"use client";

// 🎞️ Clip Jobs — UGC Studio v2.1 (สายผลิตคลิปรีวิว UGC ที่ CEO อนุมัติ)
// เลือกตัวถูกรีวิว (🛍️ สินค้า / ☕ ร้าน-สถานที่ / 🍜 อาหาร / 💻 ซอฟต์แวร์) → ① คอนเซปต์ → ② Storyboard → ③ 📦 ชุดพร้อมโพสต์
// v2.1: 💻 ซอฟต์แวร์/ฟีเจอร์ (GoSell) — ฉากหน้าจอเป็น "ใบสั่ง Capture" ไม่ใช่ AI gen
//       ความยาวคลิปเป็น step 8 วิ (บล็อก gen Veo/Kling) + ช่องเลือกสินค้าค้นหาแบบ combobox
// ?createFor=<productId> = เปิดฟอร์มสร้างพร้อมเลือกสินค้าให้เลย (ปุ่ม 🎞️ ทำคลิป จากหน้า Products)

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ArrowRight,
  ArrowUpRight,
  Clapperboard,
  ClipboardList,
  Drama,
  Film,
  Hand,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MessageSquare,
  Mic,
  Monitor,
  ShoppingBag,
  StickyNote,
  Tag,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import ProductBriefEditor from "@/components/ProductBriefEditor";
import ReviewVoicePicker, { REVIEW_PICK_MAX } from "@/components/ReviewVoicePicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken } from "@/lib/api";
import { Paged } from "@/lib/interaction";
import { Product, hasReviewBrief } from "@/lib/catalog";
import {
  CLIP_DURATION_DEFAULT,
  CLIP_DURATION_OPTIONS,
  CLIP_JOB_STATUS_LABEL,
  CLIP_PLATFORMS,
  CLIP_SUBJECT_LABEL,
  CTA_TYPE_LABEL,
  ClipJob,
  PLACE_CATEGORY_LABEL,
  SubjectBrief,
  clipSceneHint,
  createClipJob,
  fetchClipJobs,
} from "@/lib/clip-jobs";

interface ProductOption {
  id: string;
  displayCode: string;
  name: string;
  category: string | null;
  price?: number | null;
  salePrice?: number | null;
}

interface ClientOption {
  id: string;
  name: string;
}

function ClipJobsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const createFor = searchParams.get("createFor");

  const [data, setData] = useState<Paged<ClipJob> | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [fProduct, setFProduct] = useState("");
  // 🔎 ตัวกรองสินค้าแบบค้นหา (catalog ใหญ่ — ค้นฝั่ง server เหมือนฟอร์มสร้าง)
  const [fProductSel, setFProductSel] = useState<ProductOption | null>(null);
  const [fProductQ, setFProductQ] = useState("");
  const [fProductOpen, setFProductOpen] = useState(false);
  const [fProductResults, setFProductResults] = useState<ProductOption[]>([]);
  const [fProductSearching, setFProductSearching] = useState(false);
  const [fSubject, setFSubject] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // มุมมอง grid / list (จำค่าไว้ใน localStorage เหมือนหน้า Products)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem("clipJobs.viewMode");
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, []);
  // 📋 คลิก Clip ID = ก๊อปรหัสงาน (ไม่เปิดหน้างาน) — โชว์ ✓ แป๊บนึงแทน toast
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const copyCode = (e: React.MouseEvent, code: string) => {
    e.preventDefault();
    e.stopPropagation();
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopiedCode(code);
        setTimeout(() => setCopiedCode((c) => (c === code ? null : c)), 1500);
      })
      .catch(() => setCopiedCode(null)); // browser ไม่ให้สิทธิ์ clipboard — ไม่ต้องพัง console
  };

  const changeView = (mode: "grid" | "list") => {
    setViewMode(mode);
    localStorage.setItem("clipJobs.viewMode", mode);
  };

  // create form — subject 4 ประเภทตาม playbook (v2.1 เพิ่ม software)
  const [showCreate, setShowCreate] = useState(Boolean(createFor));
  const [creating, setCreating] = useState(false);
  const [cSubjectType, setCSubjectType] = useState<"product" | "place" | "food" | "software">("product");
  const [cProductQ, setCProductQ] = useState("");
  const [cProductId, setCProductId] = useState(createFor ?? "");
  const [cProductSel, setCProductSel] = useState<ProductOption | null>(null); // combobox: สินค้าที่เลือก (chip)
  const [cProductResults, setCProductResults] = useState<ProductOption[]>([]);
  const [cProductSearching, setCProductSearching] = useState(false);
  const [cBrief, setCBrief] = useState<SubjectBrief>({});
  const [cHighlights, setCHighlights] = useState("");
  // 📋 Review Brief ของสินค้าที่เลือก (โหลดตัวเต็มมาเช็คว่ามี brief หรือยัง) + โจทย์ระดับ job
  const [cProductFull, setCProductFull] = useState<Product | null>(null);
  // 🧴 รูปแบบสินค้า (แพ็กเกจ) — แก้+บันทึกได้ตรงนี้ ไม่ต้องไปหน้าสินค้า (Prompt ประเภทสินค้าจะตามรูปแบบนี้)
  const [cPackaging, setCPackaging] = useState("");
  const [cPackagingSaving, setCPackagingSaving] = useState(false);
  const [cPackOpen, setCPackOpen] = useState(false); // 🧴 dropdown แพ็กเกจ (ติ๊กหลายอัน)
  const [packagingOptions, setPackagingOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ items: { key: string; label: string }[] }>("/clip-jobs/packaging-prompts")
      .then((res) => setPackagingOptions(res.items.map((p) => ({ value: p.key, label: p.label }))))
      .catch(() => setPackagingOptions([]));
  }, []);
  useEffect(() => {
    setCPackaging(cProductFull?.packagingType ?? "");
  }, [cProductFull]);
  async function savePackaging() {
    if (!cProductFull) return;
    setCPackagingSaving(true);
    try {
      const updated = await api<Product>(`/products/${cProductFull.id}`, {
        method: "PATCH",
        body: JSON.stringify({ packagingType: cPackaging || null }),
      });
      setCProductFull(updated);
    } catch {
      /* แสดงผ่าน state เดิมพอ */
    } finally {
      setCPackagingSaving(false);
    }
  }
  // 🧴 เนื้อสัมผัส (texture) — บันทึกติดสินค้า → พรอมเนื้อสัมผัสต่อท้าย packaging
  const [cTexture, setCTexture] = useState("");
  const [cTextureSaving, setCTextureSaving] = useState(false);
  const [cTexOpen, setCTexOpen] = useState(false);
  const [textureOptions, setTextureOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api<{ items: { key: string; label: string }[] }>("/clip-jobs/texture-prompts")
      .then((res) => setTextureOptions(res.items.map((t) => ({ value: t.key, label: t.label }))))
      .catch(() => setTextureOptions([]));
  }, []);
  useEffect(() => {
    setCTexture((cProductFull as { textureType?: string } | null)?.textureType ?? "");
  }, [cProductFull]);
  async function saveTexture() {
    if (!cProductFull) return;
    setCTextureSaving(true);
    try {
      const updated = await api<Product>(`/products/${cProductFull.id}`, {
        method: "PATCH",
        body: JSON.stringify({ textureType: cTexture || null }),
      });
      setCProductFull(updated);
    } catch {
      /* เงียบ */
    } finally {
      setCTextureSaving(false);
    }
  }
  const [showBriefEditor, setShowBriefEditor] = useState(false);
  const [cAngle, setCAngle] = useState(""); // 🎬 มุมที่อยากตี
  const [cFormat, setCFormat] = useState(""); // รูปแบบคลิป (สูตร) — "" = อัตโนมัติตามหมวดสินค้า
  const [formatOptions, setFormatOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    // สูตรรูปแบบคลิป (product/*) จากระบบสูตรที่แก้ได้ — ใช้เป็นตัวเลือกต่อ job
    api<{ items: { key: string; label: string }[] }>("/clip-jobs/recipes")
      .then((res) =>
        setFormatOptions(
          res.items
            .filter((r) => r.key.startsWith("product/"))
            .map((r) => ({ value: r.key.split("/")[1], label: r.label })),
        ),
      )
      .catch(() => setFormatOptions([]));
  }, []);
  const [cPromo, setCPromo] = useState(""); // 🏷️ โปร/ดีลช่วงนี้
  const [cJobNote, setCJobNote] = useState(""); // 🗒️ โน้ตถึง AI
  const [cReviews, setCReviews] = useState<string[]>([]); // 💬 เสียงลูกค้าที่ติ๊กเลือก (สูงสุด 5)
  const [cSteps, setCSteps] = useState(""); // software: ขั้นตอน 3-5 (คั่น , หรือขึ้นบรรทัดใหม่)
  const [cCtaType, setCCtaType] = useState(""); // "" = smart default ตามประเภท
  const [cClientId, setCClientId] = useState("");
  const [cOutput, setCOutput] = useState<"video" | "stills">("video");
  const [cUseVoice, setCUseVoice] = useState(true); // 🔊 ใช้เสียงพูดไหม (false = คลิปไม่มีบทพูด)
  const [cPlatform, setCPlatform] = useState("tiktok");
  const [cDuration, setCDuration] = useState<number>(CLIP_DURATION_DEFAULT);
  const [cSceneLen, setCSceneLen] = useState<number>(8); // ⏱ ความยาวต่อฉาก 4/6/8 วิ — หน้าต่างพูดสเกลตาม (ฉาก-1 วิ)

  const reload = useCallback(() => {
    fetchClipJobs({
      productId: fProduct,
      subjectType: fSubject,
      status: fStatus,
      q,
      page: String(page),
    })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"));
  }, [fProduct, fSubject, fStatus, q, page]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    api<{ items: ClientOption[] }>("/clients")
      .then((r) => setClients(r.items ?? []))
      .catch(() => setClients([]));
  }, [router]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 🔎 ตัวกรองสินค้า (แถบ filter) — ค้นหาฝั่ง server debounce 350ms
  useEffect(() => {
    if (!fProductOpen || fProductSel) return;
    const q = fProductQ.trim();
    const timer = setTimeout(() => {
      setFProductSearching(true);
      api<Paged<ProductOption>>(`/products?status=active&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => setFProductResults(r.items))
        .catch(() => setFProductResults([]))
        .finally(() => setFProductSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [fProductQ, fProductOpen, fProductSel]);

  // 🔎 combobox สินค้า — catalog ใหญ่: ค้นหาฝั่ง server (GET /products?q=) debounce 350ms
  useEffect(() => {
    if (cSubjectType !== "product" || cProductSel) return;
    const q = cProductQ.trim();
    const timer = setTimeout(() => {
      setCProductSearching(true);
      api<Paged<ProductOption>>(`/products?status=active&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ""}`)
        .then((r) => setCProductResults(r.items))
        .catch(() => setCProductResults([]))
        .finally(() => setCProductSearching(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [cProductQ, cSubjectType, cProductSel]);

  // deep-link ?createFor=<productId> — โหลดสินค้ามาโชว์เป็น chip ให้เลย
  useEffect(() => {
    if (!createFor) return;
    api<ProductOption>(`/products/${createFor}`)
      .then((p) => {
        setCProductSel(p);
        setCProductId(p.id);
      })
      .catch(() => {});
  }, [createFor]);

  // เลือกสินค้าแล้ว → โหลดตัวเต็ม (มี reviewBrief) มาโชว์แผง 📋 ข้อมูลรีวิว
  useEffect(() => {
    setCReviews([]); // เปลี่ยนสินค้า = ล้างเสียงลูกค้าที่เคยติ๊ก (คลังรีวิวคนละสินค้า)
    if (!cProductId) {
      setCProductFull(null);
      setShowBriefEditor(false);
      return;
    }
    api<Product>(`/products/${cProductId}`)
      .then((p) => {
        setCProductFull(p);
        // ยังไม่มี brief → เปิดชวนกรอกทันที (มีแล้วพับไว้)
        setShowBriefEditor(!hasReviewBrief(p.reviewBrief));
      })
      .catch(() => setCProductFull(null));
  }, [cProductId]);

  // smart default CTA ตามประเภท/หมวด (ตรงกับ default ฝั่ง API) — software → signup
  const smartCta =
    cSubjectType === "product"
      ? "basket"
      : cSubjectType === "software"
        ? "signup"
        : cSubjectType === "place" && cBrief.category === "hotel"
          ? "booking"
          : "map";

  async function handleCreate() {
    if (cSubjectType === "product" && !cProductId) {
      setError("เลือกสินค้าก่อนสร้าง Clip Job");
      return;
    }
    if (cSubjectType !== "product" && !cBrief.name?.trim()) {
      setError(
        cSubjectType === "software"
          ? "กรอกชื่อฟีเจอร์ก่อนสร้าง Clip Job"
          : "กรอกชื่อร้าน/สถานที่/เมนูก่อนสร้าง Clip Job",
      );
      return;
    }
    if (cSubjectType === "place" && !cBrief.category) {
      setError("เลือกหมวดของร้าน/สถานที่ก่อน (คาเฟ่/เบเกอรี่/ร้านอาหาร/ที่พัก)");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const job = await createClipJob({
        subjectType: cSubjectType,
        ...(cSubjectType === "product"
          ? {
              productId: cProductId,
              // โจทย์ระดับ job (มุมที่ตี/โปรช่วงนี้/โน้ต/เสียงลูกค้า) — ข้อมูลถาวรอยู่ที่ Product.reviewBrief
              ...(cFormat || cAngle.trim() || cPromo.trim() || cJobNote.trim() || cReviews.length > 0
                ? {
                    subjectBrief: {
                      ...(cFormat ? { category: cFormat } : {}),
                      ...(cAngle.trim() ? { angle: cAngle.trim() } : {}),
                      ...(cPromo.trim() ? { promo: cPromo.trim() } : {}),
                      ...(cJobNote.trim() ? { note: cJobNote.trim() } : {}),
                      ...(cReviews.length > 0 ? { reviews: cReviews.slice(0, REVIEW_PICK_MAX) } : {}),
                    },
                  }
                : {}),
            }
          : {
              subjectBrief: {
                ...cBrief,
                name: cBrief.name?.trim(),
                highlights: cHighlights
                  .split(",")
                  .map((h) => h.trim())
                  .filter(Boolean),
                // software: ขั้นตอน 3-5 ขั้น (ฉาก screen จะ map ตามนี้)
                ...(cSubjectType === "software"
                  ? {
                      product: cBrief.product?.trim() || "GoSell",
                      steps: cSteps
                        .split(/[,\n]/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }
                  : {}),
              },
            }),
        ...(cCtaType ? { ctaType: cCtaType } : {}),
        ...(cClientId ? { clientId: cClientId } : {}),
        outputType: cOutput,
        useVoice: cUseVoice,
        platform: cPlatform,
        targetDurationSec: cDuration,
        sceneLenSec: cSceneLen, // ⏱
      });
      router.push(`/clip-jobs/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "สร้างไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  }

  const briefField = (
    label: string,
    key: keyof SubjectBrief,
    placeholder: string,
  ) => (
    <div>
      <label className="mb-1 block text-xs font-semibold text-zinc-400">{label}</label>
      <input
        value={(cBrief[key] as string) ?? ""}
        onChange={(e) => setCBrief((b) => ({ ...b, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
      />
    </div>
  );

  return (
    <AppShell
      title={showCreate ? "สร้าง Clip Job ใหม่" : "Clip Jobs — UGC Studio"}
      actions={
        showCreate ? (
          <button
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ← กลับไปดูรายการ
          </button>
        ) : (
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-900 hover:bg-amber-300"
          >
            + สร้าง Clip Job
          </button>
        )
      }
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

        {/* create form */}
        {showCreate && (
          <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900/70 p-4">
            <h2 className="text-sm font-semibold text-amber-300">
              <Film className="size-4" /> สร้าง Clip Job ใหม่ — เลือกตัวถูกรีวิว แล้วให้ AI เสนอคอนเซปต์ต่อ
            </h2>

            {/* subject type picker — v2.1: + 💻 ซอฟต์แวร์/ฟีเจอร์ */}
            <div className="flex flex-wrap gap-2">
              {(["product", "place", "food", "software"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setCSubjectType(t);
                    // software: ระบบ default = GoSell (แก้ได้)
                    if (t === "software") setCBrief((b) => ({ ...b, product: b.product || "GoSell" }));
                  }}
                  className={`flex-1 rounded-xl border px-2 py-2 text-sm ${
                    cSubjectType === t
                      ? "border-amber-400 bg-amber-400/10 font-semibold text-amber-300"
                      : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {CLIP_SUBJECT_LABEL[t].icon} {CLIP_SUBJECT_LABEL[t].label}
                </button>
              ))}
            </div>

            {cSubjectType === "product" ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">ค้นหาสินค้า *</label>
                  {cProductSel ? (
                    // เลือกแล้ว → chip + × ล้าง
                    <div className="flex items-center gap-2 rounded-lg border border-amber-400/50 bg-amber-400/10 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-sm text-amber-200">
                        <ShoppingBag className="size-4" /> {cProductSel.name}{" "}
                        <span className="font-mono text-[10px] text-amber-300/70">({cProductSel.displayCode})</span>
                        {cProductSel.price != null && (
                          <span className="ml-1 text-[11px] text-zinc-400">
                            {cProductSel.salePrice ?? cProductSel.price} บาท
                          </span>
                        )}
                      </span>
                      <button
                        onClick={() => {
                          setCProductSel(null);
                          setCProductId("");
                          setCProductQ("");
                        }}
                        title="เปลี่ยนสินค้า"
                        className="shrink-0 rounded px-1 text-sm text-amber-300 hover:bg-amber-400/20"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    // ยังไม่เลือก → combobox ค้นหาฝั่ง server (debounce 350ms)
                    <div>
                      <input
                        value={cProductQ}
                        onChange={(e) => setCProductQ(e.target.value)}
                        placeholder="พิมพ์ชื่อ/รหัสสินค้า... (catalog ใหญ่ — ค้นหาจาก server)"
                        className="mb-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                      />
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/70">
                        {cProductSearching ? (
                          <p className="px-2.5 py-2 text-[11px] text-zinc-500"><Loader2 className="size-4 animate-spin" /> กำลังค้นหา...</p>
                        ) : cProductResults.length === 0 ? (
                          <p className="px-2.5 py-2 text-[11px] text-zinc-600">
                            {cProductQ.trim() ? "ไม่พบสินค้า — ลองคำอื่น" : "พิมพ์เพื่อค้นหา หรือเลือกจากรายการล่าสุด"}
                          </p>
                        ) : (
                          cProductResults.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setCProductSel(p);
                                setCProductId(p.id);
                              }}
                              className="block w-full truncate px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
                            >
                              {p.name}{" "}
                              <span className="font-mono text-[10px] text-zinc-500">({p.displayCode})</span>
                              {p.price != null && (
                                <span className="ml-1 text-[10px] text-zinc-500">· {p.salePrice ?? p.price} บาท</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <p className="self-end text-[11px] text-zinc-500">
                  <Drama className="size-4" /> ตัวละคร / <Hand className="size-4" /> มือ / <MapPin className="size-4" /> Location / <Mic className="size-4" /> เสียง — ไปเลือกใน &ldquo;Resource จากระบบ&rdquo; ที่หน้า board หลังสร้าง
                </p>

                {/* 📋 Review Brief ของสินค้าที่เลือก — มีแล้วโชว์สรุปเขียว / ยังไม่มีเตือนเหลือง + กรอก inline */}
                {cProductSel && cProductFull && (
                  <div className="md:col-span-2 space-y-2">
                    {/* 🧴 รูปแบบสินค้า (แพ็กเกจ) — บันทึกติดตัวสินค้า → Prompt ประเภทสินค้าผนวกเข้าทุกฉากที่เห็นสินค้า */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-sky-700/50 bg-sky-950/30 px-3 py-2">
{/* 🧴 เมนูสไลด์แพ็กเกจ — กดเปิดแล้วติ๊กได้หลายอัน (เก็บ CSV ติดสินค้า) */}
                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setCPackOpen((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-200 hover:border-sky-600"
                        >
                          <span className="truncate">
                            {(() => {
                              const sel = cPackaging.split(",").map((s) => s.trim()).filter(Boolean);
                              if (sel.length === 0) return "— รูปแบบสินค้า (แพ็กเกจ) — เลือกได้หลายอัน";
                              const labels = sel.map((v) => packagingOptions.find((o) => o.value === v)?.label ?? v);
                              return labels.join(" + ");
                            })()}
                          </span>
                          <ChevronDown className={`size-4 shrink-0 text-zinc-500 transition-transform ${cPackOpen ? "rotate-180" : ""}`} />
                        </button>
                        {cPackOpen && (
                          <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl">
                            {(() => {
                              const sel = cPackaging.split(",").map((s) => s.trim()).filter(Boolean);
                              const BOTTLE_KEYS = ["screw_cap_bottle", "pump_bottle"];
                              const optBtn = (o: { value: string; label: string }) => {
                                const on = sel.includes(o.value);
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => {
                                      const next = on ? sel.filter((v) => v !== o.value) : [...sel, o.value];
                                      setCPackaging(next.join(","));
                                    }}
                                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${on ? "bg-sky-500/15 text-sky-200" : "text-zinc-300 hover:bg-zinc-800"}`}
                                  >
                                    <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-sky-400 bg-sky-500/30 text-sky-200" : "border-zinc-600"}`}>
                                      {on ? "✓" : ""}
                                    </span>
                                    {o.label}
                                  </button>
                                );
                              };
                              const bottles = packagingOptions.filter((o) => BOTTLE_KEYS.includes(o.value));
                              const others = packagingOptions.filter((o) => !BOTTLE_KEYS.includes(o.value));
                              const header = (t: string) => (
                                <div key={"h-" + t} className="px-2 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{t}</div>
                              );
                              return (
                                <>
                                  {bottles.length > 0 && header("ขวดแบบไหน")}
                                  {bottles.map(optBtn)}
                                  {others.length > 0 && header("แบบอื่น")}
                                  {others.map(optBtn)}
                                </>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={() => setCPackOpen(false)}
                              className="mt-1 w-full rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                            >
                              เสร็จแล้ว — ปิดเมนู
                            </button>
                          </div>
                        )}
                      </div>
                      {cPackaging !== (cProductFull.packagingType ?? "") && (
                        <>
                          <button
                            type="button"
                            onClick={() => void savePackaging()}
                            disabled={cPackagingSaving}
                            className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-400 disabled:opacity-50"
                          >
                            {cPackagingSaving ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCPackaging(cProductFull.packagingType ?? "")}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                          >
                            ยกเลิก
                          </button>
                        </>
                      )}
                    </div>
                    {/* 🧴 เนื้อสัมผัส — ต่อท้าย packaging (ฝาเกลียว/ขวดปั๊ม จะนำเข้าการโชว์เนื้อนี้) */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-700/40 bg-amber-950/20 px-3 py-2">
                      <div className="relative min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setCTexOpen((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-left text-sm text-zinc-200 hover:border-amber-600"
                        >
                          <span className="truncate">
                            {(() => {
                              const sel = cTexture.split(",").map((s) => s.trim()).filter(Boolean);
                              if (sel.length === 0) return "— เนื้อสัมผัส (เจล/ครีม/เม็ด/โฟม...) — เลือกได้หลายอัน";
                              return sel.map((v) => textureOptions.find((o) => o.value === v)?.label ?? v).join(" + ");
                            })()}
                          </span>
                          <ChevronDown className={`size-4 shrink-0 text-zinc-500 transition-transform ${cTexOpen ? "rotate-180" : ""}`} />
                        </button>
                        {cTexOpen && (
                          <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1.5 shadow-xl">
                            {textureOptions.map((o) => {
                              const sel = cTexture.split(",").map((s) => s.trim()).filter(Boolean);
                              const on = sel.includes(o.value);
                              return (
                                <button
                                  key={o.value}
                                  type="button"
                                  onClick={() => {
                                    const next = on ? sel.filter((v) => v !== o.value) : [...sel, o.value];
                                    setCTexture(next.join(","));
                                  }}
                                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${on ? "bg-amber-500/15 text-amber-200" : "text-zinc-300 hover:bg-zinc-800"}`}
                                >
                                  <span className={`inline-flex size-4 shrink-0 items-center justify-center rounded border text-[10px] ${on ? "border-amber-400 bg-amber-500/30 text-amber-200" : "border-zinc-600"}`}>
                                    {on ? "✓" : ""}
                                  </span>
                                  {o.label}
                                </button>
                              );
                            })}
                            <button
                              type="button"
                              onClick={() => setCTexOpen(false)}
                              className="mt-1 w-full rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                            >
                              เสร็จแล้ว — ปิดเมนู
                            </button>
                          </div>
                        )}
                      </div>
                      {cTexture !== ((cProductFull as { textureType?: string }).textureType ?? "") && (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveTexture()}
                            disabled={cTextureSaving}
                            className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                          >
                            {cTextureSaving ? "กำลังบันทึก..." : "บันทึก"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCTexture((cProductFull as { textureType?: string }).textureType ?? "")}
                            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                          >
                            ยกเลิก
                          </button>
                        </>
                      )}
                    </div>
                    {hasReviewBrief(cProductFull.reviewBrief) ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-700/60 bg-emerald-950/30 px-3 py-2">
                        <p className="min-w-0 flex-1 text-xs text-emerald-200">
                          <ClipboardList className="size-4" /> มีข้อมูลรีวิวแล้ว — จุดเด่น{" "}
                          {(cProductFull.reviewBrief?.highlights ?? []).filter((h) => h.trim()).length} ข้อ
                          · AI จะใช้ข้อมูลนี้คิดคอนเซปต์/บทให้ตรงของจริง
                        </p>
                        <button
                          onClick={() => setShowBriefEditor((v) => !v)}
                          className="shrink-0 rounded-lg border border-emerald-600/60 px-2 py-1 text-[11px] text-emerald-200 hover:bg-emerald-500/10"
                        >
                          {showBriefEditor ? "ซ่อน" : "ดู/แก้"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-950/30 px-3 py-2">
                        <p className="min-w-0 flex-1 text-xs text-amber-200">
                          <TriangleAlert className="size-4" /> สินค้านี้ยังไม่มีข้อมูลรีวิว — AI จะเดาจากชื่อ · กรอกตรงนี้ครั้งเดียว
                          เก็บที่ตัวสินค้า ใช้ทุก Clip Job
                        </p>
                        <button
                          onClick={() => setShowBriefEditor((v) => !v)}
                          className="shrink-0 rounded-lg bg-amber-400 px-2 py-1 text-[11px] font-semibold text-zinc-900 hover:bg-amber-300"
                        >
                          {showBriefEditor ? "ซ่อนฟอร์ม" : "กรอกเลย"}
                        </button>
                      </div>
                    )}
                    {showBriefEditor && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                        <ProductBriefEditor
                          productId={cProductFull.id}
                          initial={cProductFull.reviewBrief ?? null}
                          onSaved={(brief) =>
                            setCProductFull((cur) => (cur ? { ...cur, reviewBrief: brief } : cur))
                          }
                        />
                        <p className="mt-2 text-[11px] text-zinc-500">
                          <ImageIcon className="size-4" /> อยากแนบรูปสินค้าหลายรูป (ให้ AI อ่านฉลาก/ใช้เป็น reference) —{" "}
                          <Link
                            href={`/products?q=${encodeURIComponent(cProductSel.displayCode)}`}
                            className="inline-flex items-center gap-1 text-amber-300 underline decoration-dotted hover:text-amber-200"
                          >
                            เปิดคลังรูปที่หน้าสินค้า <ArrowUpRight className="size-4" />
                          </Link>
                        </p>
                      </div>
                    )}

                    {/* รูปแบบคลิป — เลือกสูตร (unbox/asmr/...) หรือปล่อยอัตโนมัติตามหมวดสินค้า */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                      <label className="mb-1 block text-xs font-semibold text-zinc-400">
                        🎞 รูปแบบคลิป (สูตรเล่าเรื่อง)
                      </label>
                      <FilterSelect
                        value={cFormat}
                        onChange={setCFormat}
                        options={[
                          { value: "", label: "อัตโนมัติตามหมวดสินค้า" },
                          ...formatOptions,
                        ]}
                        className="w-full"
                      />
                      <p className="mt-1 text-[11px] text-zinc-500">
                        สูตรกำหนดลำดับเล่า+จุดเน้นภาพ — แก้/เพิ่มสูตรได้ที่เมนู &ldquo;สูตรคลิป&rdquo;
                      </p>
                    </div>

                    {/* โจทย์ระดับ job — เฉพาะคลิปนี้ (ไม่เก็บที่ตัวสินค้า) */}
                    <div className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 md:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-zinc-400">
                          <Clapperboard className="size-4" /> มุมที่อยากตี (เฉพาะคลิปนี้)
                        </label>
                        <input
                          value={cAngle}
                          onChange={(e) => setCAngle(e.target.value)}
                          placeholder="เช่น เน้นใช้ก่อนออกแดด"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-zinc-400">
                          <Tag className="size-4" /> โปร/ดีลช่วงนี้
                        </label>
                        <input
                          value={cPromo}
                          onChange={(e) => setCPromo(e.target.value)}
                          placeholder="เช่น 9.9 ลดเหลือ 199.-"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-zinc-400">
                          <StickyNote className="size-4" /> โน้ตถึง AI
                        </label>
                        <input
                          value={cJobNote}
                          onChange={(e) => setCJobNote(e.target.value)}
                          placeholder="เช่น อยากได้โทนตลก ๆ"
                          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                        />
                      </div>
                    </div>

                    {/* 💬 เสียงลูกค้าจริง 4-5 ดาว — ติ๊กเลือกสูงสุด 5 เข้า prompt (AI paraphrase) */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                      <p className="mb-2 text-xs font-semibold text-zinc-400">
                        <MessageSquare className="size-4" /> เลือกเสียงลูกค้า (สูงสุด {REVIEW_PICK_MAX}){" "}
                        <span className="font-normal text-zinc-500">
                          — รีวิวจริง 4-5 ดาวจากคลังของสินค้านี้ ให้ AI ใช้เป็น hook/บทพูด
                        </span>
                      </p>
                      <ReviewVoicePicker
                        productId={cProductSel.id}
                        productCode={cProductSel.displayCode}
                        selected={cReviews}
                        onChange={setCReviews}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : cSubjectType === "software" ? (
              // 💻 v2.1 — ฟีเจอร์ SaaS (GoSell): ฉากหน้าจอจะเป็น "ใบสั่ง Capture" ให้ทีมอัดจริง ไม่ใช่ AI gen
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {briefField("ชื่อฟีเจอร์ *", "name", "เช่น พิมพ์ใบปะหน้า 100 ออเดอร์ในคลิกเดียว")}
                {briefField("ระบบ", "product", 'เช่น "GoSell"')}
                {briefField("Pain point (ปัญหาที่ฟีเจอร์นี้แก้)", "painPoint", "เช่น แพ็คของทีละออเดอร์ พิมพ์ใบปะหน้าทีละใบ เสียเวลาเป็นชั่วโมง")}
                {briefField("ผลลัพธ์ตัวเลข", "resultMetric", "เช่น แพ็คออเดอร์เร็วขึ้น 3 เท่า")}
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">
                    ขั้นตอนใช้งาน 3-5 ขั้น (คั่นด้วย , หรือขึ้นบรรทัดใหม่) — ฉาก <Monitor className="inline size-4" /> หน้าจอจะเดโมตามนี้
                  </label>
                  <textarea
                    value={cSteps}
                    onChange={(e) => setCSteps(e.target.value)}
                    rows={3}
                    placeholder={"เปิดหน้าออเดอร์ > รอแพ็ค\nติ๊กเลือกทั้งหมด แล้วกดพิมพ์ใบปะหน้า\nได้ PDF ใบปะหน้าทุกออเดอร์ในไฟล์เดียว"}
                    className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
                {briefField("แพ็กเกจราคา", "pricing", "เช่น เริ่มต้นฟรี / โปร 590 บาท/เดือน")}
                {briefField("ลิงก์สมัคร", "signupUrl", "https://gosell.example/signup")}
                <p className="md:col-span-2 rounded-lg border border-dashed border-amber-400/40 bg-amber-400/5 px-2.5 py-1.5 text-[11px] text-amber-300/90">
                  <Monitor className="inline size-4" /> ฉากหน้าจอของ job นี้จะออกมาเป็น &ldquo;ใบสั่ง Capture&rdquo; ให้ทีมอัด screen record จากระบบจริง —
                  ห้ามใช้ AI gen UI (ตัวหนังสือเพี้ยน ทำลายความน่าเชื่อ) · ฉากคน/มือยัง AI gen ตามปกติ
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {briefField(
                  cSubjectType === "place" ? "ชื่อร้าน/สถานที่ *" : "ชื่อเมนู/ร้าน *",
                  "name",
                  cSubjectType === "place" ? "เช่น คาเฟ่กลางสวนบ้านนา" : "เช่น ก๋วยเตี๋ยวเรือน้ำตกหม้อไฟ",
                )}
                {cSubjectType === "place" ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-zinc-400">หมวด *</label>
                    <FilterSelect
                      value={cBrief.category ?? ""}
                      onChange={(v) => setCBrief((b) => ({ ...b, category: v }))}
                      options={[
                        { value: "", label: "— เลือกหมวด —" },
                        ...Object.entries(PLACE_CATEGORY_LABEL).map(([k, v]) => ({
                          value: k,
                          label: v,
                        })),
                      ]}
                      className="w-full"
                    />
                  </div>
                ) : (
                  briefField("ร้าน/ที่มาของเมนู", "note", "เช่น ร้านป้าแดง ตลาดเช้า")
                )}
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-zinc-400">
                    จุดเด่น (คั่นด้วย , )
                  </label>
                  <input
                    value={cHighlights}
                    onChange={(e) => setCHighlights(e.target.value)}
                    placeholder="เช่น ลาเต้อาร์ตสวย, มุมถ่ายรูปเยอะ, ขนมโฮมเมด"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
                  />
                </div>
                {briefField("บรรยากาศ/vibe", "vibe", "เช่น อบอุ่น มินิมอล กลางสวน")}
                {briefField("ช่วงราคา", "priceRange", "เช่น 45-120 บาท / คืนละ 1,290")}
                {briefField("ที่อยู่/พิกัด", "address", "เช่น ถ.นิมมาน ซ.9 เชียงใหม่")}
                {briefField("ลิงก์แผนที่", "mapUrl", "https://maps.app.goo.gl/...")}
                {briefField("เวลาเปิด", "openHours", "เช่น 08:00-17:00 หยุดวันพุธ")}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">CTA ปิดคลิป</label>
                <FilterSelect
                  value={cCtaType}
                  onChange={setCCtaType}
                  options={[
                    { value: "", label: `อัตโนมัติ — ${CTA_TYPE_LABEL[smartCta]?.label ?? ""}` },
                    ...Object.entries(CTA_TYPE_LABEL).map(([k, v]) => ({ value: k, label: v.label })),
                  ]}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">ลูกค้า/ผู้จ้าง (ไม่บังคับ)</label>
                <FilterSelect
                  value={cClientId}
                  onChange={setCClientId}
                  options={[
                    { value: "", label: "— ไม่ระบุ —" },
                    ...clients.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">แพลตฟอร์ม</label>
                <FilterSelect
                  value={cPlatform}
                  onChange={setCPlatform}
                  options={CLIP_PLATFORMS.map((p) => ({ value: p, label: p }))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">ผลลัพธ์</label>
                <FilterSelect
                  value={cOutput}
                  onChange={(v) => setCOutput(v as "video" | "stills")}
                  options={[
                    { value: "video", label: "วิดีโอ (ภาพนิ่ง → motion)" },
                    { value: "stills", label: "ชุดภาพนิ่งอย่างเดียว" },
                  ]}
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">🔊 เสียงพูด</label>
                <FilterSelect
                  value={cUseVoice ? "on" : "off"}
                  onChange={(v) => setCUseVoice(v === "on")}
                  options={[
                    { value: "on", label: "มีบทพูด (พรีเซนเตอร์/พากย์)" },
                    { value: "off", label: "ไม่มีเสียงพูด (ambient อย่างเดียว)" },
                  ]}
                  className="w-full"
                />
              </div>
              <div className="col-span-2 md:col-span-4">
                {/* ⏱ ความยาวต่อฉาก — หน้าต่างพูดสเกลตาม (ฉาก-1 วิ) ไม่มีเดดแอร์ยาว */}
                <label className="mb-1 block text-xs font-semibold text-zinc-400">
                  ความยาวต่อฉาก{" "}
                  <span className="font-normal text-zinc-500">
                    (พูดได้ ~{cSceneLen - 1} วิ/ฉาก ≈ {Math.round((cSceneLen - 1) * 3.5)} พยางค์ — เหลือหางแอ็กชัน ~1 วิ ไม่มีเดดแอร์)
                  </span>
                </label>
                <div className="mb-2 flex gap-1.5">
                  {[4, 6, 8].map((len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => {
                        setCSceneLen(len);
                        const scenes = Math.max(2, Math.round(cDuration / cSceneLen));
                        setCDuration(len * scenes);
                      }}
                      className={
                        cSceneLen === len
                          ? "rounded-full border border-amber-400 bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300"
                          : "rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-amber-500"
                      }
                    >
                      {len} วิ/ฉาก
                    </button>
                  ))}
                </div>
                <label className="mb-1 block text-xs font-semibold text-zinc-400">
                  ความยาวเป้าหมายทั้งคลิป{" "}
                  <span className="font-normal text-zinc-500">({Math.max(1, Math.round(cDuration / cSceneLen))} ฉาก × {cSceneLen} วิ)</span>
                </label>
                <FilterSelect
                  value={String(cDuration)}
                  onChange={(v) => setCDuration(Number(v))}
                  options={Array.from({ length: 10 }, (_, i) => (i + 1) * cSceneLen).map((d) => ({
                    value: String(d),
                    label: `${d} วิ (${Math.round(d / cSceneLen)} ฉาก × ${cSceneLen} วิ)`,
                  }))}
                  className="w-full md:w-64"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 disabled:opacity-50"
              >
                {creating ? "กำลังสร้าง..." : "สร้างแล้วไปขอคอนเซปต์"}
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        )}

        {!showCreate && (<>
        {/* filters */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่อ/รหัส..."
            className="w-52 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
          />
          <FilterSelect
            value={fSubject}
            onChange={(v) => {
              setFSubject(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "ทุกประเภท" },
              ...Object.entries(CLIP_SUBJECT_LABEL).map(([k, v]) => ({
                value: k,
                label: `${v.icon} ${v.label}`,
              })),
            ]}
          />
          {/* 🔎 กรองตามสินค้า — พิมพ์ค้นหา (catalog ใหญ่ dropdown ธรรมดาไม่ไหว) */}
          <div className="relative">
            {fProductSel ? (
              <div className="flex max-w-60 items-center gap-1 rounded-lg border border-amber-400/50 bg-amber-400/10 px-2 py-1.5 text-sm">
                <span className="min-w-0 truncate text-amber-200" title={fProductSel.name}>
                  <ShoppingBag className="size-4" /> {fProductSel.name}
                </span>
                <button
                  onClick={() => {
                    setFProductSel(null);
                    setFProduct("");
                    setFProductQ("");
                    setPage(1);
                  }}
                  title="ล้างตัวกรองสินค้า"
                  className="shrink-0 rounded px-1 text-amber-300 hover:bg-amber-400/20"
                >
                  ×
                </button>
              </div>
            ) : (
              <input
                value={fProductQ}
                onChange={(e) => {
                  setFProductQ(e.target.value);
                  setFProductOpen(true);
                }}
                onFocus={() => setFProductOpen(true)}
                onBlur={() => setTimeout(() => setFProductOpen(false), 150)}
                placeholder="กรองตามสินค้า..."
                className="w-44 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none focus:border-amber-400"
              />
            )}
            {fProductOpen && !fProductSel && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950 shadow-xl shadow-black/50">
                {fProductSearching ? (
                  <p className="px-2.5 py-2 text-[11px] text-zinc-500"><Loader2 className="size-4 animate-spin" /> กำลังค้นหา...</p>
                ) : fProductResults.length === 0 ? (
                  <p className="px-2.5 py-2 text-[11px] text-zinc-500">ไม่พบสินค้า</p>
                ) : (
                  fProductResults.map((p) => (
                    <button
                      key={p.id}
                      onMouseDown={() => {
                        setFProductSel(p);
                        setFProduct(p.id);
                        setPage(1);
                      }}
                      className="block w-full truncate px-2.5 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
                    >
                      {p.name} <span className="font-mono text-[10px] text-zinc-500">({p.displayCode})</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <FilterSelect
            value={fStatus}
            onChange={(v) => {
              setFStatus(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "ทุกสถานะ (ยกเว้นเก็บถาวร)" },
              ...Object.entries(CLIP_JOB_STATUS_LABEL).map(([k, v]) => ({
                value: k,
                label: v.label,
              })),
            ]}
          />
          {/* สลับมุมมอง grid / list */}
          <div className="ml-auto flex overflow-hidden rounded-lg border border-zinc-700">
            <button
              onClick={() => changeView("grid")}
              title="มุมมองการ์ด"
              className={`px-3 py-1.5 text-sm ${
                viewMode === "grid" ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <LayoutGrid className="inline size-4" /> การ์ด
            </button>
            <button
              onClick={() => changeView("list")}
              title="มุมมองรายการ"
              className={`border-l border-zinc-700 px-3 py-1.5 text-sm ${
                viewMode === "list" ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <List className="inline size-4" /> รายการ
            </button>
          </div>
        </div>

        {/* card grid */}
        {data && data.items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
            <p className="text-3xl"><Film className="mx-auto size-10" /></p>
            <p className="mt-2 text-sm">ยังไม่มี Clip Job — กด &ldquo;+ สร้าง Clip Job&rdquo; หรือกด <Film className="inline size-4" /> ทำคลิป จากหน้า Products</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-zinc-400">
                  <th className="px-3 py-2.5 font-semibold">รหัส</th>
                  <th className="px-3 py-2.5 font-semibold">ชื่องาน</th>
                  <th className="px-3 py-2.5 font-semibold">เรื่องที่รีวิว</th>
                  <th className="px-3 py-2.5 font-semibold">แพลตฟอร์ม</th>
                  <th className="px-3 py-2.5 font-semibold">Shots</th>
                  <th className="px-3 py-2.5 font-semibold">สถานะ</th>
                  <th className="px-3 py-2.5 font-semibold">อัปเดต</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((j) => {
                  const st = CLIP_JOB_STATUS_LABEL[j.status] ?? { label: j.status, cls: "bg-zinc-700 text-zinc-200" };
                  const subj = CLIP_SUBJECT_LABEL[j.subjectType] ?? { label: j.subjectType, icon: "🎬" };
                  return (
                    <tr
                      key={j.id}
                      onClick={() => router.push(`/clip-jobs/${j.id}`)}
                      className="cursor-pointer border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/50"
                    >
                      <td className="px-3 py-2 font-mono text-xs text-amber-300">
                        <button
                          type="button"
                          onClick={(e) => copyCode(e, j.displayCode)}
                          title="คลิกเพื่อคัดลอก Clip ID"
                          className="rounded px-1 hover:bg-amber-400/10 hover:underline"
                        >
                          {copiedCode === j.displayCode ? "ก๊อปแล้ว" : j.displayCode}
                        </button>
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-2 font-medium text-zinc-100" title={j.name}>
                        {j.name}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-zinc-400">
                        {subj.icon} {j.subject?.name ?? j.product?.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{j.platform ?? "—"}</td>
                      <td className="px-3 py-2 text-zinc-300">
                        <span className="tabular-nums">
                          {j.doneCount ?? 0}/{j.shotCount ?? 0}
                        </span>
                        {typeof j.shotCount === "number" && j.shotCount > 0 && (
                          <span className="ml-2 inline-block h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800 align-middle">
                            <span
                              className="block h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.round(((j.doneCount ?? 0) / j.shotCount) * 100)}%` }}
                            />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                        {new Date(j.updatedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {data?.items.map((j) => {
              const st = CLIP_JOB_STATUS_LABEL[j.status] ?? { label: j.status, cls: "bg-zinc-700 text-zinc-200" };
              const subj = CLIP_SUBJECT_LABEL[j.subjectType] ?? { label: j.subjectType, icon: "🎬" };
              return (
                <Link
                  key={j.id}
                  href={`/clip-jobs/${j.id}`}
                  className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-xl hover:shadow-black/40"
                >
                  <CoverImage
                    assetId={j.thumbnailAssetId}
                    entityType={j.productId ? "product" : undefined}
                    entityId={j.productId ?? undefined}
                    name={j.name}
                    aspect="aspect-square"
                    className="rounded-none"
                  >
                    <button
                      type="button"
                      onClick={(e) => copyCode(e, j.displayCode)}
                      title="คลิกเพื่อคัดลอก Clip ID"
                      className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 backdrop-blur-sm hover:bg-black/80 hover:underline"
                    >
                      {copiedCode === j.displayCode ? "ก๊อปแล้ว" : j.displayCode}
                    </button>
                    <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>
                      {st.label}
                    </span>
                    <span
                      className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs backdrop-blur-sm"
                      title={subj.label}
                    >
                      {subj.icon}
                    </span>
                  </CoverImage>
                  <div className="space-y-1 px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-zinc-100" title={j.name}>
                      {j.name}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {subj.icon} {j.subject?.name ?? j.product?.name ?? "—"}
                      {j.platform ? ` · ${j.platform}` : ""}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span>
                        {j.doneCount ?? 0}/{j.shotCount ?? 0} shots
                      </span>
                      {typeof j.shotCount === "number" && j.shotCount > 0 && (
                        <span className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
                          <span
                            className="block h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.round(((j.doneCount ?? 0) / j.shotCount) * 100)}%` }}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* pagination */}
        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button
              disabled={data.page <= 1}
              onClick={() => setPage(data.page - 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> ก่อนหน้า
            </button>
            <span>
              หน้า {data.page} / {Math.ceil(data.total / data.pageSize)}
            </span>
            <button
              disabled={data.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setPage(data.page + 1)}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              ถัดไป <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {data && <p className="text-xs text-zinc-500">ทั้งหมด {data.total} รายการ</p>}
        </>)}
      </div>
    </AppShell>
  );
}

export default function ClipJobsPage() {
  return (
    <Suspense fallback={null}>
      <ClipJobsInner />
    </Suspense>
  );
}
