"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, TriangleAlert, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { FilterSelect } from "@/components/ui/filter-select";
import {
  api,
  createTeam,
  deleteTeam,
  fetchRolePermissions,
  fetchTeams,
  getToken,
  SCOPED_MODULES,
  setTeamMembers,
  updateRoleViewScope,
  updateTeam,
  type RoleWithPermissions,
  type Team,
  type ViewScope,
} from "@/lib/api";
import { gradientFor, initialOf } from "@/lib/media";

interface RoleRef {
  key: string;
  name: string;
}

interface AppUser {
  id: string;
  email: string;
  name: string;
  status: "active" | "suspended";
  createdAt: string;
  roles: RoleRef[];
}

interface UserList {
  items: AppUser[];
  total: number;
  page: number;
  pageSize: number;
}

const inputCls =
  "rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-amber-400";

const emptyCreate = { email: "", name: "", password: "", roleKeys: [] as string[] };

function RoleChecks({
  roles,
  selected,
  onToggle,
}: {
  roles: RoleRef[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {roles.map((r) => {
        const active = selected.includes(r.key);
        return (
          <button
            type="button"
            key={r.key}
            onClick={() => onToggle(r.key)}
            className={`rounded-full border px-3 py-1 text-xs ${
              active
                ? "border-amber-400 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            }`}
          >
            {r.name}
          </button>
        );
      })}
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const [data, setData] = useState<UserList | null>(null);
  const [roles, setRoles] = useState<RoleRef[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [myId, setMyId] = useState<string | null>(null);

  // filters
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [page, setPage] = useState(1);

  // create form
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreate });
  const [saving, setSaving] = useState(false);

  // edit panel
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "", roleKeys: [] as string[], newPassword: "" });
  const [editSaving, setEditSaving] = useState(false);

  // viewScope ต่อ role×module (content / episode)
  const [rolePerms, setRolePerms] = useState<RoleWithPermissions[] | null>(null);
  const [scopeSaving, setScopeSaving] = useState<string | null>(null); // `${roleKey}:${module}`

  // teams (viewScope 'team')
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [teamBusy, setTeamBusy] = useState<string | null>(null); // teamId หรือ 'create'
  const [renamingTeam, setRenamingTeam] = useState<{ id: string; name: string } | null>(null);

  const loadTeams = useCallback(() => {
    fetchTeams()
      .then(setTeams)
      .catch(() => setTeams(null));
  }, []);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (fRole) params.set("role", fRole);
      if (fStatus) params.set("status", fStatus);
      params.set("page", String(page));
      setData(await api<UserList>(`/users?${params.toString()}`));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ");
    }
  }, [q, fRole, fStatus, page]);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    try {
      const me = JSON.parse(localStorage.getItem("aistar_user") ?? "null") as { id: string } | null;
      setMyId(me?.id ?? null);
    } catch {
      setMyId(null);
    }
    api<RoleRef[]>("/roles")
      .then(setRoles)
      .catch(() => setRoles([]));
    fetchRolePermissions()
      .then(setRolePerms)
      .catch(() => setRolePerms(null));
    loadTeams();
  }, [router, loadTeams]);

  async function handleCreateTeam() {
    const name = newTeamName.trim();
    if (!name) return;
    setTeamBusy("create");
    setError(null);
    try {
      await createTeam(name);
      setNewTeamName("");
      loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างทีมไม่สำเร็จ");
    } finally {
      setTeamBusy(null);
    }
  }

  async function handleRenameTeam() {
    if (!renamingTeam || !renamingTeam.name.trim()) return;
    setTeamBusy(renamingTeam.id);
    setError(null);
    try {
      await updateTeam(renamingTeam.id, { name: renamingTeam.name.trim() });
      setRenamingTeam(null);
      loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนชื่อทีมไม่สำเร็จ");
    } finally {
      setTeamBusy(null);
    }
  }

  async function handleToggleTeamStatus(t: Team) {
    setTeamBusy(t.id);
    setError(null);
    try {
      await updateTeam(t.id, { status: t.status === "active" ? "archived" : "active" });
      loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะทีมไม่สำเร็จ");
    } finally {
      setTeamBusy(null);
    }
  }

  async function handleDeleteTeam(t: Team) {
    if (!window.confirm(`ลบทีม "${t.name}" ถาวร? สมาชิกในทีมจะถูกปลดออกทั้งหมด`)) return;
    setTeamBusy(t.id);
    setError(null);
    try {
      await deleteTeam(t.id);
      loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ลบทีมไม่สำเร็จ");
    } finally {
      setTeamBusy(null);
    }
  }

  async function handleToggleMember(t: Team, userId: string) {
    const current = t.members.map((m) => m.id);
    const next = current.includes(userId)
      ? current.filter((id) => id !== userId)
      : [...current, userId];
    setTeamBusy(t.id);
    setError(null);
    try {
      await setTeamMembers(t.id, next);
      loadTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกสมาชิกไม่สำเร็จ");
    } finally {
      setTeamBusy(null);
    }
  }

  async function changeScope(roleKey: string, module: string, viewScope: ViewScope) {
    const key = `${roleKey}:${module}`;
    setScopeSaving(key);
    setError(null);
    try {
      await updateRoleViewScope(roleKey, module, viewScope);
      setRolePerms(
        (prev) =>
          prev?.map((r) =>
            r.key === roleKey
              ? {
                  ...r,
                  permissions: r.permissions.map((p) =>
                    p.module === module ? { ...p, viewScope } : p,
                  ),
                }
              : r,
          ) ?? null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกมุมมองข้อมูลไม่สำเร็จ");
    } finally {
      setScopeSaving(null);
    }
  }

  // debounced reload เมื่อ filter เปลี่ยน
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
  }, [load]);

  const activeFilters = [q, fRole, fStatus].filter(Boolean).length;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (!createForm.roleKeys.length) throw new Error("เลือกอย่างน้อย 1 บทบาท");
      await api<AppUser>("/users", { method: "POST", body: JSON.stringify(createForm) });
      setCreateForm({ ...emptyCreate });
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างผู้ใช้ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(u: AppUser) {
    setEditing(u);
    setEditForm({ name: u.name, email: u.email, roleKeys: u.roles.map((r) => r.key), newPassword: "" });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setError(null);
    try {
      await api<AppUser>(`/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email.trim(),
          roleKeys: editForm.roleKeys,
          ...(editForm.newPassword ? { newPassword: editForm.newPassword } : {}),
        }),
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setEditSaving(false);
    }
  }

  async function toggleStatus(u: AppUser) {
    setError(null);
    try {
      await api<AppUser>(`/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: u.status === "active" ? "suspended" : "active" }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยนสถานะไม่สำเร็จ");
    }
  }

  return (
    <AppShell
      title="Users & Roles"
      actions={
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
        >
          + เพิ่มผู้ใช้
        </button>
      }
    >
      <div className="space-y-6">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="ค้นหาชื่อหรืออีเมล..."
            className={`${inputCls} min-w-52 flex-1`}
          />
          <FilterSelect
            value={fRole}
            onChange={(v) => {
              setFRole(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "ทุกบทบาท" },
              ...roles.map((r) => ({ value: r.key, label: r.name })),
            ]}
          />
          <FilterSelect
            value={fStatus}
            onChange={(v) => {
              setFStatus(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "ทุกสถานะ" },
              { value: "active", label: "ใช้งานอยู่" },
              { value: "suspended", label: "ถูกระงับ" },
            ]}
          />
          {activeFilters > 0 && (
            <button
              onClick={() => {
                setQ("");
                setFRole("");
                setFStatus("");
                setPage(1);
              }}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
            >
              ล้าง filter ({activeFilters})
            </button>
          )}
        </div>

        {/* create form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm font-semibold">เพิ่มผู้ใช้ใหม่</p>
            <div className="grid grid-cols-3 gap-3">
              <input
                required
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="อีเมล *"
                className={`${inputCls} bg-zinc-800`}
              />
              <input
                required
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="ชื่อ *"
                className={`${inputCls} bg-zinc-800`}
              />
              <input
                required
                type="password"
                minLength={8}
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="รหัสผ่าน (≥ 8 ตัว) *"
                className={`${inputCls} bg-zinc-800`}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">บทบาท (เลือกได้หลายอัน) *</p>
              <RoleChecks
                roles={roles}
                selected={createForm.roleKeys}
                onToggle={(key) =>
                  setCreateForm((f) => ({
                    ...f,
                    roleKeys: f.roleKeys.includes(key)
                      ? f.roleKeys.filter((k) => k !== key)
                      : [...f.roleKeys, key],
                  }))
                }
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {saving ? "กำลังสร้าง..." : "สร้างผู้ใช้"}
            </button>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* users table */}
        <div className="overflow-hidden rounded-2xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">ชื่อ</th>
                <th className="px-4 py-3 font-medium">อีเมล</th>
                <th className="px-4 py-3 font-medium">บทบาท</th>
                <th className="px-4 py-3 font-medium">สถานะ</th>
                <th className="px-4 py-3 font-medium">สร้างเมื่อ</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {data?.items.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-900/50">
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white/90"
                        style={{ background: gradientFor(u.name) }}
                      >
                        {initialOf(u.name)}
                      </span>
                      <span>
                        {u.name}
                        {u.id === myId && <span className="ml-1 text-xs text-amber-300">(คุณ)</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{u.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => (
                        <span
                          key={r.key}
                          className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300"
                        >
                          {r.name}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs ${
                        u.status === "active"
                          ? "bg-emerald-900 text-emerald-200"
                          : "bg-red-900 text-red-200"
                      }`}
                    >
                      {u.status === "active" ? "ใช้งานอยู่" : "ถูกระงับ"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(u.createdAt).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        แก้ไข
                      </button>
                      {u.id !== myId && (
                        <button
                          onClick={() => toggleStatus(u)}
                          className={`rounded-md border px-2 py-1 text-xs ${
                            u.status === "active"
                              ? "border-red-900 text-red-300 hover:bg-red-950"
                              : "border-emerald-900 text-emerald-300 hover:bg-emerald-950"
                          }`}
                        >
                          {u.status === "active" ? "ระงับ" : "เปิดใช้งาน"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-zinc-500">
                    ไม่พบผู้ใช้ตามเงื่อนไข
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <p>ทั้งหมด {data.total} คน · หน้า {data.page}</p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 disabled:opacity-40"
              >
                <ArrowLeft className="size-3.5" /> ก่อนหน้า
              </button>
              <button
                disabled={data.page * data.pageSize >= data.total}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 disabled:opacity-40"
              >
                ถัดไป <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* มุมมองข้อมูลต่อบทบาท (row-level viewScope) — เฉพาะ module งาน: Content / Episodes */}
        {rolePerms && (
          <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div>
              <p className="text-sm font-semibold">มุมมองข้อมูล (Visibility Scope)</p>
              <p className="mt-1 text-xs text-zinc-500">
                เฉพาะของตัวเอง = เห็นเฉพาะงานที่ตัวเองเป็นเจ้าของ/ผู้รับผิดชอบ · ทีมเดียวกัน =
                เห็นงานของสมาชิกทุกคนในทีมที่ตัวเองสังกัด (ใช้กับ Content และ Episodes) — catalog
                ที่แชร์กัน เช่น ตัวละคร/prompts/แบรนด์ ทุกคนเห็นเหมือนเดิม
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-4 font-medium">บทบาท</th>
                    {SCOPED_MODULES.map((m) => (
                      <th key={m.module} className="py-2 pr-4 font-medium">
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {rolePerms
                    .filter((r) =>
                      r.permissions.some((p) =>
                        SCOPED_MODULES.some((m) => m.module === p.module),
                      ),
                    )
                    .map((r) => (
                      <tr key={r.key}>
                        <td className="py-2 pr-4 text-zinc-200">{r.name}</td>
                        {SCOPED_MODULES.map((m) => {
                          const perm = r.permissions.find((p) => p.module === m.module);
                          if (!perm) {
                            return (
                              <td key={m.module} className="py-2 pr-4 text-xs text-zinc-600">
                                — ไม่มีสิทธิ์ —
                              </td>
                            );
                          }
                          const saving = scopeSaving === `${r.key}:${m.module}`;
                          return (
                            <td key={m.module} className="py-2 pr-4">
                              <FilterSelect
                                value={perm.viewScope}
                                disabled={saving}
                                onChange={(v) =>
                                  changeScope(r.key, m.module, v as ViewScope)
                                }
                                options={[
                                  { value: "all", label: "ทั้งหมด" },
                                  { value: "team", label: "ทีมเดียวกัน" },
                                  { value: "own", label: "เฉพาะของตัวเอง" },
                                ]}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ทีม (viewScope 'team') */}
        <div className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <div>
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold"><Users className="size-4" /> ทีม</p>
            <p className="mt-1 text-xs text-zinc-500">
              ทีมเดียวกัน = เห็นงานของสมาชิกทุกคนในทีมที่ตัวเองสังกัด — ใช้คู่กับมุมมองข้อมูล
              &ldquo;ทีมเดียวกัน&rdquo; ด้านบน (ทีมที่พักไว้จะไม่ถูกนับ)
            </p>
          </div>

          {/* create team */}
          <div className="flex gap-2">
            <input
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateTeam();
                }
              }}
              placeholder="ชื่อทีมใหม่ เช่น ทีมคอนเทนต์ A"
              className={`${inputCls} min-w-52 flex-1 bg-zinc-800`}
            />
            <button
              onClick={() => void handleCreateTeam()}
              disabled={teamBusy === "create" || !newTeamName.trim()}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {teamBusy === "create" ? "กำลังสร้าง..." : "+ สร้างทีม"}
            </button>
          </div>

          {teams === null && <p className="text-xs text-zinc-600">โหลดทีมไม่สำเร็จ</p>}
          {teams && teams.length === 0 && (
            <p className="text-xs text-zinc-600">ยังไม่มีทีม — สร้างทีมแรกแล้วเลือกสมาชิกได้เลย</p>
          )}

          <div className="space-y-3">
            {teams?.map((t) => {
              const busy = teamBusy === t.id;
              return (
                <div
                  key={t.id}
                  className={`rounded-xl border p-4 ${
                    t.status === "active" ? "border-zinc-800" : "border-zinc-800/60 opacity-70"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {renamingTeam?.id === t.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          value={renamingTeam.name}
                          onChange={(e) =>
                            setRenamingTeam({ id: t.id, name: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleRenameTeam();
                            }
                          }}
                          className={`${inputCls} bg-zinc-800 py-1`}
                          autoFocus
                        />
                        <button
                          onClick={() => void handleRenameTeam()}
                          disabled={busy || !renamingTeam.name.trim()}
                          className="rounded-md bg-amber-400 px-2 py-1 text-xs font-semibold text-zinc-950 disabled:opacity-50"
                        >
                          บันทึก
                        </button>
                        <button
                          onClick={() => setRenamingTeam(null)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-400"
                        >
                          ยกเลิก
                        </button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-100">{t.name}</span>
                        <span className="text-xs text-zinc-500">{t.memberCount} คน</span>
                        {t.status === "archived" && (
                          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
                            พักไว้
                          </span>
                        )}
                      </span>
                    )}
                    <span className="flex gap-2">
                      <button
                        onClick={() => setRenamingTeam({ id: t.id, name: t.name })}
                        disabled={busy}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        เปลี่ยนชื่อ
                      </button>
                      <button
                        onClick={() => void handleToggleTeamStatus(t)}
                        disabled={busy}
                        className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {t.status === "active" ? "พักทีม" : "เปิดใช้ทีม"}
                      </button>
                      <button
                        onClick={() => void handleDeleteTeam(t)}
                        disabled={busy}
                        className="rounded-md border border-red-900 px-2 py-1 text-xs text-red-300 hover:bg-red-950 disabled:opacity-50"
                      >
                        ลบ
                      </button>
                    </span>
                  </div>

                  {/* member picker — toggle จากรายชื่อผู้ใช้ในหน้านี้ */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* สมาชิกปัจจุบันที่ไม่อยู่ในหน้ารายชื่อ (เช่น ถูก filter) ยังแสดง/ถอดได้ */}
                    {t.members
                      .filter((m) => !data?.items.some((u) => u.id === m.id))
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => void handleToggleMember(t, m.id)}
                          disabled={busy}
                          className="rounded-full border border-amber-400 bg-amber-400/10 px-3 py-1 text-xs text-amber-300 disabled:opacity-50"
                          title={m.email}
                        >
                          {m.name} <Check className="inline size-3.5" />
                        </button>
                      ))}
                    {data?.items.map((u) => {
                      const isMember = t.members.some((m) => m.id === u.id);
                      return (
                        <button
                          key={u.id}
                          onClick={() => void handleToggleMember(t, u.id)}
                          disabled={busy}
                          className={`rounded-full border px-3 py-1 text-xs disabled:opacity-50 ${
                            isMember
                              ? "border-amber-400 bg-amber-400/10 text-amber-300"
                              : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                          }`}
                          title={u.email}
                        >
                          {u.name}
                          {isMember ? <Check className="inline size-3.5" /> : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* edit panel */}
        {editing && (
          <form
            onSubmit={handleEdit}
            className="space-y-3 rounded-2xl border border-amber-400/30 bg-zinc-900 p-6"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                แก้ไขผู้ใช้ <span className="text-amber-300">{editing.email}</span>
              </p>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
              >
                ปิด
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="ชื่อ *"
                className={`${inputCls} bg-zinc-800`}
              />
              <input
                type="password"
                minLength={8}
                value={editForm.newPassword}
                onChange={(e) => setEditForm({ ...editForm, newPassword: e.target.value })}
                placeholder="รีเซ็ตรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)"
                className={`${inputCls} bg-zinc-800`}
              />
            </div>
            <div className="space-y-1">
              <input
                required
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="อีเมล *"
                className={`${inputCls} bg-zinc-800`}
              />
              <p className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <TriangleAlert className="size-3.5 shrink-0" /> เปลี่ยนอีเมลแล้ว user ต้องใช้อีเมลใหม่ตอน login (extension ด้วย)
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">บทบาท *</p>
              <RoleChecks
                roles={roles}
                selected={editForm.roleKeys}
                onToggle={(key) =>
                  setEditForm((f) => ({
                    ...f,
                    roleKeys: f.roleKeys.includes(key)
                      ? f.roleKeys.filter((k) => k !== key)
                      : [...f.roleKeys, key],
                  }))
                }
              />
            </div>
            <button
              type="submit"
              disabled={editSaving || !editForm.roleKeys.length}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
            >
              {editSaving ? "กำลังบันทึก..." : "บันทึก"}
            </button>
          </form>
        )}
      </div>
    </AppShell>
  );
}
