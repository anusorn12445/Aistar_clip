"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Target, Users, Drama, Dna, Ban, RefreshCw, Wallet, Folder, type LucideIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import AudienceSegmentsSection from "./AudienceSegmentsSection";
import CharacterCategoriesSection from "./CharacterCategoriesSection";
import CharacterBlueprintsSection from "./CharacterBlueprintsSection";
import BannedWordsSection from "./BannedWordsSection";
import ProductStatesSection from "./ProductStatesSection";
import AiToolsSection from "./AiToolsSection";
import CredentialsSection, { type SettingsResponse } from "./CredentialsSection";
import KpiGoalsSection from "./KpiGoalsSection";
import MediaCenterSection from "./MediaCenterSection";
import { api, getToken } from "@/lib/api";

type SectionKey =
  | "system"
  | "kpi"
  | "audience"
  | "charcat"
  | "blueprint"
  | "banned"
  | "prodstate"
  | "aitools"
  | "media";

const SECTIONS: { key: SectionKey; icon: LucideIcon; label: string }[] = [
  { key: "system", icon: Settings, label: "ระบบ / Credentials" },
  { key: "kpi", icon: Target, label: "เป้าหมายทีม (KPI)" },
  { key: "audience", icon: Users, label: "กลุ่มผู้ชม (Audience)" },
  { key: "charcat", icon: Drama, label: "ประเภทตัวละคร" },
  { key: "blueprint", icon: Dna, label: "พิมพ์เขียวตัวละคร (Blueprint)" },
  { key: "banned", icon: Ban, label: "คำต้องห้าม (Banned Words)" },
  { key: "prodstate", icon: RefreshCw, label: "สถานะสินค้า (Product State)" },
  { key: "aitools", icon: Wallet, label: "AI Tools & ต้นทุน" },
  { key: "media", icon: Folder, label: "Media Center" },
];

const SECTION_KEYS = SECTIONS.map((s) => s.key) as string[];

export default function SettingsPage() {
  const router = useRouter();
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionKey>("system");

  const load = useCallback(async () => {
    try {
      const res = await api<SettingsResponse>("/settings");
      setData(res);
      setRefreshKey((k) => k + 1);
      setLoadError(null);
      setForbidden(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ";
      // 403 จาก PermissionsGuard = ไม่ใช่ admin
      if (msg.includes("ต้องมีสิทธิ์") || msg.includes("Forbidden")) setForbidden(true);
      else setLoadError(msg);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    void load();
  }, [router, load]);

  // deep-link: ?section=media หรือ #media → เลือก section ตอนโหลด
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get("section");
    const fromHash = window.location.hash.replace("#", "");
    const initial = fromQuery || fromHash;
    if (initial && SECTION_KEYS.includes(initial)) setSection(initial as SectionKey);
  }, []);

  function selectSection(key: SectionKey) {
    setSection(key);
    // สะท้อนใน URL เพื่อ refresh/แชร์ลิงก์ได้ (ไม่เพิ่ม history entry)
    window.history.replaceState(null, "", `?section=${key}`);
  }

  return (
    <AppShell title="System Settings">
      {forbidden ? (
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-red-900 bg-red-950/40 p-6 text-sm text-red-200">
            เฉพาะ Admin เท่านั้น — บัญชีของคุณไม่มีสิทธิ์เข้าถึงหน้า System Settings
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* ── left: section menu (sticky) ── */}
          <nav className="lg:sticky lg:top-20 lg:h-fit lg:w-60 lg:shrink-0">
            <div className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-2 lg:flex-col lg:overflow-visible">
              {SECTIONS.map((s) => {
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => selectSection(s.key)}
                    className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-sm lg:w-full ${
                      active
                        ? "bg-amber-400/10 font-medium text-amber-300"
                        : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                    }`}
                  >
                    <s.icon className="size-4 shrink-0" />
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* ── right: selected section content ── */}
          <div className="min-w-0 flex-1">
            {loadError && (
              <div className="mb-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-sm text-red-400">
                โหลดการตั้งค่าไม่สำเร็จ: {loadError}
              </div>
            )}

            {section === "system" && (
              <CredentialsSection data={data} refreshKey={refreshKey} onReload={load} />
            )}
            {section === "kpi" && <KpiGoalsSection />}
            {section === "audience" && <AudienceSegmentsSection />}
            {section === "charcat" && <CharacterCategoriesSection />}
            {section === "blueprint" && <CharacterBlueprintsSection />}
            {section === "banned" && <BannedWordsSection />}
            {section === "prodstate" && <ProductStatesSection />}
            {section === "aitools" && <AiToolsSection />}
            {section === "media" && <MediaCenterSection />}
          </div>
        </div>
      )}
    </AppShell>
  );
}
