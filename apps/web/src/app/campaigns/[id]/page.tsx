"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import EntityAvatar from "@/components/EntityAvatar";
import { api, getToken, type CharacterList } from "@/lib/api";
import {
  CAMPAIGN_NEXT,
  CAMPAIGN_OBJECTIVES,
  CAMPAIGN_STATUS,
  CampaignDetail,
  Paged,
  Product,
  fmtDate,
} from "@/lib/catalog";
import { FilterSelect } from "@/components/ui/filter-select";
import { ArrowLeft, Target, Drama, ShoppingBag, Clapperboard } from "lucide-react";

export default function CampaignDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // add character
  const [characterOptions, setCharacterOptions] = useState<CharacterList["items"]>([]);
  const [selectedCharacter, setSelectedCharacter] = useState("");

  // add product (search select)
  const [productQuery, setProductQuery] = useState("");
  const [productOptions, setProductOptions] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<CampaignDetail>(`/campaigns/${id}`);
      setCampaign(res);
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
    // เน้น approved ก่อน แต่ให้เลือกได้ทุก status
    api<CharacterList>("/characters")
      .then((res) =>
        setCharacterOptions(
          [...res.items].sort((a, b) => (a.status === "approved" ? -1 : 0) - (b.status === "approved" ? -1 : 0)),
        ),
      )
      .catch(() => setCharacterOptions([]));
  }, [router, load]);

  async function searchProducts() {
    try {
      const res = await api<Paged<Product>>(
        `/products?pageSize=20${productQuery ? `&q=${encodeURIComponent(productQuery)}` : ""}`,
      );
      setProductOptions(res.items);
      if (res.items.length) setSelectedProduct(res.items[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ค้นหาสินค้าไม่สำเร็จ");
    }
  }

  async function run(fn: () => Promise<unknown>, failMsg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : failMsg);
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (next: string) =>
    run(
      () => api(`/campaigns/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) }),
      "เปลี่ยน status ไม่สำเร็จ",
    );

  const addCharacter = () =>
    selectedCharacter
      ? run(
          () =>
            api(`/campaigns/${id}/characters`, {
              method: "POST",
              body: JSON.stringify({ characterId: selectedCharacter }),
            }),
          "เพิ่ม character ไม่สำเร็จ",
        )
      : undefined;

  const removeCharacter = (characterId: string) =>
    run(
      () => api(`/campaigns/${id}/characters/${characterId}`, { method: "DELETE" }),
      "ลบ character ไม่สำเร็จ",
    );

  const addProduct = () =>
    selectedProduct
      ? run(
          () =>
            api(`/campaigns/${id}/products`, {
              method: "POST",
              body: JSON.stringify({ productId: selectedProduct }),
            }),
          "เพิ่มสินค้าไม่สำเร็จ",
        )
      : undefined;

  const removeProduct = (productId: string) =>
    run(() => api(`/campaigns/${id}/products/${productId}`, { method: "DELETE" }), "ลบสินค้าไม่สำเร็จ");

  const st = campaign ? CAMPAIGN_STATUS[campaign.status] ?? CAMPAIGN_STATUS.brief : null;
  const nextActions = campaign ? CAMPAIGN_NEXT[campaign.status] ?? [] : [];
  const obj = CAMPAIGN_OBJECTIVES.find((o) => o.value === campaign?.objective);

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";
  const cardCls = "rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5";

  return (
    <AppShell
      title={campaign ? `${campaign.displayCode} · ${campaign.name}` : "Campaign"}
      actions={
        <Link href="/campaigns" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="size-4" /> กลับรายการ
        </Link>
      }
    >
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      {!campaign ? (
        <p className="text-sm text-zinc-500">กำลังโหลด...</p>
      ) : (
        <div className="space-y-5">
          {/* header */}
          <div className={cardCls}>
            <div className="flex flex-wrap items-center gap-3">
              {/* cast strip — หน้าตัวละครจริงของแคมเปญ */}
              {campaign.characters.length > 0 && (
                <div className="flex -space-x-3">
                  {campaign.characters.slice(0, 5).map((c) => (
                    <EntityAvatar
                      key={c.id}
                      entityType="character"
                      id={c.id}
                      name={c.nameTh}
                      size="lg"
                      title={`${c.nameTh} (${c.displayCode})`}
                      className="ring-2 ring-zinc-950"
                    />
                  ))}
                  {campaign.characters.length > 5 && (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-xs text-zinc-400 ring-2 ring-zinc-950">
                      +{campaign.characters.length - 5}
                    </span>
                  )}
                </div>
              )}
              <span className="font-mono text-xs text-amber-300">{campaign.displayCode}</span>
              <h2 className="text-xl font-semibold">{campaign.name}</h2>
              {st && <span className={`rounded-full px-2.5 py-1 text-xs ${st.cls}`}>{st.label}</span>}
              <div className="ml-auto flex items-center gap-2">
                {nextActions.map((a) => (
                  <button
                    key={a.to}
                    disabled={busy}
                    onClick={() => changeStatus(a.to)}
                    className={
                      a.approve
                        ? "rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                        : "rounded-lg bg-amber-400 px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
                    }
                  >
                    {a.label}
                  </button>
                ))}
                {campaign.status !== "archived" && (
                  <button
                    disabled={busy}
                    onClick={() => changeStatus("archived")}
                    className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Archive
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div>
                <p className="text-xs text-zinc-500">Objective</p>
                <p>{obj?.label ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">แบรนด์ลูกค้า</p>
                <p>{campaign.clientBrand ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">เริ่ม</p>
                <p>{fmtDate(campaign.startDate)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">สิ้นสุด</p>
                <p>{fmtDate(campaign.endDate)}</p>
              </div>
            </div>
          </div>

          {/* target KPI */}
          <div className={cardCls}>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-300"><Target className="size-4" /> Target KPI</h3>
            {campaign.targetKpi && Object.keys(campaign.targetKpi).length > 0 ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(campaign.targetKpi).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-zinc-500">{k}</p>
                    <p className="text-lg font-semibold text-amber-300">
                      {typeof v === "number" ? v.toLocaleString("th-TH") : String(v)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-500">ยังไม่ได้ตั้ง KPI</p>
            )}
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* linked characters */}
            <div className={cardCls}>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-300"><Drama className="size-4" /> Characters ในแคมเปญ</h3>
              <div className="mb-3 flex items-center gap-2">
                <FilterSelect
                  value={selectedCharacter}
                  onChange={setSelectedCharacter}
                  className="flex-1"
                  options={[
                    { value: "", label: "— เลือก character —" },
                    ...characterOptions.map((c) => ({
                      value: c.id,
                      label: `${c.nameTh} (${c.displayCode})${c.status === "approved" ? "" : ` · ${c.status}`}`,
                    })),
                  ]}
                />
                <button
                  onClick={addCharacter}
                  disabled={busy || !selectedCharacter}
                  className="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600 disabled:opacity-50"
                >
                  + เพิ่ม
                </button>
              </div>
              <ul className="space-y-2">
                {campaign.characters.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                  >
                    <EntityAvatar entityType="character" id={c.id} name={c.nameTh} size="md" />
                    <div className="flex-1">
                      <p className="text-sm">{c.nameTh}</p>
                      <p className="font-mono text-[10px] text-zinc-500">{c.displayCode}</p>
                    </div>
                    <button
                      onClick={() => removeCharacter(c.id)}
                      disabled={busy}
                      className="text-xs text-zinc-500 hover:text-red-300"
                    >
                      เอาออก
                    </button>
                  </li>
                ))}
                {campaign.characters.length === 0 && (
                  <li className="py-4 text-center text-sm text-zinc-500">ยังไม่มี character ในแคมเปญ</li>
                )}
              </ul>
            </div>

            {/* linked products */}
            <div className={cardCls}>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-300"><ShoppingBag className="size-4" /> สินค้าในแคมเปญ</h3>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      searchProducts();
                    }
                  }}
                  placeholder="ค้นหาสินค้า..."
                  className={`${inputCls} w-36`}
                />
                <button
                  onClick={searchProducts}
                  className="rounded-lg border border-zinc-700 px-2 py-2 text-sm hover:bg-zinc-800"
                >
                  ค้นหา
                </button>
                <FilterSelect
                  value={selectedProduct}
                  onChange={setSelectedProduct}
                  className="min-w-0 flex-1"
                  options={[
                    {
                      value: "",
                      label: productOptions.length === 0 ? "— พิมพ์ค้นหาก่อน แล้วเลือกสินค้า —" : "— เลือกสินค้า —",
                    },
                    ...productOptions.map((p) => ({ value: p.id, label: `${p.name} (${p.displayCode})` })),
                  ]}
                />
                <button
                  onClick={addProduct}
                  disabled={busy || !selectedProduct}
                  className="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600 disabled:opacity-50"
                >
                  + เพิ่ม
                </button>
              </div>
              <ul className="space-y-2">
                {campaign.products.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                  >
                    <div className="flex-1">
                      <p className="text-sm">{p.name}</p>
                      <p className="font-mono text-[10px] text-zinc-500">{p.displayCode}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${
                        p.claimRiskLevel === "high"
                          ? "bg-red-900 text-red-200"
                          : p.claimRiskLevel === "medium"
                            ? "bg-amber-900 text-amber-200"
                            : "bg-emerald-900 text-emerald-200"
                      }`}
                    >
                      {p.claimRiskLevel}
                    </span>
                    <button
                      onClick={() => removeProduct(p.id)}
                      disabled={busy}
                      className="text-xs text-zinc-500 hover:text-red-300"
                    >
                      เอาออก
                    </button>
                  </li>
                ))}
                {campaign.products.length === 0 && (
                  <li className="py-4 text-center text-sm text-zinc-500">ยังไม่มีสินค้าในแคมเปญ</li>
                )}
              </ul>
            </div>

            {/* episodes (read-only) */}
            <div className={cardCls}>
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-zinc-300"><Clapperboard className="size-4" /> Episodes</h3>
              <ul className="space-y-2">
                {campaign.episodes.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                  >
                    <span className="font-mono text-[10px] text-amber-300">{e.displayCode}</span>
                    <span className="flex-1 truncate text-sm">{e.title}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{e.status}</span>
                  </li>
                ))}
                {campaign.episodes.length === 0 && (
                  <li className="py-4 text-center text-sm text-zinc-500">
                    ยังไม่มี episode — module Episodes กำลังตามมา
                  </li>
                )}
              </ul>
            </div>

            {/* contents (read-only) */}
            <div className={cardCls}>
              <h3 className="mb-3 text-sm font-semibold text-zinc-300">Content Items</h3>
              <ul className="space-y-2">
                {campaign.contents.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2"
                  >
                    <span className="flex-1 truncate text-sm">{c.title}</span>
                    <span className="text-[10px] text-zinc-500">{c.platform}</span>
                    <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{c.status}</span>
                  </li>
                ))}
                {campaign.contents.length === 0 && (
                  <li className="py-4 text-center text-sm text-zinc-500">
                    ยังไม่มี content — module Content Calendar กำลังตามมา
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
