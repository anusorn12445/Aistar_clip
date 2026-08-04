// AISTAR → Flow — content script (รันในหน้า labs.google/fx/.../flow)
// หน้าที่: รับคำสั่งจาก Side Panel → วาง prompt ลงช่องข้อความ + แนบรูปลงหน้า Flow
// หมายเหตุ: Google เปลี่ยน UI ของ Flow ได้เสมอ — ทุกกลยุทธ์ด้านล่างเป็น best-effort
// แล้วรายงานผลกลับให้ panel แสดงทางสำรอง (ก๊อป/วางเอง) เมื่อไม่สำเร็จ

(() => {
  if (window.__aistarFlowLoaded) return;
  window.__aistarFlowLoaded = true;

  // ── helpers ──────────────────────────────────────────────────────────────

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0";
  }

  // หา "ช่อง prompt" ของ Flow: textarea ที่มองเห็น > contenteditable ที่มองเห็น
  function findPromptBox() {
    const areas = [...document.querySelectorAll("textarea")].filter(isVisible);
    if (areas.length) {
      // ถ้ามีหลายช่อง เอาช่องที่ใหญ่สุด (ช่อง prompt หลักมักใหญ่กว่า input ค้นหา)
      areas.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
      return { el: areas[0], kind: "textarea" };
    }
    const editables = [
      ...document.querySelectorAll('[contenteditable="true"], [contenteditable=""], [role="textbox"]'),
    ].filter(isVisible);
    if (editables.length) {
      editables.sort((a, b) => b.offsetWidth * b.offsetHeight - a.offsetWidth * a.offsetHeight);
      return { el: editables[0], kind: "contenteditable" };
    }
    return null;
  }

  // เซ็ตค่าลง textarea แบบที่ React มองเห็น (native setter + input event)
  function setTextareaValue(el, text) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    if (setter) setter.call(el, text);
    else el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function insertPrompt(text) {
    const box = findPromptBox();
    if (!box) return { ok: false, error: "ไม่พบช่อง prompt ในหน้านี้" };
    box.el.focus();
    if (box.kind === "textarea") {
      setTextareaValue(box.el, text);
    } else {
      // contenteditable: เลือกทั้งหมดแล้วแทนที่
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(box.el);
      sel.removeAllRanges();
      sel.addRange(range);
      const inserted = document.execCommand("insertText", false, text);
      if (!inserted) {
        box.el.textContent = text;
        box.el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      }
    }
    return { ok: true, method: box.kind };
  }

  // dataURL → File
  function dataUrlToFile(dataUrl, name, type) {
    const [meta, b64] = dataUrl.split(",");
    const mime = type || (meta.match(/data:(.*?);/) || [])[1] || "image/png";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || "still.png", { type: mime });
  }

  function makeDataTransfer(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt;
  }

  // กลยุทธ์แนบรูป 3 ชั้น: input[type=file] → paste event → drop event
  // v1.5: รองรับหลายไฟล์ใน DataTransfer เดียว (CEO: แนบภาพนิ่งฉาก + รูปสินค้าอ้างอิงทีเดียว)
  function attachImage(dataUrl, name, type) {
    const file = dataUrlToFile(dataUrl, name, type);
    const dt = makeDataTransfer(file);
    return attachTransfer(dt);
  }

  function attachImages(files) {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(dataUrlToFile(f.dataUrl, f.name, f.mimeType));
    return attachTransfer(dt);
  }

  function attachTransfer(dt) {

    // 1) input[type=file] (รวมตัวที่ซ่อนอยู่ — ปุ่มอัปโหลดมักซ่อน input ไว้)
    const inputs = [...document.querySelectorAll('input[type="file"]')].filter((i) => {
      const acc = (i.accept || "").toLowerCase();
      return !acc || acc.includes("image") || acc.includes("*");
    });
    for (const input of inputs) {
      try {
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        return { ok: true, method: "file-input" };
      } catch {
        /* ลองตัวถัดไป */
      }
    }

    // 2) จำลอง paste ลงช่อง prompt (Flow รองรับวางรูปจากคลิปบอร์ด)
    const box = findPromptBox();
    if (box) {
      try {
        box.el.focus();
        const pasteEvt = new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt });
        box.el.dispatchEvent(pasteEvt);
        return { ok: true, method: "paste-event", note: "จำลอง Ctrl+V — ถ้ารูปไม่ขึ้น ใช้ปุ่มก๊อปรูปแล้ววางเอง" };
      } catch {
        /* ต่อชั้น 3 */
      }
    }

    // 3) จำลองลากไฟล์วางกลางหน้า
    const target = box?.el?.closest("form") ?? document.querySelector("main") ?? document.body;
    try {
      for (const evName of ["dragenter", "dragover", "drop"]) {
        target.dispatchEvent(
          new DragEvent(evName, { bubbles: true, cancelable: true, dataTransfer: dt })
        );
      }
      return { ok: true, method: "drop-event", note: "จำลองลากวาง — ถ้ารูปไม่ขึ้น ใช้ปุ่มก๊อปรูปแล้ววางเอง" };
    } catch (e) {
      return { ok: false, error: "แนบรูปอัตโนมัติไม่สำเร็จ — ใช้ปุ่ม 📋 ก๊อปรูป แล้วกด Ctrl+V ในหน้า Flow แทน" };
    }
  }

  // ── message router ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    try {
      if (msg?.type === "PING") {
        sendResponse({ ok: true });
      } else if (msg?.type === "INSERT_PROMPT") {
        sendResponse(insertPrompt(msg.text ?? ""));
      } else if (msg?.type === "ATTACH_IMAGE") {
        sendResponse(attachImage(msg.dataUrl, msg.name, msg.mimeType));
      } else if (msg?.type === "ATTACH_IMAGES") {
        sendResponse(attachImages(msg.files ?? []));
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return false; // ตอบ sync
  });
})();
