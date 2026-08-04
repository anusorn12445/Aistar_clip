"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield, Rocket, Users, TrendingUp, Star, Mail, Lock, EyeOff, Eye, LockOpen,
  Headphones, Globe,
} from "lucide-react";
import { api, setRefreshToken, setToken } from "@/lib/api";
import ThemeToggle from "@/components/ThemeToggle";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; roles: string[] };
}

const FEATURES = [
  { icon: Shield, title: "ปลอดภัย", desc: "ข้อมูลของคุณถูกปกป้องอย่างดี" },
  { icon: Rocket, title: "รวดเร็ว", desc: "ระบบทำงานเสถียร ไม่สะดุด" },
  { icon: Users, title: "ครบวงจร", desc: "จัดการ AI Talent ได้ทั้งหมดในที่เดียว" },
  { icon: TrendingUp, title: "อัจฉริยะ", desc: "ขับเคลื่อนด้วย AI Technology" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.accessToken);
      setRefreshToken(res.refreshToken);
      localStorage.setItem("aistar_user", JSON.stringify(res.user));
      // Dashboard = admin เท่านั้น (CEO) — คนอื่นเข้าหน้างานของตัวเอง
      router.push(res.user.roles?.includes("admin") ? "/dashboard" : "/my-work");
    } catch (err) {
      setError(err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-zinc-950 text-zinc-100">
      {/* พื้นหลังหน้า login — วางไฟล์ที่ apps/web/public/image_talentos_bg.png */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: "url(/image_talentos_bg.png)" }}
        aria-hidden
      />
      {/* ไล่เฉดให้อ่านง่าย — โหมดสว่างสลับเป็นเฉดกระดาษอุ่น (login-scrim-* ใน globals.css) */}
      <div className="login-scrim-x absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/85 to-zinc-950/10" aria-hidden />
      <div className="login-scrim-y absolute inset-0 bg-gradient-to-t from-zinc-950/90 via-transparent to-zinc-950/40" aria-hidden />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-end gap-3 px-6 py-5 sm:px-10">
          <span className="flex items-center gap-2">
            <Star className="size-5 text-amber-400" />
            <span className="text-lg font-bold">
              AISTAR <span className="text-amber-400">Talent OS</span>
            </span>
          </span>
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-start px-6 sm:px-10 lg:px-16">
          <div className="w-full max-w-md space-y-6">
            <div>
              <p className="text-sm text-amber-300/90">ยินดีต้อนรับสู่ระบบ</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                AISTAR <span className="text-amber-400">Talent OS</span>
              </h1>
              <p className="mt-2 text-sm text-zinc-300">
                แพลตฟอร์มจัดการและบริหาร AI Talent อย่างมืออาชีพ
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-4 rounded-2xl border border-white/10 bg-zinc-950/60 p-6 shadow-2xl backdrop-blur-md sm:p-8"
            >
              <div className="text-center">
                <p className="text-lg font-semibold">เข้าสู่ระบบเพื่อใช้งาน</p>
                <p className="text-sm text-zinc-400">
                  AISTAR <span className="text-amber-400">Talent OS</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm text-zinc-400">อีเมล</label>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 focus-within:border-amber-400">
                  <Mail className="size-4 text-zinc-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-transparent py-2.5 text-sm outline-none"
                    placeholder="you@aistar.ai"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm text-zinc-400">รหัสผ่าน</label>
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 focus-within:border-amber-400">
                  <Lock className="size-4 text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-transparent py-2.5 text-sm outline-none"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-zinc-500 hover:text-zinc-300"
                    aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}
              {info && <p className="text-sm text-amber-300/90">{info}</p>}

              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50"
              >
                {loading ? "กำลังเข้าสู่ระบบ..." : <><LockOpen className="size-4" /> เข้าสู่ระบบ</>}
              </button>

              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span className="h-px flex-1 bg-zinc-700" />
                หรือเข้าสู่ระบบด้วย
                <span className="h-px flex-1 bg-zinc-700" />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {["Google", "Microsoft", "Apple"].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setInfo(`เข้าสู่ระบบด้วย ${p} จะเปิดให้ใช้เร็ว ๆ นี้`)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900/60 py-2 text-xs text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </div>

        <div className="hidden gap-3 px-6 pb-4 sm:grid sm:grid-cols-2 sm:px-10 lg:max-w-3xl lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-white/10 bg-zinc-950/50 p-3 backdrop-blur-sm"
            >
              <f.icon className="size-5 text-amber-300" />
              <p className="mt-1 text-sm font-semibold text-amber-300">{f.title}</p>
              <p className="text-[11px] leading-snug text-zinc-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-6 py-3 text-[11px] text-zinc-500 sm:px-10">
          <span>© 2026 AISTAR Talent OS · All rights reserved.</span>
          <span className="flex gap-4">
            <span className="inline-flex items-center gap-1"><Headphones className="size-3.5" /> Support 24/7</span>
            <span className="inline-flex items-center gap-1"><Globe className="size-3.5" /> aistar.ai</span>
            <span className="inline-flex items-center gap-1"><Shield className="size-3.5" /> Privacy &amp; Security</span>
          </span>
        </footer>
      </div>
    </main>
  );
}
