"use client";

// media.ts — โครงสร้างพื้นฐานของ "image-first UI"
// - useAssetImage: โหลดรูปแบบแนบ token → object URL พร้อม cache ระดับ module
//   (avatar ตัวเดียวกันโผล่หลายหน้า/หลายการ์ด ไม่ต้อง fetch ซ้ำ)
// - useEntityThumb(s): หา asset รูปประจำ entity ผ่าน GET /assets/thumbnails
//   แบบ batch (รวมหลาย request ที่เกิดใน frame เดียวกันเป็นคำขอเดียว, chunk ละ 50)
// - gradientFor: gradient สวยๆ แบบ deterministic ต่อชื่อ ใช้เป็น placeholder

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fetchAssetObjectUrl } from "@/lib/assets";

// ── object URL cache ─────────────────────────────────────────
// เก็บเป็น Promise เพื่อ dedupe การ fetch ที่ยิงพร้อมกัน — ไม่ revoke เพราะ
// cache อยู่ตลอดอายุ session (จำนวน thumbnail มีจำกัด ไม่ใช่ memory hazard)
const objectUrlCache = new Map<string, Promise<string>>();

export function getAssetObjectUrl(assetId: string): Promise<string> {
  let p = objectUrlCache.get(assetId);
  if (!p) {
    p = fetchAssetObjectUrl(assetId).catch((err) => {
      objectUrlCache.delete(assetId); // อย่า cache ความล้มเหลว — ลองใหม่ครั้งหน้าได้
      throw err;
    });
    objectUrlCache.set(assetId, p);
  }
  return p;
}

/** โหลดรูป asset (ต้องแนบ Bearer token) → object URL — null ระหว่างโหลด/พลาด */
export function useAssetImage(assetId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getAssetObjectUrl(assetId)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  return assetId ? url : null;
}

// ── entity thumbnail resolver (batched) ──────────────────────

type ThumbResult = string | null; // assetId หรือไม่มีรูป

const thumbCache = new Map<string, ThumbResult>(); // key = `${entityType}:${entityId}`

interface ThumbQueue {
  ids: Set<string>;
  waiters: Map<string, ((r: ThumbResult) => void)[]>;
}

const thumbQueues = new Map<string, ThumbQueue>(); // ต่อ entityType
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** จองคิวขอ thumbnail ของ entity — requests ที่เกิดใกล้กันถูกรวมเป็น batch เดียว */
export function requestEntityThumb(entityType: string, entityId: string): Promise<ThumbResult> {
  const cacheKey = `${entityType}:${entityId}`;
  if (thumbCache.has(cacheKey)) return Promise.resolve(thumbCache.get(cacheKey) ?? null);

  return new Promise((resolve) => {
    let q = thumbQueues.get(entityType);
    if (!q) {
      q = { ids: new Set(), waiters: new Map() };
      thumbQueues.set(entityType, q);
    }
    q.ids.add(entityId);
    const arr = q.waiters.get(entityId) ?? [];
    arr.push(resolve);
    q.waiters.set(entityId, arr);

    if (!flushTimers.has(entityType)) {
      flushTimers.set(
        entityType,
        setTimeout(() => {
          flushTimers.delete(entityType);
          void flushThumbQueue(entityType);
        }, 25),
      );
    }
  });
}

async function flushThumbQueue(entityType: string) {
  const q = thumbQueues.get(entityType);
  if (!q) return;
  thumbQueues.delete(entityType);

  const ids = [...q.ids];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let found = new Map<string, string>();
    try {
      const res = await api<{ entityId: string; assetId: string }[]>(
        `/assets/thumbnails?entityType=${encodeURIComponent(entityType)}&ids=${chunk.join(",")}`,
      );
      found = new Map(res.map((r) => [r.entityId, r.assetId]));
    } catch {
      // endpoint ยังไม่มี (API build เก่า) หรือ error — ถือว่าไม่มีรูป ใช้ gradient แทน
    }
    for (const id of chunk) {
      const result = found.get(id) ?? null;
      thumbCache.set(`${entityType}:${id}`, result);
      for (const cb of q.waiters.get(id) ?? []) cb(result);
    }
  }
}

/** ยัดค่าเข้า cache ตรงๆ — ใช้หลัง upload รูปใหม่ ให้ UI เห็นรูปทันทีไม่ต้อง refetch */
export function primeEntityThumb(entityType: string, entityId: string, assetId: string | null) {
  thumbCache.set(`${entityType}:${entityId}`, assetId);
}

/** thumbnail asset id ของ entity เดียว — null ถ้าไม่มีรูป/ยังโหลด */
export function useEntityThumb(
  entityType: string,
  entityId: string | null | undefined,
): string | null {
  const [assetId, setAssetId] = useState<string | null>(() =>
    entityId ? (thumbCache.get(`${entityType}:${entityId}`) ?? null) : null,
  );

  useEffect(() => {
    if (!entityType || !entityId) {
      setAssetId(null);
      return;
    }
    let cancelled = false;
    requestEntityThumb(entityType, entityId).then((r) => {
      if (!cancelled) setAssetId(r);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  return entityType && entityId ? assetId : null;
}

/** thumbnail หลาย entity พร้อมกัน → { entityId: assetId } (มีเฉพาะตัวที่มีรูป) */
export function useEntityThumbs(entityType: string, ids: string[]): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!entityType || !idsKey) {
      setMap({});
      return;
    }
    let cancelled = false;
    const list = idsKey.split(",");
    Promise.all(
      list.map((id) => requestEntityThumb(entityType, id).then((r) => [id, r] as const)),
    ).then((entries) => {
      if (cancelled) return;
      const m: Record<string, string> = {};
      for (const [id, r] of entries) if (r) m[id] = r;
      setMap(m);
    });
    return () => {
      cancelled = true;
    };
  }, [entityType, idsKey]);

  return map;
}

// ── gradient placeholder ─────────────────────────────────────

/** hash ชื่อ → คู่ hue → gradient สวยๆ แบบ deterministic (ชื่อเดิม = สีเดิมเสมอ) */
export function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const h1 = h % 360;
  const h2 = (h1 + 40 + (h % 90)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 55% 30%) 0%, hsl(${h2} 65% 45%) 100%)`;
}

/** อักษรตัวแรกของชื่อ (unicode-safe — ตัดสระ/วรรณยุกต์ไทยนำหน้าไม่ได้ ใช้ grapheme แรกพอ) */
export function initialOf(name: string): string {
  const first = [...(name ?? "").trim()][0];
  return first ?? "?";
}
