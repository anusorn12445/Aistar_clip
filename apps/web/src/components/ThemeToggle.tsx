"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "aistar_theme"; // ค่า: "light" | "dark" — default = light (ตั้งใน layout.tsx ก่อน paint)

type Theme = "light" | "dark";

/** ปุ่มสลับโหมดสว่าง/มืด — อ่านค่าเริ่มจาก data-theme ที่ inline script ตั้งไว้แล้ว */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // localStorage คือความจริง — ตั้ง attribute ซ้ำหลัง hydration
    // (React เป็นเจ้าของ <html> อาจรีเซ็ต attribute ที่ inline script ตั้งไว้)
    let t: Theme = "light";
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === "dark" || s === "light") t = s;
    } catch {
      /* private mode */
    }
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode ฯลฯ — สลับได้เฉพาะ session นี้ */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title="สลับโหมดสว่าง/มืด"
      aria-label="สลับโหมดสว่าง/มืด"
      className="grid size-9 place-items-center rounded-md border border-input text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
    </button>
  );
}
