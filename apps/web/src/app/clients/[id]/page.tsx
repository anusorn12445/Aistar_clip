"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { api, getToken } from "@/lib/api";
import type { Client } from "@/lib/api";
import { JOB_STATUS, JOB_TYPES } from "@/lib/api";
import { fmtDate, fmtPrice } from "@/lib/catalog";
import { MessageSquare, Tag, Clock, ArrowLeft } from "lucide-react";

const CLIENT_TYPE_LABEL: Record<string, string> = {
  brand: "แบรนด์",
  agency: "เอเจนซี่",
  shop: "ร้านค้า",
  individual: "บุคคล",
};

export default function ClientDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.push("/login");
  }, [router]);

  useEffect(() => {
    if (!params.id) return;
    api<Client>(`/clients/${params.id}`)
      .then((res) => {
        setClient(res);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [params.id]);

  return (
    <AppShell title={client ? client.name : "ลูกค้า"}>
      <div className="space-y-5">
        <Link href="/clients" className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300">
          <ArrowLeft className="size-4" /> กลับหน้ารายชื่อลูกค้า
        </Link>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {client && (
          <>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-semibold text-zinc-100">{client.name}</h2>
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  {CLIENT_TYPE_LABEL[client.type ?? ""] ?? client.type ?? "—"}
                </span>
                {client.status === "archived" && (
                  <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-300">archived</span>
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-zinc-400 sm:grid-cols-3">
                {client.contactName && <p>{client.contactName}</p>}
                {client.phone && (
                  <p>
                    <a href={`tel:${client.phone}`} className="hover:text-amber-300">{client.phone}</a>
                  </p>
                )}
                {client.line && <p className="flex items-center gap-1"><MessageSquare className="size-3.5" /> {client.line}</p>}
                {client.email && (
                  <p>
                    <a href={`mailto:${client.email}`} className="hover:text-amber-300">{client.email}</a>
                  </p>
                )}
                {client.brand && <p className="flex items-center gap-1"><Tag className="size-3.5" /> แบรนด์: {client.brand.name}</p>}
              </div>
              {client.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-500">{client.notes}</p>}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-zinc-300">งานของลูกค้ารายนี้ ({client.jobs?.length ?? 0})</p>
              <div className="space-y-2">
                {(client.jobs ?? []).map((j) => {
                  const st = JOB_STATUS[j.status];
                  const ty = JOB_TYPES.find((t) => t.value === j.type);
                  return (
                    <button
                      key={j.id}
                      onClick={() => router.push(`/jobs/${j.id}`)}
                      className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left hover:border-zinc-600"
                    >
                      <div>
                        <span className="font-mono text-xs text-amber-300">{j.displayCode}</span>
                        <span className="ml-2 text-sm text-zinc-100">{j.title}</span>
                        <span className="ml-2 text-xs text-zinc-500">{ty ? `${ty.emoji} ${ty.label}` : j.type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        {j.dueDate && <span className="flex items-center gap-1 text-zinc-500"><Clock className="size-3.5" /> {fmtDate(j.dueDate)}</span>}
                        {j.quotePrice && <span className="text-emerald-300">฿{fmtPrice(j.quotePrice)}</span>}
                        <span className={`rounded-full px-2 py-0.5 ${st.cls}`}>{st.label}</span>
                      </div>
                    </button>
                  );
                })}
                {(client.jobs ?? []).length === 0 && (
                  <p className="rounded-xl border border-dashed border-zinc-700 px-4 py-6 text-center text-sm text-zinc-500">
                    ยังไม่มีงาน — สร้างงานใหม่ได้ที่หน้า Jobs
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
