"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  clearToken,
  getRefreshToken,
  getToken,
  getUser,
  setUser,
  type Profile,
} from "@/lib/api";
import { uploadAsset } from "@/lib/assets";
import { gradientFor, initialOf, primeEntityThumb, useAssetImage } from "@/lib/media";

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  active: { label: "ใช้งานอยู่", cls: "bg-emerald-900 text-emerald-200" },
  suspended: { label: "ระงับการใช้งาน", cls: "bg-red-900 text-red-200" },
};

export default function ProfilePage() {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [staleApi, setStaleApi] = useState(false); // /auth/me ยังไม่มีบน API (build เก่า)

  // avatar
  const [avatarAssetId, setAvatarAssetId] = useState<string | null>(null);
  const avatarUrl = useAssetImage(avatarAssetId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // แก้ไขโปรไฟล์
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // เปลี่ยนรหัสผ่าน
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // guard + โหลดโปรไฟล์สด (fallback → aistar_user ระหว่างโหลด/ถ้า API เก่า)
  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    (async () => {
      // เติมค่าจาก localStorage ก่อน (async → เลี่ยง cascading render ใน effect body)
      const stored = getUser();
      if (stored && !cancelled) {
        setName(stored.name);
        setEmail(stored.email);
      }
      try {
        const me = await api<Profile>("/auth/me");
        if (cancelled) return;
        setProfile(me);
        setName(me.name);
        setEmail(me.email);
        setAvatarAssetId(me.avatarAssetId);
      } catch {
        // API build เก่ายังไม่มี /auth/me (หรือโหลดไม่ได้) → ใช้ค่าจาก localStorage ไปก่อน ไม่ crash
        if (!cancelled) setStaleApi(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // อ่าน user จาก localStorage หลัง mount เท่านั้น — อ่านตอน render ทำ hydration mismatch
  // (server เห็น "ผู้ใช้" client เห็นชื่อจริง) → React 19 ทิ้ง SSR tree ทั้งหน้า
  const [stored, setStored] = useState<ReturnType<typeof getUser>>(null);
  useEffect(() => {
    setStored(getUser());
  }, []);
  const displayName = profile?.name ?? stored?.name ?? "ผู้ใช้";
  const displayEmail = profile?.email ?? stored?.email ?? "";
  const roleChips: { key: string; label: string }[] = profile
    ? profile.roles.map((k, i) => ({ key: k, label: profile.roleNames[i] ?? k }))
    : (stored?.roles ?? []).map((k) => ({ key: k, label: k }));
  const userId = profile?.id ?? stored?.id ?? "";

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้
    if (!file || !userId) return;
    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const asset = await uploadAsset(file, {
        assetType: "avatar",
        entityType: "user",
        entityId: userId,
        linkRole: "primary_reference",
      });
      setAvatarAssetId(asset.id);
      primeEntityThumb("user", userId, asset.id); // ให้ sidebar/หน้าอื่นเห็นรูปใหม่
      setProfileMsg({ ok: true, text: "อัปเดตรูปโปรไฟล์แล้ว" });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ",
      });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 120) {
      setProfileMsg({ ok: false, text: "ชื่อต้องยาว 1–120 ตัวอักษร" });
      return;
    }
    setSavingProfile(true);
    try {
      const updated = await api<Profile>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ name: trimmedName, email: email.trim() }),
      });
      setProfile(updated);
      setName(updated.name);
      setEmail(updated.email);
      // sync localStorage เพื่อให้ shell แสดงชื่อใหม่
      const cur = getUser();
      if (cur) setUser({ ...cur, name: updated.name, email: updated.email });
      setProfileMsg({ ok: true, text: "บันทึกโปรไฟล์แล้ว" });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
      });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPassword.length < 10) {
      setPwMsg({ ok: false, text: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 10 ตัวอักษร" });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: "รหัสผ่านใหม่กับการยืนยันไม่ตรงกัน" });
      return;
    }
    setSavingPassword(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwMsg({ ok: true, text: "เปลี่ยนรหัสผ่านแล้ว" });
    } catch (err) {
      setPwMsg({
        ok: false,
        text: err instanceof Error ? err.message : "รหัสผ่านปัจจุบันไม่ถูกต้อง",
      });
    } finally {
      setSavingPassword(false);
    }
  }

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

  const inputCls =
    "w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold">
            โปรไฟล์ของฉัน
          </h1>
          <button
            onClick={handleLogout}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:border-red-800 hover:text-red-300"
          >
            ออกจากระบบ
          </button>
        </div>

        {staleApi && (
          <div className="mb-4 rounded-lg border border-amber-900 bg-amber-950/40 px-4 py-2 text-sm text-amber-200">
            แสดงข้อมูลจากเซสชันล่าสุด — เซิร์ฟเวอร์ยังไม่รองรับโปรไฟล์สด (รอ restart API)
          </div>
        )}

        {/* Header card */}
        <div className="mb-6 flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
          <div className="relative">
            <span
              className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-2xl font-semibold text-white/90"
              style={avatarUrl ? undefined : { background: gradientFor(displayName) }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                initialOf(displayName)
              )}
            </span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar || !userId}
              className="absolute -bottom-1 -right-1 rounded-full border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] text-zinc-200 hover:border-amber-400 disabled:opacity-50"
            >
              {uploadingAvatar ? "..." : "เปลี่ยนรูป"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{displayName}</p>
            <p className="truncate text-sm text-zinc-400">{displayEmail}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {profile?.status && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    STATUS_LABEL[profile.status]?.cls ?? "bg-zinc-800 text-zinc-300"
                  }`}
                >
                  {STATUS_LABEL[profile.status]?.label ?? profile.status}
                </span>
              )}
              {roleChips.map((r) => (
                <span
                  key={r.key}
                  className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-300"
                >
                  {r.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* แก้ไขโปรไฟล์ */}
        <form
          onSubmit={handleSaveProfile}
          className="mb-6 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
        >
          <h2 className="text-sm font-semibold text-zinc-300">แก้ไขโปรไฟล์</h2>
          <div className="space-y-1.5">
            <label className="block text-xs text-zinc-500">ชื่อ</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={inputCls}
              placeholder="ชื่อของคุณ"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs text-zinc-500">อีเมล (ใช้เข้าสู่ระบบ)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="you@aistar.local"
            />
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {profileMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={savingProfile || loading}
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
          >
            {savingProfile ? "กำลังบันทึก..." : "บันทึกโปรไฟล์"}
          </button>
        </form>

        {/* เปลี่ยนรหัสผ่าน */}
        <form
          onSubmit={handleChangePassword}
          className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"
        >
          <h2 className="text-sm font-semibold text-zinc-300">เปลี่ยนรหัสผ่าน</h2>
          <div className="space-y-1.5">
            <label className="block text-xs text-zinc-500">รหัสผ่านปัจจุบัน</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs text-zinc-500">
              รหัสผ่านใหม่ <span className="text-zinc-600">(อย่างน้อย 10 ตัวอักษร)</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••••"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs text-zinc-500">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputCls}
              placeholder="••••••••••"
            />
            {confirmPassword.length > 0 && newPassword !== confirmPassword && (
              <p className="text-xs text-red-400">รหัสผ่านยังไม่ตรงกัน</p>
            )}
          </div>
          {pwMsg && (
            <p className={`text-sm ${pwMsg.ok ? "text-emerald-400" : "text-red-400"}`}>
              {pwMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={
              savingPassword ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:border-amber-400 disabled:opacity-50"
          >
            {savingPassword ? "กำลังเปลี่ยน..." : "เปลี่ยนรหัสผ่าน"}
          </button>
        </form>
      </div>
    </div>
  );
}
