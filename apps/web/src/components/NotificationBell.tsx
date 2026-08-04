"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { api, getToken } from "@/lib/api";

interface Notification {
  id: string;
  type: string;
  entityType: string | null;
  entityId: string | null;
  message: string;
  readAt: string | null;
  createdAt: string;
}

// เวลาแบบ relative ภาษาไทย
function relTime(iso: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return "เมื่อสักครู่";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชั่วโมงที่แล้ว`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} วันที่แล้ว`;
  return new Date(iso).toLocaleDateString("th-TH");
}

// resolve ลิงก์ปลายทางจาก entity ที่แนบมากับ notification
function hrefFor(n: Notification): string | null {
  switch (n.entityType) {
    case "character":
      return n.entityId ? `/characters/${n.entityId}` : "/characters";
    case "prompt":
      return "/prompts";
    case "task":
      return "/my-work";
    case "content_item":
      // เปิดปฏิทินพร้อม side panel ของ content ที่แจ้งเตือน
      return n.entityId ? `/calendar?item=${n.entityId}` : "/calendar";
    case "episode":
      return n.entityId ? `/episodes/${n.entityId}` : "/episodes";
    case "live_session":
      return "/live";
    case "campaign":
      return n.entityId ? `/campaigns/${n.entityId}` : "/campaigns";
    case "product":
      return "/products";
    default:
      return null;
  }
}

export default function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!getToken()) return;
    try {
      setItems(await api<Notification[]>("/notifications"));
    } catch {
      /* poll เงียบ ๆ — พังครั้งเดียวไม่ต้องโวยวาย */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  // ปิด dropdown เมื่อคลิกนอกกรอบ
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = items.filter((n) => !n.readAt).length;

  async function handleClick(n: Notification) {
    if (!n.readAt) {
      try {
        await api(`/notifications/${n.id}/read`, { method: "PATCH" });
      } catch {
        /* mark read พลาดก็ไม่ต้องขวางการนำทาง */
      }
      load();
    }
    const href = hrefFor(n);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  async function readAll() {
    try {
      await api("/notifications/read-all", { method: "POST" });
      load();
    } catch {
      /* เงียบ */
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="การแจ้งเตือน"
        className="relative grid size-9 place-items-center rounded-md border border-input text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
            <p className="text-sm font-semibold">การแจ้งเตือน</p>
            {unread > 0 && (
              <button onClick={readAll} className="text-xs text-amber-300 hover:text-amber-200">
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">ยังไม่มีการแจ้งเตือน</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={`block w-full border-b border-zinc-800/60 px-4 py-3 text-left hover:bg-zinc-800/60 ${
                  n.readAt ? "opacity-60" : ""
                }`}
              >
                <p className="text-sm text-zinc-200">
                  {!n.readAt && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />}
                  {n.message}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{relTime(n.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
