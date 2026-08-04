"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Clapperboard,
  Drama,
  Film,
  FileText,
  MapPin,
  MessageSquare,
  Rocket,
  ShoppingBag,
  Target,
  Tv,
  User,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import CoverPicker from "@/components/CoverPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken, type CharacterList } from "@/lib/api";
import {
  CAMERA_OPTIONS,
  EPISODE_ACTIONS,
  EPISODE_STATUS_LABEL,
  SHOT_ACTIONS,
  SHOT_STATUS_LABEL,
  type CharacterRef,
  type EpisodeDetail,
  type HandoffResult,
  type Shot,
} from "@/lib/production";

interface UserOption {
  id: string;
  name: string;
  email?: string;
}

interface ProductOption {
  id: string;
  displayCode?: string;
  name: string;
}

interface ShotForm {
  durationSec: string;
  camera: string;
  action: string;
  dialogue: string;
  emotion: string;
  outfit: string;
  characterIds: string[];
}

const EMPTY_SHOT_FORM: ShotForm = {
  durationSec: "",
  camera: "",
  action: "",
  dialogue: "",
  emotion: "",
  outfit: "",
  characterIds: [],
};

function shotToForm(s: Shot): ShotForm {
  return {
    durationSec: s.durationSec != null ? String(s.durationSec) : "",
    camera: s.camera ?? "",
    action: s.action ?? "",
    dialogue: s.dialogue ?? "",
    emotion: s.emotion ?? "",
    outfit: s.outfit ?? "",
    characterIds: s.characterIds,
  };
}

function formToPayload(f: ShotForm) {
  return {
    durationSec: f.durationSec ? parseInt(f.durationSec, 10) : undefined,
    camera: f.camera || undefined,
    action: f.action || undefined,
    dialogue: f.dialogue || undefined,
    emotion: f.emotion || undefined,
    outfit: f.outfit || undefined,
    characterIds: f.characterIds,
  };
}

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm outline-none focus:border-amber-400";

export default function EpisodeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [ep, setEp] = useState<EpisodeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverOverride, setCoverOverride] = useState<string | null>(null);

  // script editor
  const [scriptForm, setScriptForm] = useState({ script: "", hook: "", conflict: "", twist: "", cta: "" });
  const [scriptDirty, setScriptDirty] = useState(false);

  // link selects
  const [allCharacters, setAllCharacters] = useState<CharacterRef[]>([]);
  const [products, setProducts] = useState<ProductOption[] | null>(null); // null = endpoint ยังไม่มี
  const [charToLink, setCharToLink] = useState("");
  const [productToLink, setProductToLink] = useState("");

  // shot builder
  const [aiShotBusy, setAiShotBusy] = useState(false);
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [shotForm, setShotForm] = useState<ShotForm>(EMPTY_SHOT_FORM);
  const [newShot, setNewShot] = useState<ShotForm>(EMPTY_SHOT_FORM);
  const [showAddShot, setShowAddShot] = useState(false);

  // handoff
  const [users, setUsers] = useState<UserOption[] | null>(null); // null = /users ยังไม่มี → text input
  const [operatorId, setOperatorId] = useState("");
  const [editorId, setEditorId] = useState("");
  const [handoffResult, setHandoffResult] = useState<HandoffResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<EpisodeDetail>(`/episodes/${id}`);
      setEp(res);
      setScriptForm({
        script: res.script ?? "",
        hook: res.hook ?? "",
        conflict: res.conflict ?? "",
        twist: res.twist ?? "",
        cta: res.cta ?? "",
      });
      setScriptDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    load();
    api<CharacterList>("/characters").then((r) =>
      setAllCharacters(
        r.items.map((c) => ({
          id: c.id,
          displayCode: c.displayCode,
          nameTh: c.nameTh,
          nameEn: c.nameEn,
          status: c.status,
        })),
      ),
    ).catch(() => {});
    // รายชื่อผู้รับผิดชอบ — ใช้ /tasks/assignees (task:V ทุก role ที่สร้าง task ได้เห็น)
    // ครีเอเตอร์มักไม่มี user:V จึง fallback ไป /users เฉพาะกรณี assignees ล้มเหลว
    const normalize = (r: UserOption[] | { items: UserOption[] }) =>
      Array.isArray(r) ? r : r.items ?? [];
    api<UserOption[] | { items: UserOption[] }>("/tasks/assignees")
      .then((r) => setUsers(normalize(r)))
      .catch(() =>
        api<UserOption[] | { items: UserOption[] }>("/users")
          .then((r) => setUsers(normalize(r)))
          .catch(() => setUsers([])), // ไม่มีทั้งคู่ → select ว่าง (ไม่ตกไป raw-UUID input)
      );
    // /products สร้างแบบขนานเช่นกัน
    api<ProductOption[] | { items: ProductOption[] }>("/products")
      .then((r) => setProducts(Array.isArray(r) ? r : r.items ?? []))
      .catch(() => setProducts(null));
  }, [id, router, load]);

  async function run<T>(fn: () => Promise<T>, okMessage?: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await fn();
      if (okMessage) setNotice(okMessage);
      await load();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (to: string) =>
    run(
      () => api(`/episodes/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: to }) }),
      `เปลี่ยน status เป็น ${EPISODE_STATUS_LABEL[to as keyof typeof EPISODE_STATUS_LABEL]?.label ?? to} แล้ว`,
    );

  const saveScript = () =>
    run(
      () =>
        api(`/episodes/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            script: scriptForm.script,
            hook: scriptForm.hook,
            conflict: scriptForm.conflict,
            twist: scriptForm.twist,
            cta: scriptForm.cta,
            expectedUpdatedAt: ep?.updatedAt,
          }),
        }),
      "บันทึกสคริปต์แล้ว (auto-snapshot version)",
    );

  const linkedCharacterIds = useMemo(
    () => new Set(ep?.characters.map((c) => c.characterId) ?? []),
    [ep],
  );
  const characterName = useCallback(
    (cid: string) => {
      const c =
        ep?.characterDetails.find((x) => x.id === cid) ?? allCharacters.find((x) => x.id === cid);
      return c ? c.nameTh : cid.slice(0, 8);
    },
    [ep, allCharacters],
  );

  const saveShot = (shotId: string) =>
    run(
      () => api(`/shots/${shotId}`, { method: "PATCH", body: JSON.stringify(formToPayload(shotForm)) }),
      "บันทึก shot แล้ว",
    ).then(() => setEditingShotId(null));

  const addShot = () =>
    run(
      () => api(`/episodes/${id}/shots`, { method: "POST", body: JSON.stringify(formToPayload(newShot)) }),
      "เพิ่ม shot แล้ว",
    ).then(() => setNewShot(EMPTY_SHOT_FORM));

  // Phase 4: ให้ AI แตก shot list จาก script (สร้าง Shot rows ทันที)
  const aiGenerateShots = async () => {
    setAiShotBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ createdCount: number }>(`/ai/episodes/${id}/shot-list`, {
        method: "POST",
        body: JSON.stringify({ create: true }),
      });
      setNotice(`AI แตก shot list ให้แล้ว ${res.createdCount} shots`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI แตก shot list ไม่สำเร็จ");
    } finally {
      setAiShotBusy(false);
    }
  };

  const moveShot = (index: number, dir: -1 | 1) => {
    if (!ep) return;
    const ids = ep.shots.map((s) => s.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => api(`/episodes/${id}/shots/reorder`, { method: "POST", body: JSON.stringify({ shotIds: ids }) }));
  };

  // ผู้รับผิดชอบอีพี — ใช้กับ row-level viewScope 'own' (ตั้งได้โดยทุกคนที่แก้อีพีได้)
  const setOwner = (ownerId: string) =>
    run(
      () =>
        api(`/episodes/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ ownerId: ownerId || null }),
        }),
      ownerId ? "ตั้งผู้รับผิดชอบแล้ว" : "เอาผู้รับผิดชอบออกแล้ว",
    );

  const doHandoff = async () => {
    const result = await run<HandoffResult>(
      () =>
        api(`/episodes/${id}/handoff`, {
          method: "POST",
          body: JSON.stringify({
            operatorId: operatorId || undefined,
            editorId: editorId || undefined,
          }),
        }),
    );
    if (result) {
      setHandoffResult(result);
      setNotice(`Handoff สำเร็จ — สร้าง ${result.taskCount} tasks ให้ทีม Production แล้ว`);
    }
  };

  if (!ep) {
    return (
      <AppShell title="Episode">
        <p className="text-sm text-zinc-500">{error ?? "กำลังโหลด..."}</p>
      </AppShell>
    );
  }

  const st = EPISODE_STATUS_LABEL[ep.status];
  const actions = EPISODE_ACTIONS[ep.status] ?? [];
  const approvedShots = ep.shots.filter((s) => s.status === "approved").length;

  const renderShotFields = (form: ShotForm, setForm: (f: ShotForm) => void) => (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <input
          type="number"
          min={1}
          value={form.durationSec}
          onChange={(e) => setForm({ ...form, durationSec: e.target.value })}
          placeholder="วินาที"
          className={`w-20 ${inputCls}`}
        />
        <FilterSelect
          value={form.camera}
          onChange={(v) => setForm({ ...form, camera: v })}
          options={[
            { value: "", label: "— camera —" },
            ...CAMERA_OPTIONS.map((c) => ({ value: c.value, label: c.label })),
          ]}
        />
        <input
          value={form.emotion}
          onChange={(e) => setForm({ ...form, emotion: e.target.value })}
          placeholder="อารมณ์"
          className={`w-28 ${inputCls}`}
        />
        <input
          value={form.outfit}
          onChange={(e) => setForm({ ...form, outfit: e.target.value })}
          placeholder="ชุด"
          className={`w-28 ${inputCls}`}
        />
      </div>
      <input
        value={form.action}
        onChange={(e) => setForm({ ...form, action: e.target.value })}
        placeholder="Action — ตัวละครทำอะไรในช็อตนี้"
        className={`w-full ${inputCls}`}
      />
      <input
        value={form.dialogue}
        onChange={(e) => setForm({ ...form, dialogue: e.target.value })}
        placeholder="Dialogue / บทพูด"
        className={`w-full ${inputCls}`}
      />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-zinc-500">ตัวละคร:</span>
        {ep.characters.length === 0 && (
          <span className="text-xs text-zinc-600">ยังไม่มีตัวละครใน episode — link ก่อนที่ section ด้านบน</span>
        )}
        {ep.characters.map((link) => {
          const active = form.characterIds.includes(link.characterId);
          return (
            <button
              key={link.characterId}
              type="button"
              onClick={() =>
                setForm({
                  ...form,
                  characterIds: active
                    ? form.characterIds.filter((x) => x !== link.characterId)
                    : [...form.characterIds, link.characterId],
                })
              }
              className={`rounded-full px-2 py-0.5 text-xs ${
                active
                  ? "bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/60"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {link.character?.nameTh ?? link.characterId.slice(0, 8)}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <AppShell title={`${ep.displayCode} — ${ep.title}`}>
      <div className="space-y-6">
        {/* Cover hero — เปลี่ยน/อัปโหลดปกตอนได้ */}
        <CoverImage
          assetId={coverOverride ?? undefined}
          entityType="episode"
          entityId={id}
          name={ep.title}
          aspect="aspect-[21/9]"
          className="rounded-2xl border border-zinc-800"
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/90 via-zinc-950/30 to-transparent p-4 pt-12">
            <span className="font-mono text-[11px] text-amber-300">{ep.displayCode}</span>
            <p className="truncate text-lg font-semibold text-white">{ep.title}</p>
          </div>
          <div className="absolute right-3 top-3">
            <CoverPicker
              entityType="episode"
              entityId={id}
              name={ep.title}
              assetType="episode_cover"
              onChanged={setCoverOverride}
              triggerClass="rounded-lg bg-zinc-950/75 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-950"
            />
          </div>
        </CoverImage>

        {/* Header */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-xs text-amber-300">{ep.displayCode}</span>
          <h2 className="text-xl font-semibold">{ep.title}</h2>
          <span className={`rounded-full px-2 py-1 text-xs ${st.cls}`}>{st.label}</span>
          {ep.series && (
            <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
              <Tv className="size-4" /> {ep.series.name}
            </span>
          )}
          {ep.season && (
            <span className="text-sm text-zinc-500">
              {ep.season}
              {ep.episodeNumber ? ` EP${ep.episodeNumber}` : ""}
            </span>
          )}
          {ep.campaign && (
            <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
              <Target className="size-4" /> {ep.campaign.name}
            </span>
          )}
          {ep.location && (
            <span className="inline-flex items-center gap-1 text-sm text-zinc-500">
              <MapPin className="size-4" /> {ep.location.name}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-sm text-zinc-500">
            <User className="size-4" />
            {users ? (
              <FilterSelect
                value={ep.ownerId ?? ""}
                disabled={busy}
                onChange={setOwner}
                options={[
                  { value: "", label: "— ไม่มีผู้รับผิดชอบ —" },
                  ...users.map((u) => ({ value: u.id, label: u.name })),
                ]}
              />
            ) : (
              <span>{ep.owner?.name ?? "ไม่มีผู้รับผิดชอบ"}</span>
            )}
          </span>
          <div className="flex-1" />
          {/* ปุ่มรองมาก่อน ปุ่มหลักชิดขวาสุดเสมอ — ตำแหน่งปุ่มหลักจะได้ไม่ขยับไปโดนปุ่มตีกลับ */}
          {[...actions].sort((a, b) => Number(!!a.primary) - Number(!!b.primary)).map((a) => (
            <button
              key={a.to}
              disabled={busy}
              onClick={() => changeStatus(a.to)}
              className={
                a.primary
                  ? "rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                  : "rounded-lg border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800 disabled:opacity-50"
              }
            >
              {a.label}
            </button>
          ))}
        </div>

        {ep.logline && <p className="text-sm text-zinc-400">{ep.logline}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}

        {/* 1. Script */}
        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <FileText className="size-4" /> Script
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {ep.scriptVersionCount > 0
                  ? `snapshot แล้ว ${ep.scriptVersionCount} versions`
                  : "ยังไม่มี version"}
              </span>
            </h3>
            <button
              disabled={busy || !scriptDirty}
              onClick={saveScript}
              className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            >
              บันทึกสคริปต์
            </button>
          </div>
          <textarea
            value={scriptForm.script}
            onChange={(e) => {
              setScriptForm({ ...scriptForm, script: e.target.value });
              setScriptDirty(true);
            }}
            rows={8}
            placeholder="เขียนสคริปต์เต็มที่นี่..."
            className={`w-full resize-y ${inputCls}`}
          />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {(
              [
                ["hook", "Hook — 3 วิแรกดึงคนดู"],
                ["conflict", "Conflict — ปมของตอน"],
                ["twist", "Twist — จุดหักมุม"],
                ["cta", "CTA — ชวนทำอะไรต่อ"],
              ] as const
            ).map(([key, placeholder]) => (
              <textarea
                key={key}
                value={scriptForm[key]}
                onChange={(e) => {
                  setScriptForm({ ...scriptForm, [key]: e.target.value });
                  setScriptDirty(true);
                }}
                rows={2}
                placeholder={placeholder}
                className={`resize-none ${inputCls}`}
              />
            ))}
          </div>
        </section>

        {/* 2. Characters & Products */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <Drama className="size-4" /> ตัวละครในตอน ({ep.characters.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ep.characters.map((link) => (
                <span
                  key={link.characterId}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs"
                >
                  <span className="font-mono text-[10px] text-amber-300">
                    {link.character?.displayCode ?? "?"}
                  </span>
                  {link.character?.nameTh ?? link.characterId.slice(0, 8)}
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api(`/episodes/${id}/characters/${link.characterId}`, { method: "DELETE" }),
                        "เอาตัวละครออกแล้ว",
                      )
                    }
                    className="text-zinc-500 hover:text-red-400"
                    title="เอาออก"
                  >
                    ×
                  </button>
                </span>
              ))}
              {ep.characters.length === 0 && (
                <span className="text-xs text-zinc-500">ยังไม่มีตัวละคร</span>
              )}
            </div>
            <div className="flex gap-2">
              <FilterSelect
                value={charToLink}
                onChange={setCharToLink}
                options={[
                  { value: "", label: "— เลือกตัวละคร —" },
                  ...allCharacters
                    .filter((c) => !linkedCharacterIds.has(c.id))
                    .map((c) => ({ value: c.id, label: `${c.displayCode} · ${c.nameTh}` })),
                ]}
                className="flex-1"
              />
              <button
                disabled={busy || !charToLink}
                onClick={() =>
                  run(
                    () =>
                      api(`/episodes/${id}/characters`, {
                        method: "POST",
                        body: JSON.stringify({ characterId: charToLink }),
                      }),
                    "เพิ่มตัวละครแล้ว",
                  ).then(() => setCharToLink(""))
                }
                className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
              >
                + Link
              </button>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <ShoppingBag className="size-4" /> สินค้าในตอน ({ep.products.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ep.products.map((link) => (
                <span
                  key={link.productId}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1 text-xs"
                >
                  <span className="font-mono text-[10px] text-amber-300">{link.product.displayCode}</span>
                  {link.product.name}
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api(`/episodes/${id}/products/${link.productId}`, { method: "DELETE" }),
                        "เอาสินค้าออกแล้ว",
                      )
                    }
                    className="text-zinc-500 hover:text-red-400"
                    title="เอาออก"
                  >
                    ×
                  </button>
                </span>
              ))}
              {ep.products.length === 0 && <span className="text-xs text-zinc-500">ยังไม่มีสินค้า</span>}
            </div>
            <div className="flex gap-2">
              {products ? (
                <FilterSelect
                  value={productToLink}
                  onChange={setProductToLink}
                  options={[
                    { value: "", label: "— เลือกสินค้า —" },
                    ...products
                      .filter((p) => !ep.products.some((l) => l.productId === p.id))
                      .map((p) => ({
                        value: p.id,
                        label: `${p.displayCode ? `${p.displayCode} · ` : ""}${p.name}`,
                      })),
                  ]}
                  className="flex-1"
                />
              ) : (
                <input
                  value={productToLink}
                  onChange={(e) => setProductToLink(e.target.value)}
                  placeholder="Product ID (uuid) — /products ยังไม่พร้อม"
                  className={`flex-1 ${inputCls}`}
                />
              )}
              <button
                disabled={busy || !productToLink}
                onClick={() =>
                  run(
                    () =>
                      api(`/episodes/${id}/products`, {
                        method: "POST",
                        body: JSON.stringify({ productId: productToLink }),
                      }),
                    "เพิ่มสินค้าแล้ว",
                  ).then(() => setProductToLink(""))
                }
                className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
              >
                + Link
              </button>
            </div>
          </div>
        </section>

        {/* 3. Shot List Builder */}
        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold">
              <Clapperboard className="size-4" /> Shot List
              <span className="ml-2 text-xs font-normal text-zinc-500">
                {ep.shots.length > 0 ? `${approvedShots}/${ep.shots.length} approved` : "ยังไม่มี shot"}
              </span>
            </h3>
            <div className="flex items-center gap-2">
              {ep.shots.length > 0 && (
                <Link
                  href={`/episodes/${id}/storyboard`}
                  className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
                >
                  <Film className="size-4" /> Storyboard
                </Link>
              )}
              {ep.shots.length === 0 && (ep.script ?? "").trim() !== "" && (
                <button
                  disabled={busy || aiShotBusy}
                  onClick={aiGenerateShots}
                  className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-50"
                >
                  {aiShotBusy ? "AI กำลังแตก shot..." : "AI แตก Shot List"}
                </button>
              )}
              <button
                onClick={() => setShowAddShot((v) => !v)}
                className="rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
              >
                + เพิ่ม Shot
              </button>
            </div>
          </div>

          {showAddShot && (
            <div className="space-y-2 rounded-xl border border-amber-400/30 bg-zinc-900 p-4">
              {renderShotFields(newShot, setNewShot)}
              <button
                disabled={busy}
                onClick={addShot}
                className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                เพิ่ม Shot #{ep.shots.length + 1}
              </button>
            </div>
          )}

          <div className="space-y-2">
            {ep.shots.map((shot, idx) => {
              const sst = SHOT_STATUS_LABEL[shot.status];
              const sActions = SHOT_ACTIONS[shot.status] ?? [];
              const isEditing = editingShotId === shot.id;
              return (
                <div key={shot.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <button
                        disabled={busy || idx === 0}
                        onClick={() => moveShot(idx, -1)}
                        className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                        title="เลื่อนขึ้น"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        disabled={busy || idx === ep.shots.length - 1}
                        onClick={() => moveShot(idx, 1)}
                        className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-30"
                        title="เลื่อนลง"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>
                    <span className="w-10 font-mono text-sm text-amber-300">#{shot.shotNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${sst.cls}`}>{sst.label}</span>
                    {!isEditing && (
                      <>
                        <span className="text-xs text-zinc-500">
                          {shot.durationSec ? `${shot.durationSec}s` : "—"} ·{" "}
                          {CAMERA_OPTIONS.find((c) => c.value === shot.camera)?.label ?? "no camera"}
                        </span>
                        <span className="max-w-md truncate text-sm text-zinc-300">
                          {shot.action ?? <span className="text-zinc-600">ไม่มี action</span>}
                        </span>
                        {shot.characterIds.map((cid) => (
                          <span key={cid} className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                            {characterName(cid)}
                          </span>
                        ))}
                      </>
                    )}
                    <div className="flex-1" />
                    {sActions.map((a) => (
                      <button
                        key={a.to}
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api(`/shots/${shot.id}/status`, {
                                method: "PATCH",
                                body: JSON.stringify({ status: a.to }),
                              }),
                            `Shot #${shot.shotNumber} → ${SHOT_STATUS_LABEL[a.to].label}`,
                          )
                        }
                        className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800 disabled:opacity-40"
                      >
                        {a.label}
                      </button>
                    ))}
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (isEditing) {
                          setEditingShotId(null);
                        } else {
                          setEditingShotId(shot.id);
                          setShotForm(shotToForm(shot));
                        }
                      }}
                      className="rounded-lg border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
                    >
                      {isEditing ? "ยกเลิก" : "แก้ไข"}
                    </button>
                    {shot.status === "planned" && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(() => api(`/shots/${shot.id}`, { method: "DELETE" }), "ลบ shot แล้ว")
                        }
                        className="rounded-lg border border-red-900 px-2 py-1 text-xs text-red-400 hover:bg-red-950"
                      >
                        ลบ
                      </button>
                    )}
                  </div>
                  {!isEditing && shot.dialogue && (
                    <p className="mt-1 flex items-center gap-1 pl-16 text-xs text-zinc-500">
                      <MessageSquare className="size-4 shrink-0" /> {shot.dialogue}
                    </p>
                  )}
                  {isEditing && (
                    <div className="mt-3 space-y-2 border-t border-zinc-800 pt-3">
                      {renderShotFields(shotForm, setShotForm)}
                      <button
                        disabled={busy}
                        onClick={() => saveShot(shot.id)}
                        className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                      >
                        บันทึก Shot #{shot.shotNumber}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {ep.shots.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-500">
                ยังไม่มี shot — กด &ldquo;+ เพิ่ม Shot&rdquo; เพื่อเริ่มแตก shot list
              </p>
            )}
          </div>
        </section>

        {/* 4. Handoff panel */}
        <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="flex items-center gap-2 font-semibold">
            <Rocket className="size-4" /> Production Handoff
            <span className="ml-2 text-xs font-normal text-zinc-500">
              เปลี่ยน shot list เป็น tasks ให้ทีม production (ต้อง status = แตก Shot)
            </span>
          </h3>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-zinc-500">AI Video Operator (gen shots)</label>
              {users ? (
                <FilterSelect
                  value={operatorId}
                  onChange={setOperatorId}
                  options={[
                    { value: "", label: "— ยังไม่ระบุ —" },
                    ...users.map((u) => ({ value: u.id, label: `${u.name} ${u.email ? `(${u.email})` : ""}` })),
                  ]}
                  className="w-full"
                />
              ) : (
                <FilterSelect value="" onChange={() => {}} disabled placeholder="กำลังโหลดรายชื่อ…" options={[]} className="w-full" />
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Video Editor (ตัดต่อ)</label>
              {users ? (
                <FilterSelect
                  value={editorId}
                  onChange={setEditorId}
                  options={[
                    { value: "", label: "— ยังไม่ระบุ —" },
                    ...users.map((u) => ({ value: u.id, label: `${u.name} ${u.email ? `(${u.email})` : ""}` })),
                  ]}
                  className="w-full"
                />
              ) : (
                <FilterSelect value="" onChange={() => {}} disabled placeholder="กำลังโหลดรายชื่อ…" options={[]} className="w-full" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              disabled={busy || ep.status !== "shot_breakdown"}
              onClick={doHandoff}
              className="rounded-lg bg-amber-400 px-5 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-40"
            >
              ส่งงานเข้าทีม Production
            </button>
            {ep.status !== "shot_breakdown" && !handoffResult && (
              <span className="text-xs text-zinc-500">
                ปุ่มจะเปิดเมื่อ episode อยู่สถานะ &ldquo;แตก Shot&rdquo;
              </span>
            )}
            {handoffResult && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
                <CircleCheck className="size-4 shrink-0" /> สร้าง {handoffResult.taskCount} tasks ({handoffResult.shotCount} shots) — episode เข้าสู่ Production
              </span>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
