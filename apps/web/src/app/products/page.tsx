"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import CoverImage from "@/components/CoverImage";
import CoverPicker from "@/components/CoverPicker";
import { FilterSelect } from "@/components/ui/filter-select";
import { api, getToken, type Profile } from "@/lib/api";
import { uploadAsset, type Asset, type AssetList } from "@/lib/assets";
import { primeEntityThumb } from "@/lib/media";
import { promoteCover } from "@/lib/cover";
import {
  Brand,
  CLAIM_RISK,
  PRODUCT_CATEGORIES,
  PRODUCT_STATUS,
  Paged,
  PlatformLinks,
  Product,
  ProductCategory,
  ReviewBrief,
  SOURCE_PLATFORM_LABEL,
  archiveProduct,
  bulkArchiveProducts,
  bulkRestoreProducts,
  bulkSetProductBrand,
  bulkSetProductCategory,
  fmtPrice,
  hardDeleteProduct,
  hasReviewBrief,
  restoreProduct,
} from "@/lib/catalog";
import CatalogManager from "./CatalogManager";
import ProductImportModal from "./ProductImportModal";
import ReviewBriefModal from "./ReviewBriefModal";
import SourceDataModal from "./SourceDataModal";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Eye,
  Film,
  LayoutGrid,
  Link as LinkIcon,
  List,
  Pencil,
  ShoppingBag,
  Tag,
  Trash2,
  X,
} from "lucide-react";

// list response จาก API build ใหม่แนบ imageAssetId (รูป cover) — build เก่าไม่มี ก็ fallback ได้
type ProductRow = Product & { imageAssetId?: string | null };

const FILTER_KEYS = ["q", "brandId", "category", "claimRiskLevel", "status", "priceMin", "priceMax"] as const;

const SORT_OPTIONS = [
  { value: "updatedAt:desc", label: "อัปเดตล่าสุด" },
  { value: "createdAt:desc", label: "สร้างล่าสุด" },
  { value: "name:asc", label: "ชื่อ ก→ฮ" },
  { value: "name:desc", label: "ชื่อ ฮ→ก" },
  { value: "price:asc", label: "ราคาต่ำ→สูง" },
  { value: "price:desc", label: "ราคาสูง→ต่ำ" },
];

// หัวคอลัมน์ที่กดเรียงได้ — โชว์ ▲/▼ เมื่อกำลังเรียงด้วยคอลัมน์นี้, ▲▼ จางเมื่อยังไม่ได้เรียง
function SortableTh({
  label,
  field,
  align = "left",
  curBy,
  curDir,
  onSort,
}: {
  label: string;
  field: string;
  align?: "left" | "right";
  curBy: string;
  curDir: string;
  onSort: (field: string) => void;
}) {
  const active = curBy === field;
  const arrow = active ? (
    curDir === "asc" ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />
  ) : (
    <ChevronsUpDown className="size-4" />
  );
  return (
    <th className={`px-3 py-2.5 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-zinc-200 ${active ? "text-amber-300" : ""}`}
        title={`เรียงตาม ${label}`}
      >
        {align === "right" && <span className={active ? "" : "text-zinc-600"}>{arrow}</span>}
        {label}
        {align === "left" && <span className={active ? "" : "text-zinc-600"}>{arrow}</span>}
      </button>
    </th>
  );
}

const emptyForm = {
  name: "",
  brandId: "",
  category: "",
  packagingType: "",
  description: "",
  price: "",
  salePrice: "",
  shopee: "",
  tiktok_shop: "",
  lazada: "",
  claimRiskLevel: "low",
  commissionNote: "",
};

function ProductsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<Paged<Product> | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<ProductCategory[] | null>(null);
  const [packagingOptions, setPackagingOptions] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    // Prompt ประเภทสินค้า — รายการรูปแบบแพ็กเกจ (แก้/เพิ่มได้ที่เมนู สูตรคลิป)
    api<{ items: { key: string; label: string }[] }>("/clip-jobs/packaging-prompts")
      .then((res) => setPackagingOptions(res.items.map((p) => ({ value: p.key, label: p.label }))))
      .catch(() => setPackagingOptions([]));
  }, []);
  const [showManager, setShowManager] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sourceProduct, setSourceProduct] = useState<Product | null>(null);
  // 📋 ข้อมูลรีวิว — modal ต่อสินค้า (แทนหน้า /products/[id] ที่ไม่มี)
  const [briefProduct, setBriefProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Products Management: bulk select + archived view + admin hard delete ──
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMenu, setBulkMenu] = useState<"category" | "brand" | null>(null); // popover ตั้งหมวด/แบรนด์
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkBrand, setBulkBrand] = useState(""); // "" = ล้างแบรนด์ (ส่ง null)
  const [toast, setToast] = useState<string | null>(null);

  // admin เท่านั้นเห็นปุ่มลบถาวร — ตัดสินจากสิทธิ์ product X (mirror ฝั่ง API)
  const canHardDelete = (profile?.permissions?.product ?? []).includes("X");
  // มุมมองกรุ (ที่เก็บถาวร) — map จาก query archived=1
  const isArchivedView = searchParams.get("archived") === "1";
  const editParam = searchParams.get("edit");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // มุมมอง grid (การ์ดรูปนำ) / list (ตารางแน่น ดูหลายรายการพร้อมกัน) — จำค่าไว้
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const saved = localStorage.getItem("products.viewMode");
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, []);
  function changeView(mode: "grid" | "list") {
    setViewMode(mode);
    localStorage.setItem("products.viewMode", mode);
  }

  // หมวดสินค้าใช้จาก API ถ้าโหลดได้ ไม่งั้น fallback เป็น constant (API build เก่า)
  const categoryOptions = useMemo(
    () =>
      categories && categories.length > 0
        ? categories.map((c) => ({ value: c.key, label: c.label }))
        : PRODUCT_CATEGORIES,
    [categories],
  );
  // map key→label (รวม fallback constant) ใช้บนการ์ด + casting finder deep-link
  const catLabelByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of PRODUCT_CATEGORIES) m.set(c.value, c.label);
    for (const c of categories ?? []) m.set(c.key, c.label);
    return m;
  }, [categories]);

  // form state (create + edit ใช้ตัวเดียวกัน)
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [claims, setClaims] = useState<string[]>([]);
  const [claimInput, setClaimInput] = useState("");
  const [saving, setSaving] = useState(false);

  // brand quick-create inline
  const [newBrandName, setNewBrandName] = useState("");
  const [showNewBrand, setShowNewBrand] = useState(false);

  // debounced search — sync ลง URL
  const [qInput, setQInput] = useState(searchParams.get("q") ?? "");
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setParam = useCallback(
    (patch: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) params.set(k, v);
        else params.delete(k);
      }
      if (!("page" in patch)) params.delete("page"); // เปลี่ยน filter → กลับหน้า 1
      router.replace(`/products${params.toString() ? `?${params}` : ""}`);
    },
    [router, searchParams],
  );

  useEffect(() => {
    setQInput(searchParams.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSearchChange(value: string) {
    setQInput(value);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setParam({ q: value }), 400);
  }

  const loadBrands = useCallback(() => {
    api<Brand[]>("/brands?status=active").then(setBrands).catch(() => setBrands([]));
  }, []);

  const loadCategories = useCallback(() => {
    api<ProductCategory[]>("/categories?status=active")
      .then(setCategories)
      .catch(() => setCategories(null)); // null → fallback เป็น PRODUCT_CATEGORIES
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.push("/login");
      return;
    }
    loadBrands();
    loadCategories();
    // โปรไฟล์สด — ใช้เช็คสิทธิ์ product X (ปุ่มลบถาวร admin-only)
    api<Profile>("/auth/me").then(setProfile).catch(() => setProfile(null));
  }, [router, loadBrands, loadCategories]);

  useEffect(() => {
    const qp = new URLSearchParams(searchParams.toString());
    qp.delete("edit"); // param ฝั่ง UI (เปิดฟอร์มแก้ไข) — ไม่ส่งเข้า API
    const query = qp.toString();
    api<Paged<Product>>(`/products${query ? `?${query}` : ""}`)
      .then((res) => {
        setData(res);
        setError(null);
        // เปลี่ยน filter/หน้า → ล้าง selection (กันติ๊กค้างข้ามหน้า/ข้ามมุมมอง)
        setSelected(new Set());
        setBulkMenu(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ"));
  }, [searchParams]);

  // ?edit=<id> (ปุ่ม ✏️ จากหน้ารายละเอียด) → เปิดฟอร์มแก้ไขให้เลย แล้วล้าง param
  useEffect(() => {
    if (!editParam || !data) return;
    const p = data.items.find((x) => x.id === editParam);
    if (p) {
      openEdit(p);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("edit");
      router.replace(`/products${params.size ? `?${params}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, data]);

  const activeFilters = useMemo(
    () => FILTER_KEYS.filter((k) => searchParams.get(k)).length,
    [searchParams],
  );

  const curSortBy = searchParams.get("sortBy") ?? "updatedAt";
  const curSortDir = searchParams.get("sortDir") ?? "desc";
  const sortValue = `${curSortBy}:${curSortDir}`;

  // กดหัวคอลัมน์เพื่อเรียง — คลิกซ้ำสลับ asc/desc, คอลัมน์ใหม่เริ่มที่ desc (name เริ่ม asc), รีเซ็ตไปหน้า 1
  function toggleSort(field: string) {
    const dir = curSortBy === field ? (curSortDir === "asc" ? "desc" : "asc") : field === "name" ? "asc" : "desc";
    setParam({ sortBy: field, sortDir: dir, page: "" });
  }

  function clearFilters() {
    setQInput("");
    router.replace("/products");
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setClaims([]);
    setClaimInput("");
    setShowForm(true);
  }

  function openEdit(p: Product) {
    setEditing(p);
    setForm({
      name: p.name,
      brandId: p.brandId ?? "",
      category: p.category ?? "",
      packagingType: p.packagingType ?? "",
      description: p.description ?? "",
      price: p.price != null ? String(p.price) : "",
      salePrice: p.salePrice != null ? String(p.salePrice) : "",
      shopee: p.platformLinks?.shopee ?? "",
      tiktok_shop: p.platformLinks?.tiktok_shop ?? "",
      lazada: p.platformLinks?.lazada ?? "",
      claimRiskLevel: p.claimRiskLevel,
      commissionNote: p.commissionNote ?? "",
    });
    setClaims(p.restrictedClaims ?? []);
    setClaimInput("");
    setShowForm(true);
  }

  function addClaim() {
    const v = claimInput.trim();
    if (v && !claims.includes(v)) setClaims([...claims, v]);
    setClaimInput("");
  }

  async function handleQuickBrand() {
    if (!newBrandName.trim()) return;
    try {
      const brand = await api<Brand>("/brands", {
        method: "POST",
        body: JSON.stringify({ name: newBrandName.trim() }),
      });
      setNewBrandName("");
      setShowNewBrand(false);
      loadBrands();
      setForm((f) => ({ ...f, brandId: brand.id }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "สร้างแบรนด์ไม่สำเร็จ");
    }
  }

  async function reload() {
    const query = searchParams.toString();
    const res = await api<Paged<Product>>(`/products${query ? `?${query}` : ""}`);
    setData(res);
  }

  // upload รูปสินค้า (multipart → POST /assets, linkRole cover) — กดได้ทั้งจากการ์ดและในฟอร์ม
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  async function handleImageUpload(productId: string, file: File | undefined) {
    if (!file) return;
    setUploadingId(productId);
    setError(null);
    try {
      const asset = await uploadAsset(file, {
        assetType: "product_image",
        entityType: "product",
        entityId: productId,
        linkRole: "cover",
      });
      // demote ปกเดิม — ไม่งั้น thumbnails() tie-break เลือก cover เก่าสุด รูปใหม่จะไม่ขึ้นหลัง reload
      try {
        const res = await api<AssetList>(
          `/assets?entityType=product&entityId=${encodeURIComponent(productId)}`,
        );
        const imgs = res.items.filter(
          (a: Asset) => a.mimeType.startsWith("image/") && !a.archivedAt,
        );
        await promoteCover("product", productId, asset, imgs, "cover");
      } catch {
        // ถ้า demote ไม่สำเร็จ ยังมี primeEntityThumb ช่วยให้เห็นรูปใหม่ทันทีในเซสชันนี้
      }
      // ยัดเข้า cache ให้รูปโผล่ทันที ไม่ต้องรอ refetch
      primeEntityThumb("product", productId, asset.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "อัปโหลดรูปไม่สำเร็จ");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const platformLinks: PlatformLinks = {};
    if (form.shopee) platformLinks.shopee = form.shopee;
    if (form.tiktok_shop) platformLinks.tiktok_shop = form.tiktok_shop;
    if (form.lazada) platformLinks.lazada = form.lazada;
    const payload = {
      name: form.name,
      brandId: form.brandId || undefined,
      category: form.category || undefined,
      packagingType: form.packagingType || undefined,
      description: form.description || undefined,
      price: form.price ? parseFloat(form.price) : undefined,
      salePrice: form.salePrice ? parseFloat(form.salePrice) : undefined,
      platformLinks,
      claimRiskLevel: form.claimRiskLevel,
      restrictedClaims: claims,
      commissionNote: form.commissionNote || undefined,
    };
    try {
      if (editing) {
        await api<Product>(`/products/${editing.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api<Product>("/products", { method: "POST", body: JSON.stringify(payload) });
      }
      setShowForm(false);
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(next: string) {
    if (!editing) return;
    try {
      await api(`/products/${editing.id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      setShowForm(false);
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เปลี่ยน status ไม่สำเร็จ");
    }
  }

  async function handleArchive() {
    if (!editing) return;
    try {
      await api(`/products/${editing.id}/archive`, { method: "POST" });
      setShowForm(false);
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "archive ไม่สำเร็จ");
    }
  }

  // ── quick actions (การ์ด/แถว): เก็บถาวร / กู้คืน / ลบถาวร ──────────────

  async function quickArchive(p: Product) {
    if (!confirm(`เก็บถาวร "${p.name}"?`)) return;
    setError(null);
    try {
      await archiveProduct(p.id);
      setToast(`เก็บถาวร "${p.name}" แล้ว`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "เก็บถาวรไม่สำเร็จ");
    }
  }

  async function quickRestore(p: Product) {
    setError(null);
    try {
      await restoreProduct(p.id);
      setToast(`กู้คืน"${p.name}" แล้ว`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "กู้คืนไม่สำเร็จ");
    }
  }

  async function quickDelete(p: Product) {
    if (!confirm(`ลบถาวร "${p.name}"? การลบนี้ย้อนกลับไม่ได้`)) return;
    setError(null);
    try {
      await hardDeleteProduct(p.id);
      setToast(`ลบถาวร "${p.name}" แล้ว`);
      await reload();
    } catch (err) {
      // 409 = ผูกกับงานอยู่ — message ไทยแจกแจงจำนวนต่อประเภท โชว์ใน error banner
      setError(err instanceof Error ? err.message : "ลบถาวรไม่สำเร็จ");
    }
  }

  // ── bulk selection helpers + bulk operations ────────────────────────────

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitBulk() {
    setBulkMode(false);
    setSelected(new Set());
    setBulkMenu(null);
  }

  const pageIds = useMemo(() => (data?.items ?? []).map((p) => p.id), [data]);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(pageIds));
  }

  // รัน bulk op หนึ่งครั้ง: toast ผลลัพธ์ + ล้าง selection + reload
  async function runBulk(fn: (ids: string[]) => Promise<string>) {
    if (selected.size === 0 || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    try {
      const msg = await fn([...selected]);
      setToast(msg);
      setSelected(new Set());
      setBulkMenu(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ทำรายการไม่สำเร็จ");
    } finally {
      setBulkBusy(false);
    }
  }

  const bulkArchiveSelected = () =>
    runBulk(async (ids) => {
      const r = await bulkArchiveProducts(ids);
      return `เก็บถาวร ${r.archived} รายการแล้ว`;
    });

  const bulkRestoreSelected = () =>
    runBulk(async (ids) => {
      const r = await bulkRestoreProducts(ids);
      return `กู้คืน${r.restored} รายการแล้ว`;
    });

  const bulkSetCategorySelected = () => {
    if (!bulkCategory) return;
    return runBulk(async (ids) => {
      const r = await bulkSetProductCategory(ids, bulkCategory);
      const label = catLabelByKey.get(bulkCategory) ?? bulkCategory;
      return `ตั้งหมวด "${label}" ${r.updated} รายการแล้ว`;
    });
  };

  const bulkSetBrandSelected = () =>
    runBulk(async (ids) => {
      const r = await bulkSetProductBrand(ids, bulkBrand || null);
      const label = bulkBrand ? brands.find((b) => b.id === bulkBrand)?.name ?? "แบรนด์" : "ไม่ระบุแบรนด์";
      return `ตั้งแบรนด์ "${label}" ${r.updated} รายการแล้ว`;
    });

  const inputCls =
    "rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm outline-none focus:border-amber-400";

  return (
    <AppShell
      title="Products"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowManager(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            จัดการแบรนด์ &amp; หมวดหมู่
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            <Download className="size-4" /> นำเข้าไฟล์
          </button>
          <button
            onClick={openCreate}
            className="rounded-lg bg-amber-400 px-4 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-amber-300"
          >
            + สินค้าใหม่
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* filter bar */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            value={qInput}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ค้นหาชื่อ / รหัสสินค้า..."
            className={`${inputCls} w-56 bg-zinc-900`}
          />
          <FilterSelect
            value={searchParams.get("brandId") ?? ""}
            onChange={(v) => setParam({ brandId: v })}
            options={[
              { value: "", label: "แบรนด์: ทั้งหมด" },
              ...brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("category") ?? ""}
            onChange={(v) => setParam({ category: v })}
            options={[
              { value: "", label: "หมวด: ทั้งหมด" },
              ...categoryOptions.map((c) => ({ value: c.value, label: c.label })),
            ]}
          />
          <FilterSelect
            value={searchParams.get("claimRiskLevel") ?? ""}
            onChange={(v) => setParam({ claimRiskLevel: v })}
            options={[
              { value: "", label: "Claim risk: ทั้งหมด" },
              ...Object.entries(CLAIM_RISK).map(([v, m]) => ({ value: v, label: m.label })),
            ]}
          />
          <FilterSelect
            value={isArchivedView ? "archived" : searchParams.get("status") ?? ""}
            onChange={(v) => {
              // "archived" ไม่ใช่ Product.status — map เป็น query archived=1 (มุมมองกรุ)
              if (v === "archived") setParam({ status: "", archived: "1" });
              else setParam({ status: v, archived: "" });
            }}
            options={[
              { value: "", label: "Status: ทั้งหมด" },
              ...Object.entries(PRODUCT_STATUS).map(([v, m]) => ({ value: v, label: m.label })),
              { value: "archived", label: "ที่เก็บถาวร" },
            ]}
          />
          <input
            type="number"
            min={0}
            value={searchParams.get("priceMin") ?? ""}
            onChange={(e) => setParam({ priceMin: e.target.value })}
            placeholder="฿ ต่ำสุด"
            className={`${inputCls} w-24 bg-zinc-900`}
          />
          <input
            type="number"
            min={0}
            value={searchParams.get("priceMax") ?? ""}
            onChange={(e) => setParam({ priceMax: e.target.value })}
            placeholder="฿ สูงสุด"
            className={`${inputCls} w-24 bg-zinc-900`}
          />
          <FilterSelect
            value={sortValue}
            onChange={(v) => {
              const [sortBy, sortDir] = v.split(":");
              setParam({ sortBy, sortDir });
            }}
            options={SORT_OPTIONS.map((s) => ({ value: s.value, label: `เรียง: ${s.label}` }))}
          />
          {activeFilters > 0 && (
            <button
              onClick={clearFilters}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              ล้าง filter ({activeFilters})
            </button>
          )}
          {/* โหมดเลือกหลายรายการ — โชว์ checkbox บนการ์ด/แถว + แถบ bulk ล่างจอ */}
          <button
            onClick={() => (bulkMode ? exitBulk() : setBulkMode(true))}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              bulkMode
                ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            เลือกหลายรายการ
          </button>
          {bulkMode && (
            <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                className="accent-amber-400"
              />
              เลือกทั้งหน้า
            </label>
          )}
          {/* สลับมุมมอง grid / list */}
          <div className="ml-auto flex overflow-hidden rounded-lg border border-zinc-700">
            <button
              onClick={() => changeView("grid")}
              title="มุมมองการ์ด"
              className={`px-3 py-1.5 text-sm ${
                viewMode === "grid" ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <LayoutGrid className="size-4" /> การ์ด
            </button>
            <button
              onClick={() => changeView("list")}
              title="มุมมองรายการ"
              className={`border-l border-zinc-700 px-3 py-1.5 text-sm ${
                viewMode === "list" ? "bg-amber-400 font-semibold text-zinc-950" : "text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              <List className="size-4" /> รายการ
            </button>
          </div>
        </div>

        {/* create / edit form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-300">
                {editing ? `แก้ไข ${editing.displayCode} — ${editing.name}` : "สินค้าใหม่"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditing(null);
                }}
                className="text-sm text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-4" /> ปิด
              </button>
            </div>
            {/* รูปสินค้า (เฉพาะตอนแก้ไข — ตอนสร้างยังไม่มี entityId ให้ link) */}
            {editing && (
              <div className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <CoverImage
                  assetId={(editing as ProductRow).imageAssetId}
                  entityType="product"
                  entityId={editing.id}
                  name={editing.name}
                  aspect="aspect-square"
                  className="w-20 rounded-lg"
                />
                <div className="space-y-1">
                  <p className="text-xs text-zinc-400">รูปสินค้า (โชว์บนการ์ดและผลค้นหา)</p>
                  <label className="inline-block cursor-pointer rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                    {uploadingId === editing.id ? "กำลังอัปโหลด..." : "อัปโหลดรูปใหม่"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingId === editing.id}
                      onChange={(e) => {
                        void handleImageUpload(editing.id, e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
            {/* ข้อมูลนำเข้า/ต้นทาง — ลิงก์คลิกได้ + เปิดตาราง sourceRaw */}
            {editing && (editing.sourcePlatform || editing.platformLinks?.shopee || editing.sourceRaw) && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
                {editing.sourcePlatform && (
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      (SOURCE_PLATFORM_LABEL[editing.sourcePlatform] ?? SOURCE_PLATFORM_LABEL.generic).cls
                    }`}
                  >
                    {(SOURCE_PLATFORM_LABEL[editing.sourcePlatform] ?? SOURCE_PLATFORM_LABEL.generic).label}
                  </span>
                )}
                {editing.sourceType && (
                  <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-zinc-300">
                    {editing.sourceType}
                  </span>
                )}
                {editing.platformLinks?.shopee && (
                  <a
                    href={editing.platformLinks.shopee}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-300 underline decoration-dotted hover:text-orange-200"
                  >
                    <LinkIcon className="size-4" /> เปิดบน Shopee
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setSourceProduct(editing)}
                  className="ml-auto rounded-lg border border-zinc-700 px-2.5 py-1 text-zinc-300 hover:bg-zinc-800"
                >
                  ข้อมูลต้นทาง
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ชื่อสินค้า *"
                className={inputCls}
              />
              <div className="flex items-center gap-2">
                <FilterSelect
                  value={form.brandId}
                  onChange={(v) => setForm({ ...form, brandId: v })}
                  options={[
                    { value: "", label: "— ไม่ระบุแบรนด์ —" },
                    ...brands.map((b) => ({ value: b.id, label: b.name })),
                  ]}
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setShowNewBrand((v) => !v)}
                  className="whitespace-nowrap rounded-lg border border-zinc-700 px-2 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  + แบรนด์
                </button>
              </div>
            </div>
            {showNewBrand && (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700 p-2">
                <input
                  value={newBrandName}
                  onChange={(e) => setNewBrandName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleQuickBrand();
                    }
                  }}
                  placeholder="ชื่อแบรนด์ใหม่"
                  className={`${inputCls} flex-1`}
                />
                <button
                  type="button"
                  onClick={handleQuickBrand}
                  className="rounded-lg bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600"
                >
                  สร้างแบรนด์
                </button>
              </div>
            )}
            <div className="grid grid-cols-4 gap-3">
              <FilterSelect
                value={form.category}
                onChange={(v) => setForm({ ...form, category: v })}
                options={[
                  { value: "", label: "— หมวดสินค้า —" },
                  ...categoryOptions.map((c) => ({ value: c.value, label: c.label })),
                ]}
              />
              <FilterSelect
                value={form.packagingType}
                onChange={(v) => setForm({ ...form, packagingType: v })}
                options={[
                  { value: "", label: "— รูปแบบสินค้า (แพ็กเกจ) —" },
                  ...packagingOptions,
                ]}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="ราคาปกติ (฿)"
                className={inputCls}
              />
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.salePrice}
                onChange={(e) => setForm({ ...form, salePrice: e.target.value })}
                placeholder="ราคาโปร (฿)"
                className={inputCls}
              />
              <FilterSelect
                value={form.claimRiskLevel}
                onChange={(v) => setForm({ ...form, claimRiskLevel: v })}
                options={Object.entries(CLAIM_RISK).map(([v, m]) => ({
                  value: v,
                  label: `Claim risk: ${m.label}`,
                }))}
              />
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="รายละเอียดสินค้า"
              rows={2}
              className={`${inputCls} w-full`}
            />
            <div className="grid grid-cols-3 gap-3">
              <input
                type="url"
                value={form.shopee}
                onChange={(e) => setForm({ ...form, shopee: e.target.value })}
                placeholder="ลิงก์ Shopee"
                className={inputCls}
              />
              <input
                type="url"
                value={form.tiktok_shop}
                onChange={(e) => setForm({ ...form, tiktok_shop: e.target.value })}
                placeholder="ลิงก์ TikTok Shop"
                className={inputCls}
              />
              <input
                type="url"
                value={form.lazada}
                onChange={(e) => setForm({ ...form, lazada: e.target.value })}
                placeholder="ลิงก์ Lazada"
                className={inputCls}
              />
            </div>
            {/* restrictedClaims chip input — feed AI QC claim check */}
            <div className="space-y-2">
              <p className="text-xs text-zinc-500">
                คำเคลมต้องห้าม (พิมพ์แล้วกด Enter) — ใช้เช็ค claim ตอน AI QC
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {claims.map((c) => (
                  <span
                    key={c}
                    className="flex items-center gap-1 rounded-full bg-red-900/60 px-2 py-1 text-xs text-red-200"
                  >
                    {c}
                    <button
                      type="button"
                      onClick={() => setClaims(claims.filter((x) => x !== c))}
                      className="text-red-300 hover:text-red-100"
                    >
                      <X className="size-4" />
                    </button>
                  </span>
                ))}
                <input
                  value={claimInput}
                  onChange={(e) => setClaimInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addClaim();
                    }
                  }}
                  placeholder="เช่น รักษาสิวหายขาด"
                  className={`${inputCls} w-52`}
                />
              </div>
            </div>
            <input
              value={form.commissionNote}
              onChange={(e) => setForm({ ...form, commissionNote: e.target.value })}
              placeholder="โน้ตค่าคอมมิชชัน"
              className={`${inputCls} w-full`}
            />
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "สร้างสินค้า"}
              </button>
              {editing && (
                <>
                  {editing.status === "active" && (
                    <button
                      type="button"
                      onClick={() => handleStatus("paused")}
                      className="rounded-lg border border-amber-400/50 px-3 py-2 text-sm text-amber-300 hover:bg-amber-400/10"
                    >
                      พักขาย
                    </button>
                  )}
                  {editing.status === "paused" && (
                    <button
                      type="button"
                      onClick={() => handleStatus("active")}
                      className="rounded-lg border border-emerald-500/50 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10"
                    >
                      กลับมาขาย
                    </button>
                  )}
                  {editing.status !== "discontinued" && (
                    <button
                      type="button"
                      onClick={() => handleStatus("discontinued")}
                      className="rounded-lg border border-red-500/50 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                    >
                      เลิกขาย
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleArchive}
                    className="ml-auto rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
                  >
                    Archive
                  </button>
                </>
              )}
            </div>
          </form>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* product card grid — รูปสินค้านำ ราคาเด่น */}
        {viewMode === "grid" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {(data?.items as ProductRow[] | undefined)?.map((p) => {
            const risk = CLAIM_RISK[p.claimRiskLevel] ?? CLAIM_RISK.low;
            const st = PRODUCT_STATUS[p.status] ?? PRODUCT_STATUS.active;
            const catLabel = p.category ? catLabelByKey.get(p.category) : undefined;
            return (
              <div
                key={p.id}
                onClick={() => (bulkMode ? toggleSelect(p.id) : router.push(`/products/${p.id}`))}
                className={`group cursor-pointer overflow-hidden rounded-2xl border bg-zinc-900 transition-all hover:-translate-y-1 hover:border-amber-400/40 hover:shadow-xl hover:shadow-black/40 ${
                  bulkMode && selected.has(p.id)
                    ? "border-amber-400 ring-1 ring-amber-400"
                    : "border-zinc-800"
                }`}
              >
                <CoverImage
                  assetId={p.imageAssetId}
                  entityType="product"
                  entityId={p.id}
                  name={p.name}
                  aspect="aspect-square"
                  className="rounded-none"
                >
                  {/* โหมดเลือกหลายรายการ — checkbox มุมซ้ายบน (เลื่อนป้ายรหัสหลบ) */}
                  {bulkMode && (
                    <span className="absolute left-2 top-2 z-10 rounded-md bg-black/70 p-1 backdrop-blur-sm">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="block h-4 w-4 accent-amber-400"
                      />
                    </span>
                  )}
                  <span
                    className={`absolute top-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-300 backdrop-blur-sm ${
                      bulkMode ? "left-10" : "left-2"
                    }`}
                  >
                    {p.displayCode}
                  </span>
                  <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>
                    {st.label}
                  </span>
                  {/* ปุ่ม เปลี่ยนปก (เลือกจากรูปที่มี) + upload รูปบนการ์ด */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`absolute bottom-2 right-2 flex gap-1 transition-opacity group-hover:opacity-100 ${
                      isArchivedView ? "opacity-100" : "opacity-0"
                    }`}
                  >
                    <CoverPicker
                      entityType="product"
                      entityId={p.id}
                      name={p.name}
                      assetType="product_image"
                      onChanged={() => void reload()}
                      triggerClass="rounded-lg bg-black/60 px-2 py-1 text-xs text-zinc-200 backdrop-blur-sm hover:bg-black/80"
                    />
                    <label
                      title="อัปโหลดรูปสินค้า"
                      className="cursor-pointer rounded-lg bg-black/60 px-2 py-1 text-xs text-zinc-200 backdrop-blur-sm hover:bg-black/80"
                    >
                      {uploadingId === p.id ? "กำลังอัป..." : "อัปรูป"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingId === p.id}
                        onChange={(e) => {
                          void handleImageUpload(p.id, e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {/* quick archive / กู้คืน+ลบถาวร (มุมมองกรุ) */}
                    {!isArchivedView ? (
                      <button
                        onClick={() => void quickArchive(p)}
                        title="เก็บถาวร"
                        className="rounded-lg bg-black/60 px-2 py-1 text-xs text-zinc-200 backdrop-blur-sm hover:bg-black/80 hover:text-amber-300"
                      >
                        <Archive className="size-4" />
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => void quickRestore(p)}
                          title="กู้คืนสินค้านี้"
                          className="rounded-lg bg-black/60 px-2 py-1 text-xs text-emerald-300 backdrop-blur-sm hover:bg-black/80"
                        >
                          กู้คืน
                        </button>
                        {canHardDelete && (
                          <button
                            onClick={() => void quickDelete(p)}
                            title="ลบถาวร (admin เท่านั้น)"
                            className="rounded-lg bg-black/60 px-2 py-1 text-xs text-red-300 backdrop-blur-sm hover:bg-black/80"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </CoverImage>
                <div className="space-y-1.5 px-3 py-2.5">
                  <p className="flex items-center gap-1 truncate text-sm font-medium text-zinc-100" title={p.name}>
                    {/* badge 📋 = สินค้านี้มีข้อมูลรีวิวแล้ว (AI ไม่ต้องเดา) */}
                    {hasReviewBrief(p.reviewBrief) && (
                      <span title="มีข้อมูลรีวิวแล้ว" className="shrink-0 text-[11px]" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {p.brand?.name ?? "ไม่ระบุแบรนด์"}
                    {catLabel && ` · ${catLabel}`}
                  </p>
                  {p.platformLinks?.shopee && (
                    <a
                      href={p.platformLinks.shopee}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-block truncate text-[11px] text-orange-300 hover:text-orange-200"
                    >
                      <LinkIcon className="size-4" /> เปิดบน Shopee
                    </a>
                  )}
                  <div className="flex items-end justify-between gap-2">
                    {p.salePrice != null && p.salePrice !== "" ? (
                      <p className="text-lg font-bold text-emerald-300">
                        ฿{fmtPrice(p.salePrice)}
                        <span className="ml-1.5 align-middle text-xs font-normal text-zinc-500 line-through">
                          ฿{fmtPrice(p.price)}
                        </span>
                      </p>
                    ) : (
                      <p className="text-lg font-bold text-amber-300">฿{fmtPrice(p.price)}</p>
                    )}
                    <span className={`mb-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] ${risk.cls}`}>
                      {risk.label}
                    </span>
                  </div>
                  {/* ปุ่มหลักแบบมีป้ายชื่อ — CEO: icon ล้วนเข้าใจยาก + สีจมบนรูป */}
                  <div className="flex gap-1.5 pt-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => router.push(`/products/${p.id}`)}
                      className="flex-1 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      <Eye className="size-4" /> ดูข้อมูล
                    </button>
                    <button
                      onClick={() => router.push(`/clip-jobs?createFor=${p.id}`)}
                      className="flex-1 rounded-lg bg-amber-400 px-2 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
                    >
                      <Film className="size-4" /> ทำคลิป
                    </button>
                    <button
                      onClick={() => openEdit(p)}
                      className="flex-1 rounded-lg border border-zinc-700 px-2 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
                    >
                      <Pencil className="size-4" /> แก้ไข
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* list view — ตารางแน่น เห็นหลายรายการ + ตัวเลขต้นทาง (ขายเดือน/ทั้งหมด/rating/สต็อก) */}
        {viewMode === "list" && data && data.items.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-zinc-800">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-[11px] uppercase tracking-wider text-zinc-500">
                  {bulkMode && (
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        title="เลือกทั้งหน้า"
                        className="accent-amber-400"
                      />
                    </th>
                  )}
                  <SortableTh label="สินค้า" field="name" curBy={curSortBy} curDir={curSortDir} onSort={toggleSort} />
                  <th className="px-3 py-2.5 font-semibold">แบรนด์ / หมวด</th>
                  <SortableTh label="ราคา" field="price" align="right" curBy={curSortBy} curDir={curSortDir} onSort={toggleSort} />
                  <SortableTh label="ขาย/เดือน" field="soldMonth" align="right" curBy={curSortBy} curDir={curSortDir} onSort={toggleSort} />
                  <SortableTh label="rating" field="rating" align="right" curBy={curSortBy} curDir={curSortDir} onSort={toggleSort} />
                  <th className="px-3 py-2.5 font-semibold">Claim</th>
                  <th className="px-3 py-2.5 font-semibold">สถานะ</th>
                  <th className="px-3 py-2.5 font-semibold">ลิงก์</th>
                  <th className="px-3 py-2.5 font-semibold">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {(data.items as ProductRow[]).map((p) => {
                  const risk = CLAIM_RISK[p.claimRiskLevel] ?? CLAIM_RISK.low;
                  const st = PRODUCT_STATUS[p.status] ?? PRODUCT_STATUS.active;
                  const catLabel = p.category ? catLabelByKey.get(p.category) : undefined;
                  const hasSale = p.salePrice != null && p.salePrice !== "";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => (bulkMode ? toggleSelect(p.id) : router.push(`/products/${p.id}`))}
                      className={`cursor-pointer border-b border-zinc-800/60 transition-colors last:border-0 hover:bg-zinc-800/40 ${
                        bulkMode && selected.has(p.id) ? "bg-amber-400/5" : ""
                      }`}
                    >
                      {bulkMode && (
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="accent-amber-400"
                          />
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <CoverImage
                            assetId={p.imageAssetId}
                            entityType="product"
                            entityId={p.id}
                            name={p.name}
                            aspect="aspect-square"
                            className="w-10 shrink-0 rounded-md"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-100" title={p.name}>
                              {hasReviewBrief(p.reviewBrief) && (
                                <span title="มีข้อมูลรีวิวแล้ว" className="mr-1 text-[11px]" />
                              )}
                              {p.name}
                            </p>
                            <p className="font-mono text-[10px] text-zinc-500">{p.displayCode}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-zinc-300">
                        <p className="truncate">{p.brand?.name ?? "—"}</p>
                        {catLabel && <p className="text-[11px] text-zinc-500">{catLabel}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {hasSale ? (
                          <>
                            <span className="font-semibold text-emerald-300">฿{fmtPrice(p.salePrice)}</span>
                            <span className="ml-1 text-[11px] text-zinc-600 line-through">฿{fmtPrice(p.price)}</span>
                          </>
                        ) : (
                          <span className="font-semibold text-amber-300">฿{fmtPrice(p.price)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-300">
                        {p.soldMonth != null ? Number(p.soldMonth).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-300">
                        {p.rating != null ? `${Number(p.rating).toFixed(1)}` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${risk.cls}`}>{risk.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {p.platformLinks?.shopee ? (
                            <a
                              href={p.platformLinks.shopee}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-orange-300 hover:text-orange-200"
                            >
                              <LinkIcon className="size-4" /> Shopee
                            </a>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/clip-jobs?createFor=${p.id}`);
                            }}
                            className="rounded-lg bg-amber-400 px-2 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-300"
                          >
                            <Film className="size-4" /> ทำคลิป
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(p);
                            }}
                            className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                          >
                            <Pencil className="size-4" /> แก้ไข
                          </button>
                        </span>
                      </td>
                      {/* actions: เก็บถาวร / กู้คืน+ลบถาวร (มุมมองกรุ) */}
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {!isArchivedView ? (
                          <button
                            onClick={() => void quickArchive(p)}
                            className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                          >
                            <Archive className="size-4" /> เก็บ
                          </button>
                        ) : (
                          <span className="flex items-center gap-2">
                            <button
                              onClick={() => void quickRestore(p)}
                              className="rounded-lg border border-emerald-700 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
                            >
                              กู้คืน
                            </button>
                            {canHardDelete && (
                              <button
                                onClick={() => void quickDelete(p)}
                                title="ลบถาวร (admin เท่านั้น)"
                                className="rounded-lg border border-red-800 px-2 py-1 text-xs text-red-400 hover:bg-red-950/40"
                              >
                                <Trash2 className="size-4" /> ลบ
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-zinc-800 px-4 py-14 text-center text-zinc-500">
            <p className="text-3xl"><ShoppingBag className="size-4" /></p>
            <p className="mt-2 text-sm">ไม่พบสินค้าตาม filter — ลองล้าง filter หรือสร้างสินค้าใหม่</p>
          </div>
        )}

        {/* pagination */}
        {data && data.total > data.pageSize && (
          <div className="flex items-center gap-3 text-sm text-zinc-400">
            <button
              disabled={data.page <= 1}
              onClick={() => setParam({ page: String(data.page - 1) })}
              className="rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              <ArrowLeft className="size-4" /> ก่อนหน้า
            </button>
            <span>
              หน้า {data.page} / {Math.ceil(data.total / data.pageSize)}
            </span>
            <button
              disabled={data.page >= Math.ceil(data.total / data.pageSize)}
              onClick={() => setParam({ page: String(data.page + 1) })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1 disabled:opacity-40"
            >
              ถัดไป <ArrowRight className="size-4" />
            </button>
          </div>
        )}
        {data && (
          <p className="text-xs text-zinc-500">ทั้งหมด {data.total} รายการ</p>
        )}
      </div>

      {/* floating bulk bar — โผล่เมื่อเลือก >0 รายการ */}
      {bulkMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          {/* popover ตั้งหมวด / ตั้งแบรนด์ */}
          {bulkMenu === "category" && (
            <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
              <FilterSelect
                value={bulkCategory}
                onChange={setBulkCategory}
                options={[
                  { value: "", label: "— เลือกหมวด —" },
                  ...categoryOptions.map((c) => ({ value: c.value, label: c.label })),
                ]}
              />
              <button
                onClick={() => void bulkSetCategorySelected()}
                disabled={!bulkCategory || bulkBusy}
                className="whitespace-nowrap rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                ยืนยัน
              </button>
            </div>
          )}
          {bulkMenu === "brand" && (
            <div className="absolute bottom-full left-1/2 mb-2 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-2xl">
              <FilterSelect
                value={bulkBrand}
                onChange={setBulkBrand}
                options={[
                  { value: "", label: "— ไม่ระบุแบรนด์ (ล้างออก) —" },
                  ...brands.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
              <button
                onClick={() => void bulkSetBrandSelected()}
                disabled={bulkBusy}
                className="whitespace-nowrap rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50"
              >
                ยืนยัน
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-700 bg-zinc-900/95 px-4 py-2.5 shadow-2xl shadow-black/60 backdrop-blur">
            <span className="text-sm font-medium text-amber-300">
              <Check className="size-4" /> เลือก {selected.size} รายการ
            </span>
            {isArchivedView ? (
              <button
                onClick={() => void bulkRestoreSelected()}
                disabled={bulkBusy}
                className="rounded-lg border border-emerald-500/50 px-3 py-1.5 text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50"
              >
                กู้คืน
              </button>
            ) : (
              <>
                <button
                  onClick={() => void bulkArchiveSelected()}
                  disabled={bulkBusy}
                  className="rounded-lg border border-zinc-600 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  <Archive className="size-4" /> เก็บถาวร
                </button>
                <button
                  onClick={() => setBulkMenu((m) => (m === "category" ? null : "category"))}
                  disabled={bulkBusy}
                  className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${
                    bulkMenu === "category"
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                      : "border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  <Tag className="size-4" /> ตั้งหมวด <ChevronDown className="size-4" />
                </button>
                <button
                  onClick={() => setBulkMenu((m) => (m === "brand" ? null : "brand"))}
                  disabled={bulkBusy}
                  className={`rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50 ${
                    bulkMenu === "brand"
                      ? "border-amber-400/60 bg-amber-400/10 text-amber-300"
                      : "border-zinc-600 text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  ตั้งแบรนด์ <ChevronDown className="size-4" />
                </button>
              </>
            )}
            <button
              onClick={exitBulk}
              disabled={bulkBusy}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 disabled:opacity-50"
            >
              ยกเลิก
            </button>
          </div>
        </div>
      )}

      {/* toast ผลลัพธ์ (auto-hide 4 วิ) */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl border border-emerald-500/40 bg-emerald-950/95 px-4 py-2.5 text-sm text-emerald-200 shadow-2xl backdrop-blur">
          {toast}
        </div>
      )}

      <CatalogManager
        open={showManager}
        onClose={() => {
          setShowManager(false);
          // refetch เผื่อมีการแก้ label/สร้าง/archive → dropdown ต้องอัปเดต
          loadBrands();
          loadCategories();
        }}
      />

      <ProductImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => void reload()}
      />

      <SourceDataModal product={sourceProduct} onClose={() => setSourceProduct(null)} />

      {/* 📋 ข้อมูลรีวิว + คลังรูป — บันทึกแล้วอัปเดต badge บนการ์ดทันที (ไม่ reload ทั้งหน้า) */}
      <ReviewBriefModal
        product={briefProduct}
        onClose={() => {
          setBriefProduct(null);
          void reload(); // sync รูปหลัก/badge หลังจัดการรูปในคลัง
        }}
        onBriefSaved={(productId, brief: ReviewBrief) => {
          setBriefProduct((cur) => (cur && cur.id === productId ? { ...cur, reviewBrief: brief } : cur));
          setData((cur) =>
            cur
              ? {
                  ...cur,
                  items: cur.items.map((it) =>
                    it.id === productId ? { ...it, reviewBrief: brief } : it,
                  ),
                }
              : cur,
          );
        }}
      />
    </AppShell>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsInner />
    </Suspense>
  );
}
