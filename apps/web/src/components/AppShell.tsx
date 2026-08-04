"use client";

import { ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, FolderOpen, Drama, FileText, FolderTree, Hand, Grab,
  ClipboardList, Camera, Lightbulb, Clapperboard, ShoppingBag, Film, Zap,
  Briefcase, Handshake, Tag, Target, Tv, Video, Image as ImageIcon, ListTodo,
  ClipboardCheck, Calendar, Radio, TrendingUp, MessageSquare, Brain, BarChart3,
  Sparkles, StickyNote, Search, Wallet, Users, Settings, PanelLeftClose, PanelLeftOpen,
  ChevronDown, User, LogOut, Lock, ArrowLeft, type LucideIcon,
  BookOpen,
  Package,
} from "lucide-react";
import { api, clearToken, getRefreshToken, getUser, Profile, ViewScope } from "@/lib/api";
import NotificationBell from "@/components/NotificationBell";
import EntityAvatar from "@/components/EntityAvatar";
import ThemeToggle from "@/components/ThemeToggle";

// perm = module ที่ต้องมีสิทธิ์ V ถึงจะเห็นเมนู (ไม่ระบุ = เมนูพื้นฐาน แสดงเสมอ)
// adminOnly = เห็นเฉพาะ role admin (CEO: Dashboard ให้ Admin เห็นคนเดียว)
type NavItem = { href: string; label: string; icon: LucideIcon; perm?: string; adminOnly?: boolean };

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "ภาพรวม",
    items: [
      { href: "/dashboard", label: "แดชบอร์ด", icon: LayoutDashboard, adminOnly: true },
      { href: "/media", label: "คลังสื่อ", icon: FolderOpen },
    ],
  },
  {
    title: "ทาเลนต์",
    items: [
      { href: "/characters", label: "ตัวละคร", icon: Drama },
      { href: "/prompts", label: "คลัง Prompt", icon: FileText },
      { href: "/library", label: "สถานที่ / เสียง / ลิขสิทธิ์", icon: FolderTree },
    ],
  },
  {
    title: "คลังการหยิบจับ",
    items: [
      { href: "/hands", label: "คลังมือ", icon: Hand, perm: "library" },
      { href: "/gestures", label: "คลังท่าทาง", icon: Grab, perm: "library" },
      { href: "/interaction-templates", label: "เทมเพลตการหยิบจับ", icon: ClipboardList, perm: "library" },
      { href: "/camera-presets", label: "พรีเซ็ตกล้อง", icon: Camera, perm: "library" },
      { href: "/lighting-presets", label: "พรีเซ็ตแสง", icon: Lightbulb, perm: "library" },
      { href: "/director", label: "ผู้กำกับ AI", icon: Clapperboard, perm: "library" },
    ],
  },
  {
    // สายผลิตคลิป affiliate (CEO-approved) — แยกจาก Production ที่เป็นสายซีรีส์
    title: "ผลิตคลิปแอฟฟิลิเอต",
    items: [
      // Products โผล่ซ้ำตรงนี้ตามสั่ง (CEO) — จุดตั้งต้นของสายนี้ (ดูดสินค้า → ทำคลิป) ตัวจริงอยู่หมวด Production
      { href: "/products", label: "สินค้า", icon: ShoppingBag, perm: "product" },
      { href: "/clip-jobs", label: "งานคลิป", icon: Film, perm: "product" },
      { href: "/clip-jobs/recipes", label: "สูตรคลิป", icon: BookOpen, perm: "product" },
      { href: "/affiliate", label: "คอนเทนต์แอฟฟิลิเอต", icon: Zap, perm: "product" },
    ],
  },
  {
    title: "งานผลิต",
    items: [
      { href: "/jobs", label: "งานรับจ้าง", icon: Briefcase, perm: "job" },
      { href: "/clients", label: "ลูกค้า", icon: Handshake, perm: "job" },
      { href: "/brands", label: "แบรนด์", icon: Tag, perm: "product" },
      { href: "/campaigns", label: "แคมเปญ", icon: Target, perm: "campaign" },
      { href: "/series", label: "ซีรีส์", icon: Tv, perm: "episode" },
      { href: "/episodes", label: "ตอน & ช็อต", icon: Video, perm: "episode" },
      { href: "/products", label: "สินค้า", icon: ShoppingBag, perm: "product" },
      { href: "/image-requests", label: "งานภาพ", icon: ImageIcon, perm: "image_request" },
      { href: "/my-work", label: "งานของฉัน", icon: ListTodo },
      { href: "/assignments", label: "มอบหมายงาน", icon: ClipboardCheck, perm: "setting" },
    ],
  },
  {
    title: "เผยแพร่",
    items: [
      { href: "/calendar", label: "ปฏิทินคอนเทนต์", icon: Calendar },
      { href: "/live", label: "ตารางไลฟ์", icon: Radio, perm: "live" },
      { href: "/performance", label: "ผลงาน", icon: TrendingUp, perm: "performance" },
    ],
  },
  {
    title: "อินไซต์",
    items: [
      { href: "/customer-voice", label: "เสียงลูกค้า", icon: MessageSquare, perm: "content" },
      { href: "/ideation", label: "คิดไอเดีย (AI)", icon: Brain, perm: "content" },
      { href: "/content-analytics", label: "วิเคราะห์คอนเทนต์", icon: BarChart3, perm: "content" },
      { href: "/ideas", label: "คลังไอเดีย", icon: Sparkles, perm: "idea" },
      { href: "/board", label: "บอร์ดโพสต์อิท", icon: StickyNote, perm: "postit" },
      { href: "/competitors", label: "คู่แข่ง", icon: Search, perm: "competitor" },
      { href: "/ai-usage", label: "ต้นทุน AI", icon: Wallet, perm: "ai_usage" },
    ],
  },
  {
    title: "ผู้ดูแลระบบ",
    items: [
      { href: "/users", label: "ผู้ใช้ & สิทธิ์", icon: Users, perm: "user" },
      { href: "/settings", label: "ตั้งค่า", icon: Settings, perm: "setting" },
    ],
  },
];

// badge อธิบายขอบเขตข้อมูล (viewScope) — กันงานหาย/ว่างโดยไม่มีคำอธิบาย
const SCOPE_BADGE: Record<Exclude<ViewScope, "all">, { icon: LucideIcon; text: string }> = {
  own: { icon: Lock, text: "แสดงเฉพาะงานของคุณ" },
  team: { icon: Users, text: "แสดงเฉพาะงานของทีม" },
};

export default function AppShell({
  title,
  actions,
  children,
  maxWidth = "max-w-6xl",
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  // cap ความกว้าง content ให้พอดี เท่ากันทุกหน้า (ไม่เต็มขอบ — อ่านง่าย ไม่เปลือง eyeball)
  // ครอบทั้ง title-row + content ด้วยค่าเดียว → title align กับ content เสมอ
  // ส่งค่าอื่น/"" (เต็มกว้าง) ได้ต่อหน้าถ้าจำเป็น
  maxWidth?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  // อ่าน user จาก localStorage หลัง mount เท่านั้น — อ่านตอน render ทำ hydration mismatch
  // (server เห็น "ผู้ใช้" client เห็นชื่อจริง) → React 19 ทิ้ง SSR tree ทั้งหน้า
  const [user, setUser] = useState<ReturnType<typeof getUser>>(null);
  useEffect(() => {
    setUser(getUser());
    setCollapsed(localStorage.getItem("aistar_sidebar_collapsed") === "1");
  }, []);
  const profileActive = pathname === "/profile" || pathname.startsWith("/profile/");

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem("aistar_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }

  // ดึงสิทธิ์สดจาก /auth/me มากรองเมนู — ระหว่างโหลด/พลาด = แสดงทุกเมนู (fail open)
  useEffect(() => {
    let alive = true;
    api<Profile>("/auth/me")
      .then((p) => {
        if (alive) setProfile(p);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  // role จาก /auth/me (สด) > localStorage (เร็ว ไม่กะพริบ) — ยังไม่รู้ role = ไม่ใช่ admin ไว้ก่อน
  const roleKeys = profile?.roles ?? user?.roles ?? null;
  const isAdmin = (roleKeys ?? []).includes("admin");

  // เมนูแสดงเมื่อ: ไม่มี perm tag (พื้นฐาน) · ยังไม่โหลดสิทธิ์ · หรือมีสิทธิ์ V ใน module นั้น
  function canSee(item: NavItem): boolean {
    if (item.adminOnly && !isAdmin) return false;
    if (!item.perm) return true;
    if (!profile?.permissions) return true; // fail open ระหว่างโหลด
    return (profile.permissions[item.perm] ?? []).includes("V");
  }

  // scope badge — โชว์เฉพาะเมื่อ content หรือ episode ถูกจำกัดเป็น own/team (own มาก่อน)
  const scopeKinds = Object.entries(profile?.viewScope ?? {})
    .filter(([, s]) => s === "own" || s === "team")
    .map(([, s]) => s as "own" | "team");
  const scopeKind = scopeKinds.includes("own") ? "own" : scopeKinds[0] ?? null;
  const scopeBadge = scopeKind ? SCOPE_BADGE[scopeKind] : null;
  const ScopeIcon = scopeBadge?.icon;

  // breadcrumb: หมวดที่เมนูปัจจุบันอยู่ (จาก pathname) → "หมวด / title"
  const activeSection = NAV_SECTIONS.find((s) =>
    s.items.some((i) => pathname === i.href || pathname.startsWith(i.href + "/")),
  )?.title;

  async function handleLogout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await api("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearToken();
    router.push("/login");
  }

  const asideW = collapsed ? "w-16" : "w-60";
  const mainML = collapsed ? "ml-16" : "ml-60";

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className={`fixed inset-y-0 left-0 z-20 flex ${asideW} flex-col border-r border-border bg-card transition-[width] duration-200`}>
        <Link
          href={isAdmin ? "/dashboard" : "/my-work"}
          className={`flex h-16 items-center gap-2 border-b border-border px-4 ${collapsed ? "justify-center" : ""}`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Film className="size-4.5" />
          </span>
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight">
              AISTAR<span className="text-primary"> OS</span>
            </span>
          )}
        </Link>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {NAV_SECTIONS.map((s) => {
            const items = s.items.filter(canSee);
            if (items.length === 0) return null;
            return (
              <div key={s.title}>
                {!collapsed && (
                  <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {s.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={`group/nav relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          collapsed ? "justify-center" : ""
                        } ${
                          active
                            ? "bg-primary/8 font-semibold text-primary"
                            : "font-medium text-foreground hover:bg-primary/5"
                        }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r bg-primary" />
                        )}
                        <Icon className={`size-4 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {/* tooltip ตอน collapse — hover ที่ icon แล้วเด้งชื่อออกด้านขวา */}
                        {collapsed && (
                          <span className="pointer-events-none absolute left-full z-50 ml-2 hidden whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-md group-hover/nav:block">
                            {item.label}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {scopeBadge && ScopeIcon && !collapsed && (
          <div className="border-t border-border px-4 py-2.5">
            <span
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              title="ระบบแสดงข้อมูลตามขอบเขตสิทธิ์ของบัญชีคุณ"
            >
              <ScopeIcon className="size-3.5" />
              {scopeBadge.text}
            </span>
          </div>
        )}
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className={`${mainML} flex-1 transition-[margin] duration-200`}>
        <header className="sticky top-0 z-10 border-b border-border bg-card">
          <div className="flex h-16 items-center gap-3 px-6">
            <button
              onClick={toggleCollapsed}
              aria-label="ย่อ/ขยายเมนู"
              className="grid size-9 place-items-center rounded-md border border-input text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {collapsed ? <PanelLeftOpen className="size-4.5" /> : <PanelLeftClose className="size-4.5" />}
            </button>

            <div className="flex flex-1 justify-center px-2">
              <div className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-input bg-background px-3 text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20">
                <Search className="size-4 shrink-0" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
                  }}
                  placeholder="ค้นหาทั้งระบบ… (Enter)"
                  className="h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px]">⌘K</kbd>
              </div>
            </div>

            <ThemeToggle />
            <NotificationBell />
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="โปรไฟล์และบัญชี"
                className={`flex items-center rounded-full ${
                  profileActive || menuOpen ? "ring-2 ring-primary" : "hover:ring-2 hover:ring-border"
                }`}
              >
                <EntityAvatar entityType="user" id={user?.id ?? ""} name={user?.name ?? "ผู้ใช้"} size="md" />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-3">
                      <EntityAvatar entityType="user" id={user?.id ?? ""} name={user?.name ?? "ผู้ใช้"} size="md" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{user?.name ?? "ผู้ใช้"}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {user?.email ?? user?.roles?.[0] ?? ""}
                        </span>
                      </span>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent"
                    >
                      <User className="size-4 text-muted-foreground" /> ดูโปรไฟล์
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        void handleLogout();
                      }}
                      className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-destructive hover:bg-accent"
                    >
                      <LogOut className="size-4" /> ออกจากระบบ
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

        </header>


        {/* Page header band — พื้นขาว: title + actions (จำกัดกว้างให้ตรงกับ content) */}
        <div className="border-b border-border bg-card px-6 py-6">
          <div className={`mx-auto flex w-full flex-wrap items-center justify-between gap-3 ${maxWidth}`}>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className={`mx-auto w-full ${maxWidth}`}>{children}</div>
        </div>
      </div>
    </div>
  );
}
