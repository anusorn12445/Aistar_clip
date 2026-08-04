"use client";

// หน้าแชร์ Brand Book ให้ลูกค้า (read-only, ไม่ต้อง login) — /share/brand-book/[token]
// เลย์เอาต์เดียวกับ /brands/[id]/book (hero + TOC + 8 หมวด) แต่:
// - ไม่มี AppShell / ปุ่มแก้ไข / อัปโหลด / ลิงก์ภายใน
// - รูปโหลดผ่าน public asset URL (ไม่ต้องแนบ token auth) เป็น <img src> ตรงๆ
// - หมวดที่ยังไม่กรอกถูกซ่อนทั้งหมด (ลูกค้าไม่ต้องเห็น "ยังไม่กรอก")
// - พิมพ์/Save PDF ได้ด้วย print stylesheet ชุดเดียวกับหน้าภายใน
//
// ตัดสินใจ: เขียนหน้าแบบ self-contained แทนการ extract component ร่วมจากหน้าภายใน —
// หน้าภายในผูกกับ upload/EmptyHint/useAssetImage (auth fetch) การ parameterize
// ทั้งหมดจะแตะไฟล์เดิมเยอะกว่าประโยชน์ที่ได้

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  BRAND_BOOK_PRINT_CSS,
  fetchPublicBrandBook,
  publicAssetUrl,
  ShareLinkInvalidError,
  type PublicBrandBook,
} from "@/lib/brand-book";
import { type BrandBookAsset } from "@/lib/api";
import { gradientFor, initialOf } from "@/lib/media";
import { Check, X, Image as ImageIcon, FileText } from "lucide-react";

const SECTIONS = [
  { id: "foundation", label: "แก่นแบรนด์" },
  { id: "story", label: "เรื่องราว & USP" },
  { id: "verbal", label: "ภาษาแบรนด์" },
  { id: "visual", label: "อัตลักษณ์ภาพ" },
  { id: "audience", label: "กลุ่มเป้าหมาย" },
  { id: "claims", label: "เคลมต้องห้าม" },
  { id: "templates", label: "เทมเพลต" },
  { id: "governance", label: "การกำกับ" },
] as const;

const FONT_ROLE_LABEL: Record<string, string> = {
  heading: "พาดหัว",
  body: "เนื้อหา",
  display: "ดิสเพลย์ / สโลแกน",
  other: "อื่นๆ",
};

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  line: "LINE",
  x: "X (Twitter)",
};

const filled = (v: string | null | undefined) => !!v && v.trim().length > 0;
const filledArr = (v: string[] | null | undefined) => !!v && v.length > 0;

const card = "print-card rounded-xl border border-zinc-800 bg-zinc-900 p-5";
const label = "text-xs font-semibold uppercase tracking-wider text-zinc-500";

// โหลด Google Font แบบ dynamic เฉพาะเมื่อแบรนด์ระบุ taglineFont (mirror หน้าภายใน)
function useGoogleFont(family: string | null | undefined) {
  useEffect(() => {
    const fam = family?.trim();
    if (!fam) return;
    const key = `brandbook-font-${fam}`;
    if (document.querySelector(`link[data-font-key="${CSS.escape(key)}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%20/g, "+")}:wght@400;700&display=swap`;
    link.setAttribute("data-font-key", key);
    document.head.appendChild(link);
  }, [family]);
}

// รูปจาก public asset URL — ไม่ต้อง auth header, ใช้ <img src> ตรงๆ
function PublicAssetImage({
  token,
  asset,
  alt,
  className,
}: {
  token: string;
  asset: BrandBookAsset;
  alt: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!asset.mimeType.startsWith("image/") || broken) {
    return (
      <div className={`flex items-center justify-center text-2xl ${className ?? ""}`}>
        {asset.mimeType.startsWith("image/") ? <ImageIcon className="size-6" /> : <FileText className="size-6" />}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={publicAssetUrl(token, asset.assetId)}
      alt={alt}
      onError={() => setBroken(true)}
      className={`object-contain ${className ?? ""}`}
    />
  );
}

function SectionHeading({ id, title, sub }: { id: string; title: string; sub?: string }) {
  return (
    <h2 id={`h-${id}`} className="text-xl font-semibold text-zinc-100">
      {title} {sub && <span className="text-sm font-normal text-zinc-500">{sub}</span>}
    </h2>
  );
}

export default function PublicBrandBookPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [book, setBook] = useState<PublicBrandBook | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>("foundation");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicBrandBook(token)
      .then((b) => {
        if (!cancelled) setBook(b);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ShareLinkInvalidError) setInvalid(true);
        else setError(err instanceof Error ? err.message : "โหลด Brand Book ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useGoogleFont(book?.taglineFont);

  useEffect(() => {
    document.title = book?.name ? `Brand Book — ${book.name}` : "Brand Book";
  }, [book?.name]);

  // scrollspy — ไฮไลต์หมวดบนสุดที่โผล่ใน viewport (mirror หน้าภายใน)
  useEffect(() => {
    if (!book) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -60% 0px" },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [book]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1600);
  }

  async function copyHex(hex: string) {
    try {
      await navigator.clipboard.writeText(hex);
      showToast(`ก๊อป ${hex} แล้ว`);
    } catch {
      showToast("ก๊อปไม่สำเร็จ");
    }
  }

  // ── 404 / ลิงก์ถูกปิด ──
  if (invalid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
        <div className="max-w-md text-center">
          <h1 className="mt-4 text-xl font-semibold">ลิงก์นี้ถูกปิดหรือไม่ถูกต้อง</h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            ลิงก์แชร์ Brand Book อาจถูกปิดโดยเจ้าของแบรนด์ หรือถูกสร้างใหม่แล้ว —
            กรุณาติดต่อผู้ที่ส่งลิงก์นี้ให้คุณเพื่อขอลิงก์ล่าสุด
          </p>
          <p className="mt-8 text-xs text-zinc-600">Brand Book · จัดทำด้วย AISTAR Talent OS</p>
        </div>
      </div>
    );
  }

  const b = book;
  const platformGuides = Object.entries(b?.platformGuides ?? {}).filter(
    ([, v]) => typeof v === "string" && v.trim(),
  );
  const brandColors = (b?.brandColors ?? []).filter((c) => c?.token);
  const brandFonts = (b?.brandFonts ?? []).filter((f) => f?.family);
  const hasFoundation =
    !!b &&
    (filled(b.mission) || filled(b.vision) || filledArr(b.coreValues) || filled(b.positioning) || filled(b.personality));
  const hasStory = !!b && (filled(b.brandStory) || filled(b.usp));
  const hasVerbal =
    !!b &&
    (filled(b.toneOfVoice) ||
      filledArr(b.wordBankUse) ||
      filledArr(b.wordBankAvoid) ||
      filled(b.exampleOnBrand) ||
      filled(b.exampleOffBrand) ||
      platformGuides.length > 0);
  const logoAssets = b
    ? ([
        ["Icon", b.assets.logos.icon],
        ["Full", b.assets.logos.full],
        ["Mono", b.assets.logos.mono],
      ] as const)
    : [];
  const hasAnyLogo = logoAssets.some(([, a]) => a);
  const hasVisual =
    !!b &&
    (filled(b.nameUsage) ||
      filled(b.tagline) ||
      hasAnyLogo ||
      filled(b.logoUsageNote) ||
      brandColors.length > 0 ||
      brandFonts.length > 0 ||
      filled(b.moodNote) ||
      filled(b.visualIdentity));
  const hasAudience = !!b && b.audiences.length > 0;
  const hasClaims = !!b && (filledArr(b.restrictedClaims) || filledArr(b.dontList));
  const hasTemplates = !!b && (b.assets.templates.length > 0 || b.assets.moods.length > 0);
  const hasGovernance = !!b && (filled(b.bookVersion) || filled(b.bookApproverName) || !!b.bookUpdatedAt);

  const visibleSections = SECTIONS.filter((s) => {
    switch (s.id) {
      case "foundation":
        return hasFoundation;
      case "story":
        return hasStory;
      case "verbal":
        return hasVerbal;
      case "visual":
        return hasVisual;
      case "audience":
        return hasAudience;
      case "claims":
        return hasClaims;
      case "templates":
        return hasTemplates;
      case "governance":
        return hasGovernance;
      default:
        return false;
    }
  });

  const heroLogo = b ? (b.assets.logos.full ?? b.assets.logos.icon) : null;
  const updatedLabel = b?.bookUpdatedAt
    ? new Date(b.bookUpdatedAt).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* print stylesheet ชุดเดียวกับหน้าภายใน — ลูกค้าสั่งพิมพ์/Save PDF เองได้ */}
      <style>{BRAND_BOOK_PRINT_CSS}</style>

      {/* ═══ Header ═══ */}
      <div className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-base font-semibold text-zinc-100">
              Brand Book — <span className="text-amber-400">{b?.name ?? "..."}</span>
            </h1>
            {b && (filled(b.bookVersion) || updatedLabel) && (
              <span className="hidden shrink-0 rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400 md:block">
                {filled(b.bookVersion) ? `v${b.bookVersion}` : ""}
                {filled(b.bookVersion) && updatedLabel ? " · " : ""}
                {updatedLabel ? `อัปเดต ${updatedLabel}` : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => window.print()}
            title="พิมพ์ / Save as PDF"
            className="print-hide shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            พิมพ์ / PDF
          </button>
        </div>
      </div>

      {error && (
        <p className="mx-auto max-w-6xl px-6 pt-4">
          <span className="block rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </span>
        </p>
      )}
      {!b && !error && <p className="p-6 text-sm text-zinc-500">กำลังโหลด...</p>}

      {b && (
        <div className="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-6">
          {/* ═══ TOC ═══ */}
          {visibleSections.length > 0 && (
            <nav aria-label="หมวดของ Brand Book" className="sticky top-20 hidden h-fit w-52 shrink-0 space-y-0.5 lg:block">
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">หมวด</p>
              {visibleSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`block rounded-lg px-3 py-1.5 text-sm ${
                    activeSection === s.id
                      ? "bg-amber-400/10 font-medium text-amber-300"
                      : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </nav>
          )}

          {/* ═══ Content ═══ */}
          <main className="min-w-0 flex-1 space-y-10">
            {/* Hero */}
            <section aria-label="ภาพรวมแบรนด์" className="overflow-hidden rounded-2xl border border-zinc-800">
              <div
                className="relative flex min-h-44 items-end p-6 sm:min-h-52"
                style={{ background: `${gradientFor(b.name)}` }}
              >
                <div className="absolute inset-0 bg-zinc-950/55" />
                <div className="relative flex items-end gap-4">
                  {heroLogo ? (
                    <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/80 shadow-xl">
                      <PublicAssetImage token={token} asset={heroLogo} alt={`โลโก้ ${b.name}`} className="h-full w-full" />
                    </div>
                  ) : (
                    <div
                      className="flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-600/40 text-3xl font-bold text-white shadow-xl"
                      style={{ background: gradientFor(b.name) }}
                      aria-label={`โลโก้ ${b.name}`}
                    >
                      {initialOf(b.name)}
                    </div>
                  )}
                  <div className="pb-1">
                    <p className="text-2xl font-bold tracking-tight text-zinc-50">{b.name}</p>
                    {filled(b.nameUsage) && <p className="text-xs text-zinc-400">{b.nameUsage}</p>}
                    {filled(b.tagline) && (
                      <p
                        className="mt-0.5 text-xl text-amber-200/90"
                        style={
                          filled(b.taglineFont)
                            ? { fontFamily: `'${b.taglineFont}', cursive` }
                            : { fontStyle: "italic" }
                        }
                      >
                        {b.tagline}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 1. Foundation */}
            {hasFoundation && (
              <section id="foundation" aria-labelledby="h-foundation" className="scroll-mt-24 space-y-4">
                <SectionHeading id="foundation" title="แก่นแบรนด์" sub="Brand Foundation" />
                <div className="grid gap-4 sm:grid-cols-3">
                  {filled(b.mission) && (
                    <div className={card}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">Mission</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{b.mission}</p>
                    </div>
                  )}
                  {filled(b.vision) && (
                    <div className={card}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">Vision</p>
                      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{b.vision}</p>
                    </div>
                  )}
                  {filledArr(b.coreValues) && (
                    <div className={card}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-amber-400/80">Core Values</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {b.coreValues.map((v) => (
                          <span key={v} className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {(filled(b.positioning) || filled(b.personality)) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filled(b.positioning) && (
                      <div className={card}>
                        <p className={label}>Positioning</p>
                        <p className="mt-2 text-sm leading-relaxed text-zinc-300">{b.positioning}</p>
                      </div>
                    )}
                    {filled(b.personality) && (
                      <div className={card}>
                        <p className={label}>บุคลิกแบรนด์ (Archetype)</p>
                        <p className="mt-2 text-sm text-zinc-300">{b.personality}</p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* 2. Story & USP */}
            {hasStory && (
              <section id="story" aria-labelledby="h-story" className="scroll-mt-24 space-y-4">
                <SectionHeading id="story" title="เรื่องราว & จุดขาย" />
                <div className={card}>
                  {filled(b.brandStory) && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-300">{b.brandStory}</p>
                  )}
                  {filled(b.usp) && (
                    <div className={filled(b.brandStory) ? "mt-4 border-t border-zinc-800 pt-4" : ""}>
                      <p className={label}>USP</p>
                      <p className="mt-1 text-sm text-zinc-300">{b.usp}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* 3. Verbal */}
            {hasVerbal && (
              <section id="verbal" aria-labelledby="h-verbal" className="scroll-mt-24 space-y-4">
                <SectionHeading id="verbal" title="ภาษาแบรนด์" sub="Verbal Identity" />
                {filled(b.toneOfVoice) && (
                  <div className={card}>
                    <p className={label}>โทนเสียง</p>
                    <p className="mt-1 text-sm text-zinc-300">{b.toneOfVoice}</p>
                  </div>
                )}
                {(filledArr(b.wordBankUse) || filledArr(b.wordBankAvoid)) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filledArr(b.wordBankUse) && (
                      <div className="print-card rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-5">
                        <p className="flex items-center gap-1 text-sm font-semibold text-emerald-300"><Check className="size-4" /> คำที่ใช้ (Word Bank)</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {b.wordBankUse.map((w) => (
                            <span key={w} className="rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {filledArr(b.wordBankAvoid) && (
                      <div className="print-card rounded-xl border border-red-900/60 bg-red-950/20 p-5">
                        <p className="flex items-center gap-1 text-sm font-semibold text-red-300"><X className="size-4" /> คำที่ห้ามใช้</p>
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {b.wordBankAvoid.map((w) => (
                            <span
                              key={w}
                              className="rounded-full bg-red-400/10 px-2.5 py-1 text-xs text-red-200 line-through"
                            >
                              {w}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {(filled(b.exampleOnBrand) || filled(b.exampleOffBrand)) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filled(b.exampleOnBrand) && (
                      <div className={card}>
                        <p className="flex items-center gap-1 text-xs font-semibold text-emerald-400"><Check className="size-3.5" /> ตัวอย่าง on-brand</p>
                        <p className="mt-2 whitespace-pre-line rounded-lg bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-300">
                          {b.exampleOnBrand}
                        </p>
                      </div>
                    )}
                    {filled(b.exampleOffBrand) && (
                      <div className={card}>
                        <p className="flex items-center gap-1 text-xs font-semibold text-red-400"><X className="size-3.5" /> ตัวอย่าง off-brand</p>
                        <p className="mt-2 whitespace-pre-line rounded-lg bg-zinc-950 p-3 text-sm leading-relaxed text-zinc-500">
                          {b.exampleOffBrand}
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {platformGuides.length > 0 && (
                  <div className={card}>
                    <p className={label}>แนวการเขียนต่อแพลตฟอร์ม</p>
                    <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                      {platformGuides.map(([platform, guide]) => (
                        <div key={platform} className="rounded-lg bg-zinc-950 p-3">
                          <p className="font-medium text-zinc-200">{PLATFORM_LABEL[platform] ?? platform}</p>
                          <p className="mt-1 text-xs leading-relaxed text-zinc-400">{guide}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* 4. Visual */}
            {hasVisual && (
              <section id="visual" aria-labelledby="h-visual" className="scroll-mt-24 space-y-4">
                <SectionHeading id="visual" title="อัตลักษณ์ภาพ" sub="Visual Identity" />
                {(filled(b.nameUsage) || filled(b.tagline)) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {filled(b.nameUsage) && (
                      <div className={card}>
                        <p className={label}>ชื่อ & วิธีเขียน</p>
                        <p className="mt-3 text-3xl font-bold text-zinc-100">{b.name}</p>
                        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{b.nameUsage}</p>
                      </div>
                    )}
                    {filled(b.tagline) && (
                      <div className={card}>
                        <p className={label}>สโลแกน + ฟอนต์สโลแกน</p>
                        <p
                          className="mt-3 text-3xl text-amber-200"
                          style={
                            filled(b.taglineFont)
                              ? { fontFamily: `'${b.taglineFont}', cursive` }
                              : { fontStyle: "italic" }
                          }
                        >
                          {b.tagline}
                        </p>
                        {filled(b.taglineFont) && (
                          <p className="mt-2 text-xs text-zinc-400">ฟอนต์ {b.taglineFont}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {(hasAnyLogo || filled(b.logoUsageNote)) && (
                  <div className={card}>
                    <p className={label}>โลโก้ & กติกาการใช้</p>
                    {hasAnyLogo && (
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {logoAssets.map(
                          ([name, asset]) =>
                            asset && (
                              <figure key={name} className="rounded-lg bg-zinc-950 p-4 text-center">
                                <div className="mx-auto flex h-20 items-center justify-center">
                                  <PublicAssetImage
                                    token={token}
                                    asset={asset}
                                    alt={`โลโก้ ${name}`}
                                    className="max-h-20 max-w-full"
                                  />
                                </div>
                                <figcaption className="mt-2 text-[11px] text-zinc-500">{name}</figcaption>
                              </figure>
                            ),
                        )}
                      </div>
                    )}
                    {filled(b.logoUsageNote) && (
                      <p className="mt-4 whitespace-pre-line rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs leading-relaxed text-zinc-300">
                        {b.logoUsageNote}
                      </p>
                    )}
                  </div>
                )}

                {brandColors.length > 0 && (
                  <div className={card}>
                    <div className="flex items-center justify-between">
                      <p className={label}>สี Palette (token)</p>
                      <p className="print-hide text-[11px] text-zinc-600">คลิก swatch เพื่อก๊อปค่า HEX</p>
                    </div>
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[540px] text-sm">
                        <thead>
                          <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-500">
                            <th className="pb-2 pr-4 font-medium">Token</th>
                            <th className="pb-2 pr-4 font-medium">Swatch / HEX (มืด)</th>
                            <th className="pb-2 pr-4 font-medium">บนพื้นสว่าง</th>
                            <th className="pb-2 font-medium">ใช้ทำ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {brandColors.map((c) => (
                            <tr key={c.token}>
                              <td className="py-2.5 pr-4 font-mono text-xs text-zinc-400">{c.token}</td>
                              {([c.dark, c.light] as const).map((hex, i) => (
                                <td key={i} className="py-2.5 pr-4">
                                  {hex ? (
                                    <button
                                      onClick={() => void copyHex(hex)}
                                      className="inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-zinc-800"
                                      title={`ก๊อป ${hex}`}
                                    >
                                      <span
                                        className="print-color h-5 w-5 rounded-md border border-zinc-700"
                                        style={{ background: hex }}
                                      />
                                      <span className="font-mono text-xs text-zinc-200">{hex}</span>
                                    </button>
                                  ) : (
                                    <span className="px-2 text-xs text-zinc-700">—</span>
                                  )}
                                </td>
                              ))}
                              <td className="py-2.5 text-xs text-zinc-400">{c.usage ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(brandFonts.length > 0 || filled(b.moodNote) || filled(b.visualIdentity)) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {brandFonts.length > 0 && (
                      <div className={card}>
                        <p className={label}>ฟอนต์ (แยกบทบาท)</p>
                        <ul className="mt-3 space-y-2.5 text-sm">
                          {brandFonts.map((f, i) => (
                            <li key={i} className="flex items-baseline justify-between gap-3">
                              <span className={f.role === "heading" ? "text-lg font-bold text-zinc-100" : "text-zinc-200"}>
                                {FONT_ROLE_LABEL[f.role] ?? f.role} — {f.family}
                              </span>
                              {f.note && <span className="shrink-0 text-[11px] text-zinc-500">{f.note}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {(filled(b.moodNote) || filled(b.visualIdentity)) && (
                      <div className={card}>
                        <p className={label}>มู้ดภาพ</p>
                        {b.assets.moods.length > 0 && (
                          <div className="mt-3 grid grid-cols-3 gap-2">
                            {b.assets.moods.slice(0, 3).map((m) => (
                              <div key={m.linkId} className="h-16 overflow-hidden rounded-lg bg-zinc-950">
                                <PublicAssetImage token={token} asset={m} alt="มู้ดภาพ" className="h-full w-full !object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                        {filled(b.moodNote) && (
                          <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-zinc-400">{b.moodNote}</p>
                        )}
                        {filled(b.visualIdentity) && (
                          <p className="mt-2 text-xs leading-relaxed text-zinc-500">{b.visualIdentity}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* 5. Audience */}
            {hasAudience && (
              <section id="audience" aria-labelledby="h-audience" className="scroll-mt-24 space-y-4">
                <SectionHeading id="audience" title="กลุ่มเป้าหมาย" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {b.audiences.map((a) => {
                    const seg = a.segment;
                    const bits: string[] = [];
                    if (seg.ageMin != null && seg.ageMax != null) bits.push(`${seg.ageMin}–${seg.ageMax} ปี`);
                    else if (seg.ageMin != null) bits.push(`${seg.ageMin}+ ปี`);
                    if (seg.gender && seg.gender !== "any")
                      bits.push(seg.gender === "female" ? "หญิง" : seg.gender === "male" ? "ชาย" : "ผสม");
                    if (seg.region) bits.push(seg.region);
                    if (seg.painPoint) bits.push(`pain: ${seg.painPoint}`);
                    if ((seg.platforms ?? []).length) bits.push(`แพลตฟอร์ม: ${(seg.platforms ?? []).join(", ")}`);
                    return (
                      <div
                        key={a.segmentId}
                        className={`print-card rounded-xl border bg-zinc-900 p-5 ${a.isPrimary ? "border-amber-400/30" : "border-zinc-800"}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium text-zinc-100">{seg.name}</p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                              a.isPrimary ? "bg-amber-400/10 text-amber-300" : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {a.isPrimary ? "กลุ่มหลัก" : "กลุ่มรอง"}
                          </span>
                        </div>
                        {(bits.length > 0 || seg.description) && (
                          <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                            {bits.join(" · ")}
                            {seg.description ? (bits.length ? " · " : "") + seg.description : ""}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* 6. Claims */}
            {hasClaims && (
              <section id="claims" aria-labelledby="h-claims" className="scroll-mt-24 space-y-4">
                <SectionHeading id="claims" title="คำ/เคลมต้องห้าม" />
                <div className="print-card rounded-xl border border-red-900/50 bg-red-950/10 p-5">
                  <div className="flex flex-wrap gap-2">
                    {b.restrictedClaims.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-red-800/60 bg-red-400/10 px-3 py-1 text-xs text-red-200"
                      >
                        {c}
                      </span>
                    ))}
                    {b.dontList.map((c) => (
                      <span
                        key={`dont-${c}`}
                        className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-400"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    ห้ามใช้คำ/เคลมชุดนี้ในทุกคอนเทนต์และสื่อของแบรนด์
                  </p>
                </div>
              </section>
            )}

            {/* 7. Templates */}
            {hasTemplates && (
              <section id="templates" aria-labelledby="h-templates" className="scroll-mt-24 space-y-4">
                <SectionHeading id="templates" title="เทมเพลต & ตัวอย่างการใช้" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[...b.assets.templates, ...b.assets.moods].map((t) => (
                    <figure key={t.linkId}>
                      <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                        <PublicAssetImage token={token} asset={t} alt={t.originalFilename} className="h-full w-full !object-cover" />
                      </div>
                      <figcaption className="mt-1.5 truncate text-xs text-zinc-500">
                        {t.linkRole === "mood" ? "มู้ด · " : ""}
                        {t.originalFilename}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}

            {/* 8. Governance — เฉพาะข้อมูลที่เปิดเผยได้ (ไม่มีช่องทางติดต่อผู้อนุมัติ) */}
            {hasGovernance && (
              <section id="governance" aria-labelledby="h-governance" className="scroll-mt-24 space-y-4">
                <SectionHeading id="governance" title="การกำกับ" sub="Governance" />
                <div className={card}>
                  <dl className="grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-zinc-500">เจ้าของแบรนด์ / ผู้อนุมัติ</dt>
                      <dd className="mt-1 text-zinc-200">{filled(b.bookApproverName) ? b.bookApproverName : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-zinc-500">เวอร์ชัน Brand Book</dt>
                      <dd className="mt-1 text-zinc-200">{filled(b.bookVersion) ? `v${b.bookVersion}` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wider text-zinc-500">อัปเดตล่าสุด</dt>
                      <dd className="mt-1 text-zinc-200">{updatedLabel ?? "—"}</dd>
                    </div>
                  </dl>
                </div>
              </section>
            )}

            {/* Footer */}
            <footer className="border-t border-zinc-800 pb-10 pt-6 text-center text-xs text-zinc-600">
              Brand Book · จัดทำด้วย AISTAR Talent OS
            </footer>
          </main>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="print-hide fixed bottom-5 right-5 z-50 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
