"use client";

// ── UI PREVIEW (pilot) ────────────────────────────────────────────────────
// จำลอง shell แบบ Takra/Metronic ด้วย Metronic components + สี aistar (amber)
// standalone — ไม่แตะ AppShell / 40 หน้าจริง. ดูที่ /ui-preview
// อยากได้ primary ส้มแบบ Takra: แก้ --primary ใน globals.css (token layer)
// ────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import {
  LayoutDashboard, FolderOpen, Sparkles, User, FileText, FolderTree,
  Hand, Grip, Camera, Clapperboard, ShoppingBag, Film, Zap, Briefcase,
  Tv, CheckSquare, Calendar, Radio, TrendingUp, MessageSquare, Brain,
  Search as SearchIcon, Wallet, Users, Settings, ChevronsLeft, Bell,
  ChevronDown, Plus, Pencil, Trash2, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

const GMV = [
  { day: "07-15", gmv: 4200 }, { day: "07-16", gmv: 6100 }, { day: "07-17", gmv: 5300 },
  { day: "07-18", gmv: 8200 }, { day: "07-19", gmv: 7400 }, { day: "07-20", gmv: 9600 }, { day: "07-21", gmv: 11200 },
];
const chartConfig = { gmv: { label: "GMV (฿)", color: "var(--chart-1)" } } satisfies ChartConfig;

const JOBS = [
  { code: "CLIP-0012", subject: "ครีมกันแดด Cathy", mode: "hands", status: "ready", tone: "success" as const },
  { code: "CLIP-0011", subject: "คาเฟ่ Nimman", mode: "presenter", status: "generating", tone: "warning" as const },
  { code: "CLIP-0010", subject: "หูฟัง TWS X9", mode: "hands", status: "review", tone: "info" as const },
  { code: "CLIP-0009", subject: "ก๋วยเตี๋ยวเรือ", mode: "presenter", status: "published", tone: "secondary" as const },
];
const BOARD = [
  { title: "Inquiry", tone: "secondary" as const, items: ["แบรนด์ A — 3 คลิป", "ร้าน B — รีวิว"] },
  { title: "In Production", tone: "warning" as const, items: ["Campaign ครีม — EP2", "หูฟัง X9"] },
  { title: "Delivered", tone: "success" as const, items: ["คาเฟ่ Nimman", "ก๋วยเตี๋ยวเรือ"] },
];

type Item = { label: string; icon: LucideIcon };
const NAV: { title: string; items: Item[] }[] = [
  { title: "Overview", items: [
    { label: "Dashboard", icon: LayoutDashboard }, { label: "Media Center", icon: FolderOpen } ] },
  { title: "Talent", items: [
    { label: "Characters", icon: User }, { label: "Prompt Library", icon: FileText },
    { label: "Location / Voice / Rights", icon: FolderTree } ] },
  { title: "Interaction Library", items: [
    { label: "Hand Library", icon: Hand }, { label: "Gesture Library", icon: Grip },
    { label: "Camera Presets", icon: Camera }, { label: "AI Director", icon: Clapperboard } ] },
  { title: "Affiliate Video Production", items: [
    { label: "Products", icon: ShoppingBag }, { label: "Clip Jobs", icon: Film },
    { label: "Affiliate Content", icon: Zap } ] },
  { title: "Production", items: [
    { label: "Jobs", icon: Briefcase }, { label: "Series Hub", icon: Tv },
    { label: "Episodes & Shots", icon: Clapperboard }, { label: "My Work", icon: CheckSquare } ] },
  { title: "Publishing", items: [
    { label: "Content Calendar", icon: Calendar }, { label: "Live Schedule", icon: Radio },
    { label: "Performance", icon: TrendingUp } ] },
  { title: "Intelligence", items: [
    { label: "Customer Voice", icon: MessageSquare }, { label: "AI Ideation", icon: Brain },
    { label: "Competitors", icon: SearchIcon }, { label: "AI Usage / ต้นทุน AI", icon: Wallet } ] },
  { title: "Admin", items: [
    { label: "Users & Roles", icon: Users }, { label: "Settings", icon: Settings } ] },
];

// เนื้อหาตัวอย่าง — echo หน้า "โหมดสร้างเอง (สไตล์)" ของ Takra
const STYLES = [
  { name: "พรีเซนเตอร์", type: "identity", body: "You are a UGC video prompt director for Google Flow (Veo), Thai market. Generate distinct vertical 9:16 video prompts for ONE consistent Thai content…", fields: 9 },
  { name: "รีวิวสินค้า", type: "product", body: "You are a UGC product-review prompt director for Google Flow (Veo), Thai market. Generate distinct vertical 9:16 video prompts reviewing the product…", fields: 5 },
  { name: "ละครสั้น", type: "series", body: "You are a short-drama series director for Google Flow (Veo). Generate a CONNECTED vertical 9:16 story in genre \"{{srGenre}}\", with the SAME…", fields: 6 },
  { name: "ไวรัล", type: "viral", body: "You are a viral short-video prompt director for Google Flow (Veo). Apply the viral video effect/style: \"{{vrEffect}}\" to the subject. Generate vertical 9:16 Veo…", fields: 3 },
];

export default function UiPreview() {
  const [active, setActive] = useState("Prompt Library");

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-border">
          <span className="grid place-items-center size-7 rounded-md bg-primary text-primary-foreground">
            <Film className="size-4" />
          </span>
          <span className="text-lg font-bold tracking-tight">
            AISTAR<span className="text-primary"> OS</span>
          </span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {NAV.map((sec) => (
            <div key={sec.title} className="mb-5">
              <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {sec.title}
              </p>
              <ul className="space-y-0.5">
                {sec.items.map((it) => {
                  const on = active === it.label;
                  return (
                    <li key={it.label}>
                      <button
                        onClick={() => setActive(it.label)}
                        className={`relative w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          on
                            ? "bg-accent text-accent-foreground font-semibold"
                            : "text-foreground/70 hover:bg-accent/60 hover:text-foreground"
                        }`}
                      >
                        {on && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r bg-primary" />
                        )}
                        <it.icon className={`size-4 ${on ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="truncate">{it.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* ── Main ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 flex items-center gap-3 px-5 border-b border-border bg-card/80 backdrop-blur">
          <Button variant="outline" size="icon" className="size-9">
            <ChevronsLeft className="size-4" />
          </Button>
          <div className="h-6 w-px bg-border" />
          <h1 className="text-[15px] font-semibold">{active}</h1>
          <div className="flex-1 flex justify-center px-4">
            <div className="w-full max-w-md flex items-center gap-2 rounded-lg border border-input bg-background px-3 h-9 text-muted-foreground">
              <SearchIcon className="size-4" />
              <span className="text-sm flex-1">ค้นหา prompt, แท็บ, ตัวเลือก…</span>
              <kbd className="text-[11px] rounded border border-border px-1.5 py-0.5 bg-muted">⌘K</kbd>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-9"><Bell className="size-4" /></Button>
          <button className="flex items-center gap-1.5">
            <span className="grid place-items-center size-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold">A</span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>
        </header>

        {/* Breadcrumb */}
        <div className="h-11 flex items-center px-6 border-b border-border text-sm text-muted-foreground">
          <span>Talent</span>
          <span className="mx-2 text-border">/</span>
          <span className="text-foreground font-medium">{active}</span>
        </div>

        {/* Content — echo หน้า "โหมดสร้างเอง (สไตล์)" */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">โหมดสร้างเอง (สไตล์)</h2>
              <p className="text-muted-foreground mt-1">สไตล์ให้ AI แต่ง prompt สด — ตรงกับแท็บ “สร้างเอง” หน้าบ้าน 1:1</p>
            </div>
            <Button variant="primary"><Plus className="size-4" /> เพิ่มแท็บ</Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {STYLES.map((s) => (
              <Card key={s.name} className="border-border">
                <CardHeader className="flex-row items-start justify-between gap-2 border-b border-border pb-4">
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <Badge variant="secondary" appearance="light" className="mt-1.5">{s.type}</Badge>
                  </div>
                  <div className="flex gap-1.5">
                    <Button variant="outline" size="sm"><Pencil className="size-3.5" /> แก้ไข</Button>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground line-clamp-2">{s.body}</p>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {["ประเภทคลิป", "เพศ", "โทนผิว", "อายุ", "จำนวนชุด"].slice(0, s.type === "viral" ? 3 : 5).map((f) => (
                      <span key={f} className="text-[12px] rounded-md bg-muted px-2 py-1 text-muted-foreground">{f}</span>
                    ))}
                  </div>
                  <Button variant="outline" size="sm" className="mt-4">จัดการ field ({s.fields})</Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── Component showcase: Chart + Table + Board ─────────── */}
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="border-border">
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-base">GMV รายวัน (7 วัน)</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <ChartContainer config={chartConfig} className="h-52 w-full">
                  <AreaChart data={GMV} margin={{ left: 4, right: 4, top: 4 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="day" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area dataKey="gmv" type="natural" stroke="var(--color-gmv)" fill="var(--color-gmv)" fillOpacity={0.18} strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="border-b border-border pb-4">
                <CardTitle className="text-base">Clip Jobs ล่าสุด</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>รหัส</TableHead>
                      <TableHead>เรื่อง</TableHead>
                      <TableHead>โหมด</TableHead>
                      <TableHead>สถานะ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {JOBS.map((j) => (
                      <TableRow key={j.code}>
                        <TableCell className="font-mono text-xs text-muted-foreground">{j.code}</TableCell>
                        <TableCell className="font-medium">{j.subject}</TableCell>
                        <TableCell className="text-muted-foreground">{j.mode}</TableCell>
                        <TableCell><Badge variant={j.tone} appearance="light">{j.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* mini board (โครง Kanban — ตัว DnD component + @dnd-kit ลงไว้พร้อม wire หน้า Jobs จริง) */}
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            {BOARD.map((col) => (
              <div key={col.title} className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold">{col.title}</span>
                  <Badge variant={col.tone} appearance="light">{col.items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {col.items.map((it) => (
                    <div key={it} className="rounded-lg border border-border bg-card p-3 text-sm shadow-sm">{it}</div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
