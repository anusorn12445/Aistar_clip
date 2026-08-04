"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type CharacterList } from "@/lib/api";
import { CAST_ROLE_LABEL, CAST_ROLE_OPTIONS, type SeriesDetail } from "@/lib/series";
import { FilterSelect } from "@/components/ui/filter-select";
import { Drama, MapPin, X } from "lucide-react";

interface LocationOption {
  id: string;
  name: string;
  type?: string | null;
}

export default function CastTab({
  series,
  reload,
  onError,
  onNotice,
}: {
  series: SeriesDetail;
  reload: () => Promise<void>;
  onError: (msg: string | null) => void;
  onNotice: (msg: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [allCharacters, setAllCharacters] = useState<{ id: string; displayCode: string; nameTh: string }[]>([]);
  const [allLocations, setAllLocations] = useState<LocationOption[]>([]);
  const [charToAdd, setCharToAdd] = useState("");
  const [roleToAdd, setRoleToAdd] = useState("main");
  const [locationToAdd, setLocationToAdd] = useState("");

  useEffect(() => {
    api<CharacterList>("/characters")
      .then((r) => setAllCharacters(r.items.map((c) => ({ id: c.id, displayCode: c.displayCode, nameTh: c.nameTh }))))
      .catch(() => {});
    api<{ items: LocationOption[] } | LocationOption[]>("/locations")
      .then((r) => setAllLocations(Array.isArray(r) ? r : (r.items ?? [])))
      .catch(() => {});
  }, []);

  async function run<T>(fn: () => Promise<T>, okMessage?: string) {
    setBusy(true);
    onError(null);
    onNotice(null);
    try {
      const result = await fn();
      if (okMessage) onNotice(okMessage);
      await reload();
      return result;
    } catch (err) {
      onError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  const castIds = new Set(series.cast.map((c) => c.characterId));
  const locationIds = new Set(series.locations.map((l) => l.locationId));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Cast */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold"><Drama className="size-4" /> นักแสดงประจำเรื่อง ({series.cast.length})</h3>
          <p className="mt-1 text-xs text-zinc-500">
            ตอนใหม่ที่สร้างจาก Series Hub จะ link ตัวละครเหล่านี้ให้อัตโนมัติ
          </p>
        </div>

        <div className="space-y-2">
          {series.cast.map((member) => {
            const role = CAST_ROLE_LABEL[member.role] ?? CAST_ROLE_LABEL.main;
            return (
              <div key={member.characterId} className="flex flex-wrap items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-semibold text-amber-300">
                  {(member.character?.nameTh ?? "?").slice(0, 2)}
                </span>
                {member.character ? (
                  <Link href={`/characters/${member.character.id}`} className="text-sm hover:text-amber-300 hover:underline">
                    {member.character.nameTh}
                  </Link>
                ) : (
                  <span className="text-sm text-zinc-500">{member.characterId.slice(0, 8)}</span>
                )}
                {member.character && (
                  <span className="font-mono text-[10px] text-zinc-500">{member.character.displayCode}</span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${role.cls}`}>{role.label}</span>
                <div className="flex-1" />
                <FilterSelect
                  disabled={busy}
                  value={member.role}
                  onChange={(v) =>
                    run(
                      () =>
                        api(`/series/${series.id}/characters`, {
                          method: "POST",
                          body: JSON.stringify({ characterId: member.characterId, role: v }),
                        }),
                      "เปลี่ยนบทบาทแล้ว",
                    )
                  }
                  options={CAST_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
                <button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => api(`/series/${series.id}/characters/${member.characterId}`, { method: "DELETE" }),
                      "เอานักแสดงออกจากเรื่องแล้ว",
                    )
                  }
                  className="text-zinc-500 hover:text-red-400"
                  title="เอาออก"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
          {series.cast.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
              ยังไม่มีนักแสดงประจำ — เพิ่มตัวละครเพื่อให้ตอนใหม่ link อัตโนมัติ
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <FilterSelect
            value={charToAdd}
            onChange={setCharToAdd}
            className="flex-1"
            options={[
              { value: "", label: "— เลือกตัวละคร —" },
              ...allCharacters
                .filter((c) => !castIds.has(c.id))
                .map((c) => ({ value: c.id, label: `${c.displayCode} · ${c.nameTh}` })),
            ]}
          />
          <FilterSelect
            value={roleToAdd}
            onChange={setRoleToAdd}
            options={CAST_ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          />
          <button
            disabled={busy || !charToAdd}
            onClick={() =>
              run(
                () =>
                  api(`/series/${series.id}/characters`, {
                    method: "POST",
                    body: JSON.stringify({ characterId: charToAdd, role: roleToAdd }),
                  }),
                "เพิ่มนักแสดงประจำแล้ว",
              ).then(() => setCharToAdd(""))
            }
            className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
          >
            + เพิ่ม
          </button>
        </div>
      </section>

      {/* Locations */}
      <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div>
          <h3 className="flex items-center gap-1.5 font-semibold"><MapPin className="size-4" /> Location ประจำเรื่อง ({series.locations.length})</h3>
          <p className="mt-1 text-xs text-zinc-500">
            ตอนใหม่จะตั้ง location แรกในลิสต์นี้เป็นค่าเริ่มต้น
          </p>
        </div>

        <div className="space-y-2">
          {series.locations.map((link) => (
            <div key={link.locationId} className="flex items-center gap-2 rounded-lg bg-zinc-800/60 px-3 py-2">
              <span className="text-sm">{link.location?.name ?? link.locationId.slice(0, 8)}</span>
              {link.location?.type && (
                <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">{link.location.type}</span>
              )}
              {link.location?.mood && <span className="text-xs text-zinc-500">{link.location.mood}</span>}
              <div className="flex-1" />
              <button
                disabled={busy}
                onClick={() =>
                  run(
                    () => api(`/series/${series.id}/locations/${link.locationId}`, { method: "DELETE" }),
                    "เอา location ออกแล้ว",
                  )
                }
                className="text-zinc-500 hover:text-red-400"
                title="เอาออก"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          {series.locations.length === 0 && (
            <p className="rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-center text-xs text-zinc-500">
              ยังไม่มี location ประจำเรื่อง
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <FilterSelect
            value={locationToAdd}
            onChange={setLocationToAdd}
            className="flex-1"
            options={[
              { value: "", label: "— เลือก location —" },
              ...allLocations
                .filter((l) => !locationIds.has(l.id))
                .map((l) => ({ value: l.id, label: l.name })),
            ]}
          />
          <button
            disabled={busy || !locationToAdd}
            onClick={() =>
              run(
                () =>
                  api(`/series/${series.id}/locations`, {
                    method: "POST",
                    body: JSON.stringify({ locationId: locationToAdd }),
                  }),
                "เพิ่ม location แล้ว",
              ).then(() => setLocationToAdd(""))
            }
            className="rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-400/10 disabled:opacity-40"
          >
            + เพิ่ม
          </button>
        </div>
      </section>
    </div>
  );
}
