// AISTAR → Flow — side panel logic
// workflow ต่อฉาก: ▶ วางลง Flow (รูป+prompt) → กด Generate ใน Flow เอง → ✅ gen แล้ว → ฉากถัดไป

const FLOW_URL_PATTERN = "https://labs.google/*";
const FLOW_HOME = "https://labs.google/fx/tools/flow";
// map API → หน้าเว็บระบบ (ใช้ทำลิงก์ "เปิดในระบบ")
const WEB_BASE = {
  "https://api-production-61ef.up.railway.app/api": "https://web-production-0d162.up.railway.app",
  "http://localhost:4000/api": "http://localhost:3000",
};

const SHOT_STATUS = {
  pending: { label: "รอ gen", cls: "pending" },
  generated: { label: "gen แล้ว", cls: "generated" },
  approved: { label: "ผ่าน ✓", cls: "approved" },
};
const JOB_STATUS = {
  draft: "ร่าง",
  planning: "กำลังวางแผน",
  review: "วางแผนแล้ว",
  generating: "กำลัง gen",
  ready: "พร้อมโพสต์",
  published: "โพสต์แล้ว",
  archived: "เก็บถาวร",
};
const SCENE_ICON = { presenter: "🧑‍🎤", hands: "🤲", product_only: "📦", screen: "🖥️" };

// ── state ──────────────────────────────────────────────────────────────────
let S = { apiBase: "", token: "", refresh: "" };
let currentJob = null;
let refImgs = []; // 🛍️ รูปสินค้าอ้างอิงของงาน {id, sel, url} — ติ๊กแล้วแนบไปกับทุกฉาก
const thumbCache = new Map(); // assetId -> objectURL
const blobCache = new Map(); // assetId -> { blob, mimeType }

// ── storage ────────────────────────────────────────────────────────────────
async function loadState() {
  const st = await chrome.storage.local.get(["apiBase", "token", "refresh"]);
  S = { apiBase: st.apiBase || "", token: st.token || "", refresh: st.refresh || "" };
}
async function saveState() {
  await chrome.storage.local.set(S);
}

// ── api ────────────────────────────────────────────────────────────────────
async function api(path, options = {}, retry = true) {
  const res = await fetch(`${S.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401 && retry && S.refresh) {
    const ok = await tryRefresh();
    if (ok) return api(path, options, false);
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = Array.isArray(body.message) ? body.message.join(", ") : body.message;
    } catch { /* ใช้ msg เดิม */ }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function tryRefresh() {
  try {
    const res = await fetch(`${S.apiBase}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: S.refresh }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    S.token = data.accessToken;
    S.refresh = data.refreshToken ?? S.refresh;
    await saveState();
    return true;
  } catch {
    return false;
  }
}

async function fetchAssetBlob(assetId) {
  if (blobCache.has(assetId)) return blobCache.get(assetId);
  const res = await fetch(`${S.apiBase}/assets/${assetId}/file`, {
    headers: { Authorization: `Bearer ${S.token}` },
  });
  if (!res.ok) throw new Error(`โหลดรูปไม่สำเร็จ (HTTP ${res.status})`);
  const blob = await res.blob();
  const entry = { blob, mimeType: blob.type || "image/png" };
  blobCache.set(assetId, entry);
  return entry;
}

// ── UI helpers ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
function show(viewId) {
  for (const v of ["viewLogin", "viewJobs", "viewShots"]) $(v).classList.toggle("hidden", v !== viewId);
  $("btnLogout").classList.toggle("hidden", viewId === "viewLogin");
  $("btnHome").classList.toggle("hidden", viewId === "viewLogin");
}
let toastTimer = null;
function toast(msg, warn = false) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.toggle("warn", warn);
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), warn ? 6000 : 3000);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ── login ──────────────────────────────────────────────────────────────────
async function doLogin() {
  const btn = $("btnLogin");
  btn.disabled = true;
  $("loginError").classList.add("hidden");
  try {
    S.apiBase = $("inApiBase").value;
    const res = await fetch(`${S.apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: $("inEmail").value.trim(), password: $("inPassword").value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.message || "เข้าสู่ระบบไม่สำเร็จ");
    }
    const data = await res.json();
    S.token = data.accessToken;
    S.refresh = data.refreshToken;
    await saveState();
    await openJobs();
  } catch (e) {
    $("loginError").textContent = e.message;
    $("loginError").classList.remove("hidden");
  } finally {
    btn.disabled = false;
  }
}

// ── jobs ───────────────────────────────────────────────────────────────────
async function openJobs() {
  show("viewJobs");
  refreshCaptureCard().catch(() => {});
  const q = $("inJobSearch").value.trim();
  const status = $("inJobStatus").value;
  const params = new URLSearchParams({ pageSize: "50" });
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  try {
    const data = await api(`/clip-jobs?${params.toString()}`);
    renderJobs(data.items || []);
  } catch (e) {
    if (String(e.message).includes("401")) return show("viewLogin");
    toast(`โหลดงานไม่สำเร็จ: ${e.message}`, true);
  }
}

function renderJobs(items) {
  const list = $("jobList");
  list.innerHTML = "";
  $("jobsEmpty").classList.toggle("hidden", items.length > 0);
  for (const j of items) {
    const btn = document.createElement("button");
    btn.className = "job-item";
    const st = JOB_STATUS[j.status] ?? j.status;
    btn.innerHTML = `
      <span class="code">${esc(j.displayCode)} <span class="chip job">${esc(st)}</span></span>
      <span class="name">${esc(j.name)}</span>
      <span class="sub">${esc(j.subject?.name ?? j.product?.name ?? "—")} · ${j.doneCount ?? 0}/${j.shotCount ?? 0} shots</span>`;
    btn.addEventListener("click", () => openShots(j.id));
    list.appendChild(btn);
  }
}

// ── shots ──────────────────────────────────────────────────────────────────
async function openShots(jobId) {
  try {
    currentJob = await api(`/clip-jobs/${jobId}`);
  } catch (e) {
    return toast(`เปิดงานไม่สำเร็จ: ${e.message}`, true);
  }
  show("viewShots");
  renderJobHead();
  renderShots();
  loadRefImages().catch(() => {});
}

// โหลดรูปสินค้าของงาน (role review_image) มาเป็นตัวเลือกแนบ
async function loadRefImages() {
  refImgs = [];
  const strip = $("refStrip");
  strip.classList.add("hidden");
  if (!currentJob?.productId) return;
  const d = await api(`/assets?entityType=product&entityId=${currentJob.productId}&page=1`);
  const imgs = (d.items ?? [])
    .filter((a) => (a.mimeType ?? "").startsWith("image/") && !a.archivedAt)
    .slice(0, 12);
  if (!imgs.length) return;
  for (const a of imgs) {
    try {
      const { blob } = await fetchAssetBlob(a.id);
      refImgs.push({ id: a.id, sel: false, url: URL.createObjectURL(blob) });
    } catch { /* รูปเสีย — ข้าม */ }
  }
  if (!refImgs.length) return;
  const box = $("refImages");
  box.innerHTML = "";
  refImgs.forEach((im) => {
    const dv = document.createElement("div");
    dv.className = "cap-img";
    const img = document.createElement("img");
    img.src = im.url;
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.textContent = "✓";
    dv.append(img, tick);
    dv.addEventListener("click", () => {
      im.sel = !im.sel;
      dv.classList.toggle("sel", im.sel);
    });
    box.appendChild(dv);
  });
  strip.classList.remove("hidden");
}

function renderJobHead() {
  const j = currentJob;
  $("jobCode").textContent = j.displayCode;
  $("jobName").textContent = j.name;
  $("jobMeta").textContent = `${j.subject?.name ?? j.product?.name ?? "—"} · ${j.platform ?? ""} ${j.targetDurationSec ? `· ${j.targetDurationSec} วิ` : ""}`;
  const webBase = WEB_BASE[S.apiBase] || "";
  $("jobOpenWeb").href = webBase ? `${webBase}/clip-jobs/${j.id}` : "#";
  $("inDrive").value = j.finalVideoUrl ?? "";
  updateDriveOpen();
  const shots = j.shots || [];
  const done = shots.filter((s) => s.status !== "pending").length;
  $("jobProgress").innerHTML = shots.length
    ? `คืบหน้า ${done}/${shots.length} ฉาก<div class="bar"><span style="width:${Math.round((done / shots.length) * 100)}%"></span></div>`
    : "ยังไม่มี shot — ไปแตก Storyboard ในระบบก่อน";
}

function updateDriveOpen() {
  const url = $("inDrive").value.trim();
  const a = $("btnDriveOpen");
  a.classList.toggle("hidden", !url);
  if (url) a.href = url;
}

function renderShots() {
  const list = $("shotList");
  list.innerHTML = "";
  const shots = currentJob.shots || [];
  const currentIdx = shots.findIndex((s) => s.status === "pending");
  shots.forEach((s, i) => {
    const st = SHOT_STATUS[s.status] ?? { label: s.status, cls: "pending" };
    const div = document.createElement("div");
    div.className = `shot${i === currentIdx ? " current" : ""}`;
    const prompt = s.motionPrompt || s.stillPrompt || "";
    div.innerHTML = `
      <div class="shot-head">
        <span class="idx">#${s.shotOrder}</span>
        <span>${SCENE_ICON[s.sceneType] ?? "🎬"}</span>
        <span class="title">${esc(s.title ?? s.section)}</span>
        <span class="muted">${s.durationSec ?? "?"}s</span>
        <span class="chip ${st.cls}">${st.label}</span>
      </div>
      <div class="thumb-slot"></div>
      ${s.dialogue ? `<p class="dialogue">💬 ${esc(s.dialogue)}</p>` : ""}
      <div class="shot-prompt">${esc(prompt) || "<i>ยังไม่มี prompt</i>"}</div>
      ${s.stillPrompt && s.motionPrompt ? `<details><summary>prompt ภาพนิ่ง (gen ใน ChatGPT/Grok)</summary><div class="shot-prompt">${esc(s.stillPrompt)}</div></details>` : ""}
      <div class="shot-actions">
        <button class="flow" data-act="flow">▶ วางลง Flow</button>
        <button class="mini" data-act="copyPrompt">📋 prompt</button>
        <button class="mini" data-act="copyImage" ${s.stillAssetId ? "" : "disabled"}>📋 รูป</button>
        <button class="mini" data-act="download" ${s.stillAssetId ? "" : "disabled"}>⬇️</button>
        <button class="mini done" data-act="generated">✅ gen แล้ว</button>
        <button class="mini approve" data-act="approved">ผ่าน</button>
      </div>`;
    div.querySelectorAll("button[data-act]").forEach((b) =>
      b.addEventListener("click", () => onShotAction(s, b.dataset.act, b))
    );
    list.appendChild(div);
    loadThumb(s, div.querySelector(".thumb-slot"));
  });
}

async function loadThumb(shot, slot) {
  if (!shot.stillAssetId) {
    slot.innerHTML = `<div class="no-img">ยังไม่มีภาพนิ่ง — gen จาก prompt ภาพนิ่งแล้วอัปโหลดใน shot board ก่อน</div>`;
    return;
  }
  try {
    if (!thumbCache.has(shot.stillAssetId)) {
      const { blob } = await fetchAssetBlob(shot.stillAssetId);
      thumbCache.set(shot.stillAssetId, URL.createObjectURL(blob));
    }
    const img = document.createElement("img");
    img.className = "shot-thumb";
    img.src = thumbCache.get(shot.stillAssetId);
    slot.replaceChildren(img);
  } catch {
    slot.innerHTML = `<div class="no-img">โหลดรูปไม่สำเร็จ</div>`;
  }
}

// ── shot actions ───────────────────────────────────────────────────────────
async function onShotAction(shot, act, btn) {
  try {
    if (act === "flow") return await sendToFlow(shot, btn);
    if (act === "copyPrompt") {
      await navigator.clipboard.writeText(shot.motionPrompt || shot.stillPrompt || "");
      return toast("ก๊อป prompt แล้ว — Ctrl+V ใน Flow ได้เลย");
    }
    if (act === "copyImage") return await copyImage(shot);
    if (act === "download") return await downloadImage(shot);
    if (act === "generated" || act === "approved") return await setShotStatus(shot, act);
  } catch (e) {
    toast(e.message, true);
  }
}

async function setShotStatus(shot, status) {
  await api(`/clip-jobs/${currentJob.id}/shots/${shot.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  shot.status = status;
  renderJobHead();
  renderShots();
  toast(status === "generated" ? `✅ ฉาก #${shot.shotOrder} gen แล้ว — ต่อฉากถัดไป` : `ฉาก #${shot.shotOrder} ผ่าน ✓`);
  // เลื่อนไปฉาก pending ถัดไป
  const next = document.querySelector(".shot.current");
  if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
}

// แปลงรูปเป็น PNG (clipboard รับเฉพาะ PNG)
async function toPngBlob(blob) {
  if (blob.type === "image/png") return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bmp.width, bmp.height);
  canvas.getContext("2d").drawImage(bmp, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}

async function copyImage(shot) {
  const { blob } = await fetchAssetBlob(shot.stillAssetId);
  const png = await toPngBlob(blob);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  toast("ก๊อปรูปแล้ว — คลิกในหน้า Flow แล้วกด Ctrl+V (Cmd+V)");
}

async function downloadImage(shot) {
  const { blob, mimeType } = await fetchAssetBlob(shot.stillAssetId);
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const url = URL.createObjectURL(blob);
  await chrome.downloads.download({ url, filename: `${currentJob.displayCode}_scene${shot.shotOrder}.${ext}` });
  toast(`ดาวน์โหลด scene${shot.shotOrder} แล้ว`);
}

// ── ส่งเข้า Flow ───────────────────────────────────────────────────────────
async function findFlowTab() {
  const tabs = await chrome.tabs.query({ url: FLOW_URL_PATTERN });
  if (!tabs.length) return null;
  return tabs.find((t) => t.active) ?? tabs[0];
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function sendToFlow(shot, btn) {
  btn.disabled = true;
  btn.textContent = "กำลังส่ง...";
  try {
    const tab = await findFlowTab();
    if (!tab) {
      await chrome.tabs.create({ url: FLOW_HOME });
      toast("ยังไม่มีแท็บ Flow — เปิดให้แล้ว รอโหลดเสร็จแล้วกด ▶ อีกครั้ง", true);
      return;
    }
    // ให้แน่ใจว่า content script พร้อม (เผื่อแท็บเปิดค้างก่อนติดตั้ง extension)
    await chrome.runtime.sendMessage({ type: "ENSURE_CONTENT", tabId: tab.id });
    await chrome.tabs.update(tab.id, { active: true });

    const results = [];
    // 1) รวมไฟล์ที่จะแนบ: ภาพนิ่งของฉาก + รูปสินค้าอ้างอิงที่ติ๊ก → แนบทีเดียวหลายไฟล์ (v1.5)
    const files = [];
    if (shot.stillAssetId) {
      const { blob, mimeType } = await fetchAssetBlob(shot.stillAssetId);
      files.push({
        dataUrl: await blobToDataUrl(blob),
        name: `scene${shot.shotOrder}.${mimeType.includes("png") ? "png" : "jpg"}`,
        mimeType,
      });
    }
    for (const im of refImgs.filter((x) => x.sel)) {
      try {
        const { blob, mimeType } = await fetchAssetBlob(im.id);
        files.push({
          dataUrl: await blobToDataUrl(blob),
          name: `ref-${files.length}.${mimeType.includes("png") ? "png" : "jpg"}`,
          mimeType,
        });
      } catch { /* รูปเสีย — ข้าม */ }
    }
    if (files.length) {
      const r = await chrome.tabs.sendMessage(tab.id, { type: "ATTACH_IMAGES", files }).catch(() => null);
      results.push(
        r?.ok
          ? `รูป ${files.length} ใบ: ${r.method}`
          : `รูป: ไม่สำเร็จ${r ? "" : " (รีเฟรชแท็บ Flow 1 ครั้งหลังอัปเดต extension)"}`,
      );
      if (!r?.ok && shot.stillAssetId) {
        // fallback: ก๊อปภาพนิ่งของฉากเข้าคลิปบอร์ด (คลิปบอร์ดได้ทีละรูป)
        try {
          await copyImage(shot);
          results[results.length - 1] = "รูป: ก๊อปภาพฉากเข้าคลิปบอร์ดแล้ว (Ctrl+V ใน Flow — รูปอ้างอิงวางเพิ่มทีละใบ)";
        } catch { /* ปล่อยข้อความเดิม */ }
      }
    }
    // 2) วาง prompt
    const text = shot.motionPrompt || shot.stillPrompt || "";
    const rp = await chrome.tabs.sendMessage(tab.id, { type: "INSERT_PROMPT", text });
    results.push(rp?.ok ? "prompt: วางแล้ว" : "prompt: ไม่สำเร็จ (ใช้ปุ่ม 📋)");

    const allOk = !results.some((x) => x.includes("ไม่สำเร็จ"));
    toast(`ฉาก #${shot.shotOrder} → ${results.join(" · ")}${allOk ? " — กด Generate ใน Flow ได้เลย" : ""}`, !allOk);
  } finally {
    btn.disabled = false;
    btn.textContent = "▶ วางลง Flow";
  }
}

// ── drive link ─────────────────────────────────────────────────────────────
async function saveDrive() {
  const url = $("inDrive").value.trim();
  await api(`/clip-jobs/${currentJob.id}`, { method: "PATCH", body: JSON.stringify({ finalVideoUrl: url }) });
  currentJob.finalVideoUrl = url;
  updateDriveOpen();
  toast("บันทึกโฟลเดอร์ Drive แล้ว");
}

// ── 📥 ดูดหน้าสินค้า Shopee เข้า AISTAR — คนเป็นตัวกรอง: เลือกรูป/รีวิว/แก้ข้อมูล จบในแผงนี้ ──
let scraped = null;
let captureTarget = null; // {id,name,displayCode} หรือ {create:true}
let capProductId = null; // product ที่จะบันทึกเข้า (ตั้งตอน AI เตรียม)
let capImages = []; // {url, sel}
let capReviews = []; // {stars, text, sel}
let capCategories = null; // cache GET /categories
let capCompleted = false; // true หลังบันทึกครบ — เอาไว้เช็คว่ามีงานคัดค้างยังไม่บันทึกไหม

async function loadCapCategories() {
  if (capCategories) return capCategories;
  try {
    const d = await api("/categories");
    capCategories = (Array.isArray(d) ? d : d.items ?? []).filter((c) => c.status !== "archived");
  } catch {
    capCategories = [];
  }
  const sel = $("inCapCategory");
  sel.innerHTML = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "— ไม่ตั้ง/ไม่เปลี่ยน —";
  sel.appendChild(none);
  for (const c of capCategories) {
    const o = document.createElement("option");
    o.value = c.key;
    o.textContent = c.label;
    sel.appendChild(o);
  }
  return capCategories;
}

// จับคู่ path หมวดจาก Shopee กับหมวดในระบบ (seed ตามหมวดหลัก Shopee — ชื่อไทยตรง/ใกล้กัน)
function matchCategory(path) {
  if (!path?.length || !capCategories?.length) return "";
  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  for (const seg of path) {
    const ns = norm(seg);
    const hit = capCategories.find((c) => {
      const nl = norm(c.label);
      return nl === ns || nl.includes(ns) || ns.includes(nl);
    });
    if (hit) return hit.key;
  }
  return "";
}

async function findShopeeTab() {
  const tabs = await chrome.tabs.query({ url: "https://shopee.co.th/*" });
  return tabs.find((t) => t.active) ?? tabs[0] ?? null;
}

async function refreshCaptureCard() {
  const tab = S.token ? await findShopeeTab() : null;
  $("captureCard").classList.toggle("hidden", !tab);
  if (tab) $("captureTabName").textContent = (tab.title || tab.url || "").slice(0, 90);
}

function captureLog(text, cls = "") {
  const p = document.createElement("p");
  if (cls) p.className = cls;
  p.textContent = text;
  $("captureProgress").appendChild(p);
  return p;
}

function renderCapImages() {
  const box = $("capImages");
  box.innerHTML = "";
  capImages.forEach((im) => {
    const d = document.createElement("div");
    d.className = `cap-img${im.sel ? " sel" : ""}`;
    const img = document.createElement("img");
    img.src = im.previewUrl ?? im.url;
    img.loading = "lazy";
    const tick = document.createElement("span");
    tick.className = "tick";
    tick.textContent = "✓";
    d.append(img, tick);
    // ป้ายบอกแหล่ง: รูปที่ทีมหามาเสริมจากข้างนอก
    if (im.src === "external" || im.src === "file") {
      const b = document.createElement("span");
      b.className = "src-badge";
      b.textContent = im.src === "file" ? "📁" : "🌐";
      d.appendChild(b);
    }
    d.addEventListener("click", () => {
      im.sel = !im.sel;
      renderCapImages();
    });
    box.appendChild(d);
  });
  $("capImgCount").textContent = String(capImages.filter((i) => i.sel).length);
}

function addExternalUrlImage(url) {
  const u = url.trim();
  if (!/^https?:\/\//.test(u)) return toast("ลิงก์รูปต้องขึ้นต้นด้วย http(s)", true);
  capImages.push({ url: u, previewUrl: u, sel: true, src: "external" });
  renderCapImages();
}

function addFileImages(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    capImages.push({ file: f, previewUrl: URL.createObjectURL(f), sel: true, src: "file" });
  }
  renderCapImages();
}

function renderCapReviews() {
  const box = $("capReviews");
  box.innerHTML = "";
  if (!capReviews.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "ยังอ่านรีวิวไม่ได้ — รีเฟรชแท็บ Shopee 1 ครั้งแล้วกดอ่านใหม่ (ระบบจะกดแท็บ 5 ดาวให้เอง) หรือกด ➕ เพิ่มรีวิวเอง";
    box.appendChild(p);
    return;
  }
  capReviews.forEach((rv) => {
    const row = document.createElement("div");
    row.className = "cap-review";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = rv.sel;
    cb.addEventListener("change", () => { rv.sel = cb.checked; });
    const st = document.createElement("span");
    st.className = "stars";
    st.textContent = rv.stars ? `${rv.stars}★` : "—";
    const ta = document.createElement("textarea");
    ta.value = rv.text;
    ta.rows = 2;
    ta.addEventListener("input", () => { rv.text = ta.value; });
    row.append(cb, st, ta);
    box.appendChild(row);
  });
}

// ── 🏠 หน้าแรก / จอเสร็จแล้ว (v1.6 — CEO: gen เสร็จแล้วค้าง ไม่รู้กลับไปเริ่มต้นยังไง) ──

// จอเสร็จแล้ว: พับฟอร์มคัดทั้งหมด เหลือสรุป + ทางไปต่อ 3 ทาง
function showCaptureDone() {
  capCompleted = true;
  const imgs = capImages.filter((i) => i.sel).length;
  const revs = capReviews.filter((r) => r.sel && r.text.trim().length >= 5).length;
  $("captureResult").classList.add("hidden");
  $("doneName").textContent = `"${$("inCapName").value.trim() || "สินค้า"}"`;
  $("doneStats").textContent = `รูป ${imgs} · รีวิว ${revs} · Review Brief ✓`;
  const webBase = WEB_BASE[S.apiBase] || "";
  const a = $("btnDoneOpen");
  if (webBase && capProductId) { a.href = `${webBase}/products/${capProductId}`; a.classList.remove("hidden"); }
  else a.classList.add("hidden");
  $("captureDone").classList.remove("hidden");
}

// ล้างสถานะการคัดทั้งหมด กลับสภาพพร้อมดูดรอบใหม่
function resetCapture() {
  for (const im of capImages) if (im.previewUrl?.startsWith("blob:")) URL.revokeObjectURL(im.previewUrl);
  scraped = null;
  captureTarget = null;
  capProductId = null;
  capImages = [];
  capReviews = [];
  capCompleted = false;
  $("captureResult").classList.add("hidden");
  $("captureDone").classList.add("hidden");
  $("captureProgress").innerHTML = "";
  $("capBrief").classList.add("hidden");
  $("captureTarget").classList.add("hidden");
  $("btnTargetChange").classList.add("hidden");
  $("capTargetPicker").classList.add("hidden");
  $("btnCapturePrepare").classList.add("hidden");
}

// มีงานคัดค้างที่ยังไม่ได้บันทึกไหม (ไว้ถามก่อนทิ้ง)
function hasUnsavedCapture() {
  return !!scraped && !capCompleted;
}

// กลับหน้าแรก = รายการงาน + การ์ดดูดสินค้าแบบเริ่มต้น
async function goHome() {
  if (hasUnsavedCapture() && !confirm("ข้อมูลที่คัดไว้ยังไม่บันทึก — ทิ้งเลยไหม?")) return;
  resetCapture();
  currentJob = null;
  $("inJobSearch").value = "";
  $("inJobStatus").value = "";
  await openJobs();
}

async function scrapePage() {
  const tab = await findShopeeTab();
  if (!tab) return toast("ไม่พบแท็บ Shopee — เปิดหน้าสินค้าก่อน", true);
  await chrome.runtime.sendMessage({ type: "ENSURE_SHOPEE", tabId: tab.id });
  let r = null;
  try {
    r = await chrome.tabs.sendMessage(tab.id, { type: "SCRAPE_PRODUCT_V2" });
  } catch {
    return toast("อ่านหน้านี้ไม่ได้ — รีเฟรชแท็บ Shopee 1 ครั้ง (จำเป็นหลังอัปเดต extension) แล้วลองใหม่", true);
  }
  if (!r?.ok) return toast(r?.error ?? "อ่านข้อมูลจากหน้านี้ไม่สำเร็จ", true);
  scraped = r;
  captureTarget = null;
  capProductId = null;
  capCompleted = false;
  $("captureDone").classList.add("hidden");
  capImages = r.images.map((url, i) => ({ url, previewUrl: url, sel: i < 6, src: "shopee" }));
  // default ติ๊กเฉพาะ 4-5 ดาว — คนเปิดติ๊กตัวอื่นเองได้ (คนคือตัวกรองสุดท้าย)
  capReviews = r.reviews.map((rv) => ({ stars: rv.stars, text: rv.text, sel: true })); // CEO: ติ๊กให้หมดเลย

  $("captureResult").classList.remove("hidden");
  $("capBrief").classList.add("hidden");
  $("captureTarget").classList.add("hidden");
  $("btnCapturePrepare").classList.add("hidden");
  $("captureProgress").innerHTML = "";
  $("inCapName").value = r.name ?? "";
  $("inCapPrice").value = r.price ?? "";
  $("inCapShop").value = r.shopName ?? "";
  $("inCapDesc").value = r.description ?? "";
  await loadCapCategories();
  const matched = matchCategory(r.categoryPath);
  $("inCapCategory").value = matched;
  $("capCatHint").textContent = r.categoryPath?.length
    ? `(จาก Shopee: ${r.categoryPath.join(" > ")}${matched ? "" : " — ไม่ตรงหมวดไหน เลือกเอง"})`
    : "(หน้านี้ไม่บอกหมวด — เลือกเองได้)";
  renderCapImages();
  renderCapReviews();
  const srcLabel = r.source === "dom+api" ? "อ่านหน้า + API รีวิว/ร้าน ✓" : "อ่านจากหน้าเว็บ";
  const bits = [
    `แพลตฟอร์ม: Shopee ✓`,
    srcLabel,
    `รูป ${r.images.length}`,
    `รีวิว ${r.reviews.length}`,
    r.rating ? `เรตติ้ง ${r.rating}` : null,
    r.soldCount ? `ขายแล้ว ${r.soldCount}` : null,
  ].filter(Boolean);
  $("captureSummary").textContent = `${bits.join(" · ")} — คัด/แก้ด้านล่างก่อนเข้าระบบ`;
  $("inCaptureSearch").value = (r.name ?? "").split(/\s+/).slice(0, 3).join(" ");
  await autoPickTarget(r.name ?? "");
}

// เลือกสินค้าปลายทางให้อัตโนมัติ: ชื่อตรง/ใกล้เคียง = เก็บเข้าตัวนั้น, ไม่เจอ = สร้างใหม่
// (CEO: ไม่ต้องถาม — แต่กด "เปลี่ยน" ได้)
async function autoPickTarget(name) {
  const norm = (s) => String(s).replace(/\s+/g, "").toLowerCase();
  let hit = null;
  try {
    const q = name.split(/\s+/).slice(0, 3).join(" ");
    const data = await api(`/products?status=active&pageSize=8${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    const items = data.items ?? [];
    hit =
      items.find((p) => norm(p.name) === norm(name)) ??
      items.find((p) => norm(name).includes(norm(p.name)) || norm(p.name).includes(norm(name).slice(0, 25)));
  } catch { /* เลือกไม่ได้ → สร้างใหม่ */ }
  if (hit) setCaptureTarget({ id: hit.id, name: hit.name, displayCode: hit.displayCode, category: hit.category ?? null, auto: true });
  else setCaptureTarget({ create: true, auto: true });
  $("btnTargetChange").classList.remove("hidden");
  $("capTargetPicker").classList.add("hidden");
  searchCaptureProducts().catch(() => {});
}

async function searchCaptureProducts() {
  const q = $("inCaptureSearch").value.trim();
  const params = new URLSearchParams({ pageSize: "8" });
  if (q) params.set("q", q);
  let items = [];
  try {
    const data = await api(`/products?status=active&${params.toString()}`);
    items = data.items ?? [];
  } catch { /* โชว์ลิสต์ว่าง */ }
  const box = $("captureMatches");
  box.innerHTML = "";
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "ไม่พบสินค้า — ลองคำค้นสั้นลง หรือกดสร้างใหม่ด้านล่าง";
    box.appendChild(p);
  }
  for (const p of items) {
    const b = document.createElement("button");
    b.textContent = `${p.name} (${p.displayCode})`;
    b.addEventListener("click", () => setCaptureTarget({ id: p.id, name: p.name, displayCode: p.displayCode, category: p.category ?? null }));
    box.appendChild(b);
  }
}

function setCaptureTarget(t) {
  captureTarget = t;
  capProductId = t.create ? null : t.id;
  // สินค้าเดิมมีหมวดอยู่แล้ว → default "ไม่เปลี่ยน" (คนเลือกทับเองได้)
  if (!t.create && t.category) $("inCapCategory").value = "";
  const el = $("captureTarget");
  el.textContent = t.create
    ? `➕ จะสร้างสินค้าใหม่: ${$("inCapName").value}${t.auto ? " (ไม่พบในระบบ — เลือกให้อัตโนมัติ)" : ""}`
    : `✅ เก็บเข้า: ${t.name} (${t.displayCode})${t.auto ? " — จับคู่ให้อัตโนมัติ" : ""}`;
  el.classList.remove("hidden");
  $("btnCapturePrepare").classList.remove("hidden");
  $("capTargetPicker").classList.add("hidden");
}

// เติมเฉพาะช่องที่ยังว่าง — ของที่ทีมกรอกไว้แล้วไม่โดนทับ
function fillEmptyBrief(existing, incoming) {
  const out = { ...(existing ?? {}) };
  for (const [k, v] of Object.entries(incoming ?? {})) {
    const cur = out[k];
    const curEmpty = Array.isArray(cur) ? cur.length === 0 : !String(cur ?? "").trim();
    if (curEmpty && v != null) out[k] = v;
  }
  return out;
}

// ขั้น 🤖: สร้างสินค้า (ถ้าเลือกสร้างใหม่) + ให้ AI แตก Brief มาให้แก้ก่อนบันทึก
async function prepareBrief() {
  const btn = $("btnCapturePrepare");
  btn.disabled = true;
  btn.textContent = "🤖 AI กำลังเตรียม...";
  try {
    if (!capProductId && captureTarget?.create) {
      const created = await api("/products", {
        method: "POST",
        body: JSON.stringify({
          name: $("inCapName").value.trim(),
          ...($("inCapCategory").value ? { category: $("inCapCategory").value } : {}),
          ...($("inCapPrice").value ? { price: Number($("inCapPrice").value) } : {}),
          ...($("inCapDesc").value.trim() ? { description: $("inCapDesc").value.trim().slice(0, 500) } : {}),
        }),
      });
      capProductId = created.id;
      captureTarget = { id: created.id, name: created.name, displayCode: created.displayCode };
      $("captureTarget").textContent = `✅ สร้างแล้ว เก็บเข้า: ${created.name} (${created.displayCode})`;
      captureLog(`✅ สร้างสินค้า ${created.displayCode} แล้ว`, "ok");
    }
    const briefText = [
      $("inCapName").value.trim(),
      $("inCapDesc").value.trim(),
      $("inCapShop").value.trim() ? `ร้าน: ${$("inCapShop").value.trim()}` : "",
      scraped?.rating ? `เรตติ้ง: ${scraped.rating}${scraped.ratingCount ? ` (${scraped.ratingCount} รีวิว)` : ""}` : "",
      scraped?.categoryPath?.length ? `หมวดจาก Shopee: ${scraped.categoryPath.join(" > ")}` : "",
      scraped?.url ? `ลิงก์: ${scraped.url}` : "",
    ].filter(Boolean).join("\n\n");
    const ex = await api(`/products/${capProductId}/review-brief/extract`, {
      method: "POST",
      body: JSON.stringify({ text: briefText }),
    });
    const current = await api(`/products/${capProductId}`);
    const b = fillEmptyBrief(current.reviewBrief, ex.brief);
    $("bfHighlights").value = (b.highlights ?? []).join("\n");
    $("bfSpecs").value = b.specs ?? "";
    $("bfTarget").value = b.targetAudience ?? "";
    $("bfPain").value = b.painPoint ?? "";
    $("bfHowTo").value = (b.howToUse ?? []).join("\n");
    $("bfPromo").value = b.promo ?? "";
    $("bfCautions").value = b.cautions ?? "";
    $("bfNote").value = b.extraNote ?? "";
    $("capBrief").classList.remove("hidden");
    captureLog("✏️ AI เตรียม Brief แล้ว — แก้ทุกช่องได้ แล้วค่อยกดบันทึก", "ok");
  } catch (e) {
    captureLog(`❌ ${e.message}`, "fail");
  } finally {
    btn.disabled = false;
    btn.textContent = "🤖 ให้ AI เตรียม Review Brief (แก้ก่อนบันทึกได้)";
  }
}

// ขั้น 💾: บันทึกเฉพาะที่คนคัดแล้ว — brief ตามที่แก้ / รูปที่ติ๊ก / รีวิวที่ติ๊ก (ใส่ตรง ไม่ผ่าน AI คัดซ้ำ)
async function saveAll() {
  if (!capProductId) return;
  const btn = $("btnCaptureSave");
  btn.disabled = true;
  try {
    const lines = (v) => v.split("\n").map((s) => s.trim()).filter(Boolean);
    const catKey = $("inCapCategory").value;
    await api(`/products/${capProductId}`, {
      method: "PATCH",
      body: JSON.stringify({
        ...(catKey ? { category: catKey } : {}),
        reviewBrief: {
          highlights: lines($("bfHighlights").value),
          specs: $("bfSpecs").value.trim(),
          targetAudience: $("bfTarget").value.trim(),
          painPoint: $("bfPain").value.trim(),
          howToUse: lines($("bfHowTo").value),
          promo: $("bfPromo").value.trim(),
          cautions: $("bfCautions").value.trim(),
          extraNote: $("bfNote").value.trim(),
        },
      }),
    });
    captureLog(`✅ Review Brief บันทึกแล้ว${catKey ? ` + ตั้งหมวด "${$("inCapCategory").selectedOptions[0]?.textContent}"` : ""}`, "ok");

    const imgs = capImages.filter((i) => i.sel);
    // 🧹 CEO: ดึงซ้ำ = ทับของเก่า — ล้างรูปชุดที่ระบบเคยดูดไว้ (role review_image) ก่อนใส่ชุดใหม่
    // รูปปก/รูปที่อัปเองบทบาทอื่นไม่โดนแตะ
    if (imgs.length) {
      try {
        const line = captureLog("🧹 ล้างรูปชุดเก่า (ทับของเก่า)...");
        let cleared = 0;
        for (let round = 0; round < 10; round++) {
          const d = await api(`/assets?entityType=product&entityId=${capProductId}&page=1`);
          const olds = (d.items ?? []).filter((a) =>
            (a.links ?? []).some(
              (l) => l.entityType === "product" && l.entityId === capProductId && l.linkRole === "review_image",
            ),
          );
          if (!olds.length) break;
          for (const a of olds) {
            await api(`/assets/${a.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) });
            cleared++;
          }
        }
        line.textContent = cleared ? `🧹 ทับของเก่า: เอารูปชุดเก่าออก ${cleared} รูป` : "🧹 ไม่มีรูปชุดเก่า — ใส่ชุดใหม่เลย";
        line.className = "ok";
      } catch { /* ล้างไม่สำเร็จ — ใส่ชุดใหม่ต่อได้ */ }
    }
    if (imgs.length) {
      const line = captureLog(`⏳ ดูดรูป 0/${imgs.length}...`);
      let ok = 0, fail = 0;
      for (const im of imgs) {
        try {
          if (im.file) {
            // รูปจากเครื่อง → multipart POST /assets (field เดียวกับหน้าเว็บ)
            const fd = new FormData();
            fd.append("file", im.file, im.file.name || "external.png");
            fd.append("entityType", "product");
            fd.append("entityId", capProductId);
            fd.append("linkRole", "review_image");
            const res = await fetch(`${S.apiBase}/assets`, {
              method: "POST",
              headers: { Authorization: `Bearer ${S.token}` },
              body: fd,
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          } else {
            await api("/assets/import-url", {
              method: "POST",
              body: JSON.stringify({ url: im.url, entityType: "product", entityId: capProductId, linkRole: "review_image" }),
            });
          }
          ok++;
        } catch { fail++; }
        line.textContent = `⏳ ดูดรูป ${ok + fail}/${imgs.length}...`;
      }
      line.textContent = `${fail ? "⚠️" : "✅"} รูปเข้าแกลเลอรี ${ok}/${imgs.length}${fail ? ` (พลาด ${fail})` : ""}`;
      line.className = fail ? "fail" : "ok";
    }

    const revs = capReviews.filter((r) => r.sel && r.text.trim().length >= 5);
    // 🧹 ทับของเก่า: ลบรีวิวชุดที่ extension เคยดูดไว้ (sourceRef shopee_*) — รีวิวที่ทีมเพิ่มเองไม่โดนแตะ
    if (revs.length) {
      try {
        const line = captureLog("🧹 ล้างรีวิวชุดเก่า (ทับของเก่า)...");
        const d = await api(`/customer-feedback?productId=${capProductId}&pageSize=100`);
        const olds = (d.items ?? []).filter((r) => r.sourceRef === "shopee_panel" || r.sourceRef === "shopee_paste");
        for (const r of olds) {
          await api(`/customer-feedback/${r.id}`, { method: "DELETE" });
        }
        line.textContent = olds.length
          ? `🧹 ทับของเก่า: เอารีวิวชุดเก่าออก ${olds.length} รายการ`
          : "🧹 ไม่มีรีวิวชุดเก่า — ใส่ชุดใหม่เลย";
        line.className = "ok";
      } catch { /* ล้างไม่สำเร็จ — ใส่ชุดใหม่ต่อได้ */ }
    }
    if (revs.length) {
      const line = captureLog(`⏳ เก็บรีวิว 0/${revs.length}...`);
      let ok = 0, fail = 0;
      for (const rv of revs) {
        try {
          await api("/customer-feedback", {
            method: "POST",
            body: JSON.stringify({
              text: rv.text.trim().slice(0, 2000),
              source: "comment",
              sourceRef: "shopee_panel",
              productId: capProductId,
              ...(rv.stars ? { rating: rv.stars } : {}),
            }),
          });
          ok++;
        } catch { fail++; }
        line.textContent = `⏳ เก็บรีวิว ${ok + fail}/${revs.length}...`;
      }
      line.textContent = `${fail ? "⚠️" : "✅"} รีวิวเข้าคลัง ${ok}/${revs.length}${fail ? ` (พลาด ${fail})` : ""}`;
      line.className = fail ? "fail" : "ok";
    }

    captureLog("🎉 บันทึกครบตามที่คัดแล้ว — พร้อมไปสร้าง Clip Job ต่อ", "ok");
    showCaptureDone();
  } catch (e) {
    captureLog(`❌ ${e.message}`, "fail");
  } finally {
    btn.disabled = false;
  }
}

$("btnScrape").addEventListener("click", () => scrapePage().catch((e) => toast(e.message, true)));
$("inCaptureSearch").addEventListener("input", () => {
  clearTimeout(window.__cq);
  window.__cq = setTimeout(() => searchCaptureProducts().catch(() => {}), 350);
});
$("btnCaptureCreate").addEventListener("click", () => setCaptureTarget({ create: true }));
$("btnTargetChange").addEventListener("click", () => $("capTargetPicker").classList.toggle("hidden"));
$("btnCapturePrepare").addEventListener("click", () => prepareBrief());
$("btnCaptureSave").addEventListener("click", () => saveAll());
$("btnCapImgUrl").addEventListener("click", () => {
  addExternalUrlImage($("inCapImgUrl").value);
  $("inCapImgUrl").value = "";
});
$("inCapImgUrl").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { addExternalUrlImage($("inCapImgUrl").value); $("inCapImgUrl").value = ""; }
});
$("btnCapImgFile").addEventListener("click", () => $("inCapImgFile").click());
$("inCapImgFile").addEventListener("change", (e) => { addFileImages([...e.target.files]); e.target.value = ""; });
// Ctrl+V รูปตรงแผง — เฉพาะตอนหน้าคัดเปิดอยู่
window.addEventListener("paste", (e) => {
  if ($("captureResult").classList.contains("hidden")) return;
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (files.length) { addFileImages(files); toast(`วางรูปเพิ่ม ${files.length} รูปแล้ว`); }
});
$("btnCapAddReview").addEventListener("click", () => {
  capReviews.push({ stars: null, text: "", sel: true });
  renderCapReviews();
});

// ── boot ───────────────────────────────────────────────────────────────────
async function boot() {
  await loadState();
  if (S.apiBase) $("inApiBase").value = S.apiBase;
  if (!S.token) return show("viewLogin");
  await openJobs();
}

$("btnHome").addEventListener("click", () => goHome().catch((e) => toast(e.message, true)));
$("brandHome").addEventListener("click", () => { if (S.token) goHome().catch((e) => toast(e.message, true)); });
$("btnDoneHome").addEventListener("click", () => goHome().catch((e) => toast(e.message, true)));
$("btnDoneNext").addEventListener("click", () => {
  resetCapture();
  scrapePage().catch((e) => toast(e.message, true)); // อ่านแท็บ Shopee ที่เปิดอยู่ทันที
});
$("btnLogin").addEventListener("click", doLogin);
$("inPassword").addEventListener("keydown", (e) => e.key === "Enter" && doLogin());
$("btnRefresh").addEventListener("click", () => (currentJob ? openShots(currentJob.id) : openJobs()));
$("btnLogout").addEventListener("click", async () => {
  S.token = ""; S.refresh = "";
  await saveState();
  currentJob = null;
  show("viewLogin");
});
$("btnBackJobs").addEventListener("click", () => { currentJob = null; openJobs(); });
$("inJobSearch").addEventListener("input", () => { clearTimeout(window.__jq); window.__jq = setTimeout(openJobs, 350); });
$("inJobStatus").addEventListener("change", openJobs);
$("btnDriveSave").addEventListener("click", () => saveDrive().catch((e) => toast(e.message, true)));
$("inDrive").addEventListener("input", updateDriveOpen);

boot();
