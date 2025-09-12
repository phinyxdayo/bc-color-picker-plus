// ==UserScript==
// @name         BC Color picker plus
// @name:zh      BC 颜色选择器 Plus
// @version      1.0.6
// @namespace    k-colorpicker
// @description  悬浮按钮和弹窗都可以拖动
// @author       Koephi
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const TARGET = "#InputColor";
  const REALTIME_WRITE = true;
  const FAB_POS_KEY = "cp-fab-pos";
  const MODAL_POS_KEY = "cp-modal-pos";
  if (document.getElementById("cp-fab")) return;

  // ---------- CSS ----------
  (function addStyle(css) {
    const s = document.createElement("style");
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  })(`
    #cp-fab{
      position:fixed; z-index:2147483647; width:56px; height:56px; border-radius:50%;
      display:flex; align-items:center; justify-content:center; background:#111; color:#fff;
      font-size:24px; cursor:grab; box-shadow:0 8px 24px rgba(0,0,0,.25); user-select:none;
      touch-action:none;
    }
    #cp-fab.dragging{ cursor:grabbing; }

    #cp-overlay{position:fixed;inset:0;background:rgba(0,0,0,.00);z-index:2147483646;display:none}
    #cp-modal{
      position:fixed; right:20px; bottom:88px; z-index:2147483647; background:#1e1e1e; color:#eaeaea;
      border-radius:12px; box-shadow:0 16px 40px rgba(0,0,0,.35); padding:10px; display:none;
      box-sizing:border-box;
      width: calc(var(--cp-w) + 20px);
      line-height:1.3;
      height: auto;
    }
    #cp-header{
      display:flex;align-items:center;gap:8px;margin-bottom:8px;
      cursor:move; user-select:none; touch-action:none;
    }
    #cp-title{font-size:13px;opacity:.9}
    #cp-actions{margin-left:auto;display:flex;gap:6px}
    .cp-btn{border:0;padding:6px 8px;font-size:12px;border-radius:6px;background:#2b2b2b;color:#eaeaea;cursor:pointer}
    .cp-btn:hover{filter:brightness(1.08)}
    #cp-tabs{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
    .cp-tab{padding:4px 8px;border-radius:6px;background:#2b2b2b;font-size:12px;cursor:pointer;user-select:none}
    .cp-tab.active{background:#3a3a3a}

    :root{
      --cp-w: 380px;
      --cp-track-h: 20px;
      --cp-track-r: 0px;
      --cp-thumb-r: 2px;
      --cp-thumb: 22px;
      --cp-gap-y: 8px;
    }

    .cp-pane{ display:none !important; }
    .cp-pane.active{ display:block !important; }
    .cp-pane.cp-sliders.active{ display:flex !important; }

    .cp-sliders{
      width:var(--cp-w);
      display:flex; flex-direction:column;
      gap:var(--cp-gap-y);
      padding:4px 0;
    }
    .cp-sliders .cp-row + .cp-row{
      margin-top: var(--cp-gap-y);
    }
    .cp-row{ display:flex; align-items:center; gap:12px }
    .cp-label{ width:28px; text-align:right; opacity:.9; font-size:12px }
    .cp-range{
      -webkit-appearance:none; appearance:none;
      width:calc(var(--cp-w) - 28px - 64px - 16px);
      height:var(--cp-track-h); background:transparent; cursor:pointer;
    }
    .cp-range:focus{ outline:none }
    .cp-range::-webkit-slider-runnable-track{
      height:var(--cp-track-h); border-radius:var(--cp-track-r); background: var(--grad, #888);
    }
    .cp-range::-moz-range-track{
      height:var(--cp-track-h); border-radius:var(--cp-track-r); background: var(--grad, #888);
    }
    .cp-range::-webkit-slider-thumb{
      -webkit-appearance:none; width:var(--cp-thumb); height:var(--cp-thumb);
      border-radius:var(--cp-thumb-r); background:var(--thumb, #fff); box-shadow:0 0 0 2px #0003;
      margin-top: calc((var(--cp-track-h) - var(--cp-thumb))/2);
    }
    .cp-range::-moz-range-thumb{
      width:var(--cp-thumb); height:var(--cp-thumb);
      border-radius:var(--cp-thumb-r); background:var(--thumb, #fff); border:1px solid #0003;
    }
    .cp-val{ width:64px; text-align:right; font:12px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; opacity:.9 }

    #cp-foot{margin-top:12px;display:flex;gap:10px;align-items:center}
    #cp-preview{width:18px;height:18px;border-radius:4px;border:1px solid #333}
    #cp-hex-out{flex:1;background:#111;color:#eaeaea;border:1px solid #333;border-radius:6px;padding:6px 8px;
      font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
  `);

  // ---------- DOM ----------
  const fab = document.createElement("div");
  fab.id = "cp-fab";
  fab.title = "颜色选择器";
  fab.textContent = "🎨";
  document.body.appendChild(fab);

  const overlay = document.createElement("div");
  overlay.id = "cp-overlay";
  document.body.appendChild(overlay);

  const modal = document.createElement("div");
  modal.id = "cp-modal";
  modal.innerHTML = `
    <div id="cp-header">
      <div id="cp-title">颜色选择器 Plus by Koephi</div>
    </div>
    <div id="cp-tabs">
      <div class="cp-tab active" data-mode="hsv-sl">HSV</div>
      <div class="cp-tab" data-mode="hsl-sl">HSL</div>
    </div>
    <div id="cp-pickers"></div>
    <div id="cp-foot">
      <div id="cp-preview" title="当前颜色"></div>
      <input id="cp-hex-out" spellcheck="false" placeholder="#RRGGBB" />
    </div>`;
  document.body.appendChild(modal);

  // ---------- Tools ----------
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const cleanHex = (s) => {
    if (!s) return "";
    s = String(s).trim();
    if (s.startsWith("0x")) s = s.slice(2);
    if (s[0] === "#") s = s.slice(1);
    s = s.toUpperCase();
    if (s.length === 3)
      s = s
        .split("")
        .map((c) => c + c)
        .join("");
    return /^[0-9A-F]{6}([0-9A-F]{2})?$/.test(s) ? "#" + s.slice(0, 6) : "";
  };
  const setTarget = (hex) => {
    const el = document.querySelector(TARGET);
    if (!el) return false;
    if ("value" in el) el.value = hex;
    else el.textContent = hex;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  const getTargetHex = () => {
    const el = document.querySelector(TARGET);
    return cleanHex(el && ("value" in el ? el.value : el?.textContent));
  };
  const rgbToHex = (r, g, b) =>
    "#" +
    [r, g, b]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  const hslToRgb = (h, s, l) => {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = l - c / 2;
    let [r1, g1, b1] = [0, 0, 0];
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  };
  const hsvToRgb = (h, s, v) => {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    v = clamp(v, 0, 1);
    const c = v * s,
      x = c * (1 - Math.abs(((h / 60) % 2) - 1)),
      m = v - c;
    let [r1, g1, b1] = [0, 0, 0];
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];
    return {
      r: Math.round((r1 + m) * 255),
      g: Math.round((g1 + m) * 255),
      b: Math.round((b1 + m) * 255),
    };
  };
  const rgbToHsl = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    let h = 0,
      s = 0,
      l = (max + min) / 2;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r:
          h = 60 * (((g - b) / d) % 6);
          break;
        case g:
          h = 60 * ((b - r) / d + 2);
          break;
        case b:
          h = 60 * ((r - g) / d + 4);
          break;
      }
    }
    if (h < 0) h += 360;
    return { h, s, l };
  };
  const rgbToHsv = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    let h = 0,
      s = max === 0 ? 0 : d / max,
      v = max;
    if (d !== 0) {
      switch (max) {
        case r:
          h = 60 * (((g - b) / d) % 6);
          break;
        case g:
          h = 60 * ((b - r) / d + 2);
          break;
        case b:
          h = 60 * ((r - g) / d + 4);
          break;
      }
    }
    if (h < 0) h += 360;
    return { h, s, v };
  };
  const rgbStr = (r, g, b) => `rgb(${r}, ${g}, ${b})`;
  const hslStr = (h, s, l) =>
    `hsl(${Math.round(h)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;

  const EPS = 1e-6;
  const fmt1 = (x) => (Math.round(x * 10) / 10).toFixed(1);

  function hsvToHslPure(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1); v = clamp(v, 0, 1);
    const l = v * (1 - s / 2);
    const s_hsl = (l < EPS || l > 1 - EPS) ? 0 : (v - l) / Math.min(l, 1 - l);
    return { h, s: clamp(s_hsl, 0, 1), l: clamp(l, 0, 1) };
  }

  function hslToHsvPure(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const v = l + s * Math.min(l, 1 - l);
    const s_hsv = v < EPS ? 0 : 2 * (1 - l / v);
    return { h, s: clamp(s_hsv, 0, 1), v: clamp(v, 0, 1) };
  }


  // ---------- Eeeee ----------
  const $ = (sel) => modal.querySelector(sel);
  let hslEls, hsvEls;

  function makeRow(label, min, max, step, id) {
    const row = document.createElement("div");
    row.className = "cp-row";
    const lab = document.createElement("div");
    lab.className = "cp-label";
    lab.textContent = label;
    const range = document.createElement("input");
    range.type = "range";
    range.className = "cp-range";
    range.min = min;
    range.max = max;
    range.step = step;
    range.id = id;
    const val = document.createElement("div");
    val.className = "cp-val";
    val.textContent = "0";
    row.append(lab, range, val);
    return { row, range, val };
  }

  function createHslSliders() {
    const wrap = document.createElement("div");
    wrap.className = "cp-pane cp-sliders";
    wrap.id = "cp-hsl-sl";
    const H = makeRow("H", 0, 360, 0.1, "cp-hsl-H");
    const S = makeRow("S", 0, 100, 0.1, "cp-hsl-S");
    const L = makeRow("L", 0, 100, 0.1, "cp-hsl-L");
    wrap.append(H.row, S.row, L.row);
    hslEls = { H, S, L };

    const onChange = () => {
      const h = +H.range.value;
      const s = +S.range.value / 100;
      const l = +L.range.value / 100;
      applyFromHSL(h, s, l);
    };
    [H.range, S.range, L.range].forEach((r) =>
      r.addEventListener("input", onChange)
    );
    return wrap;
  }

  function createHsvSliders() {
    const wrap = document.createElement("div");
    wrap.className = "cp-pane cp-sliders";
    wrap.id = "cp-hsv-sl";
    const H = makeRow("H", 0, 360, 0.1, "cp-hsv-H");
    const S = makeRow("S", 0, 100, 0.1, "cp-hsv-S");
    const V = makeRow("V", 0, 100, 0.1, "cp-hsv-V");
    wrap.append(H.row, S.row, V.row);
    hsvEls = { H, S, V };

    const onChange = () => {
      const h = +H.range.value;
      const s = +S.range.value / 100;
      const v = +V.range.value / 100;
      applyFromHSV(h, s, v);
    };
    [H.range, S.range, V.range].forEach((r) =>
      r.addEventListener("input", onChange)
    );
    return wrap;
  }

  function updateHslSlidersUI(h, s, l) {
    if (!hslEls) return;
    const { H, S, L } = hslEls;

    H.range.value = fmt1(h);
    H.val.textContent = fmt1(h);

    S.range.value = fmt1(s * 100);
    S.val.textContent = fmt1(s * 100);

    L.range.value = fmt1(l * 100);
    L.val.textContent = fmt1(l * 100);

    H.range.style.setProperty(
      "--grad",
      "linear-gradient(to right, #F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)"
    );

    const c0 = hslStr(h, 0, l), c1 = hslStr(h, 1, l);
    S.range.style.setProperty("--grad", `linear-gradient(to right, ${c0}, ${c1})`);

    const l0 = hslStr(h, s, 0), l50 = hslStr(h, s, 0.5), l100 = hslStr(h, s, 1);
    L.range.style.setProperty("--grad", `linear-gradient(to right, ${l0}, ${l50}, ${l100})`);

    H.range.style.setProperty("--thumb", hslStr(h, 1, 0.5));
    S.range.style.setProperty("--thumb", hslStr(h, s, 0.5));
    L.range.style.setProperty("--thumb", hslStr(0, 0, l));
  }

  function updateHsvSlidersUI(h, s, v) {
    if (!hsvEls) return;
    const { H, S, V } = hsvEls;

    H.range.value = fmt1(h);
    H.val.textContent = fmt1(h);

    S.range.value = fmt1(s * 100);
    S.val.textContent = fmt1(s * 100);

    V.range.value = fmt1(v * 100);
    V.val.textContent = fmt1(v * 100);

    H.range.style.setProperty(
      "--grad",
      "linear-gradient(to right, #F00, #FF0, #0F0, #0FF, #00F, #F0F, #F00)"
    );

    const s0 = hsvToRgb(h, 0, v), s1 = hsvToRgb(h, 1, v);
    S.range.style.setProperty("--grad",
      `linear-gradient(to right, ${rgbStr(s0.r, s0.g, s0.b)}, ${rgbStr(s1.r, s1.g, s1.b)})`);

    const v0 = hsvToRgb(h, s, 0), v1 = hsvToRgb(h, s, 1);
    V.range.style.setProperty("--grad",
      `linear-gradient(to right, ${rgbStr(v0.r, v0.g, v0.b)}, ${rgbStr(v1.r, v1.g, v1.b)})`);

    {
      let c = hsvToRgb(h, 1, 1);
      H.range.style.setProperty("--thumb", rgbStr(c.r, c.g, c.b));
    }
    {
      let c = hsvToRgb(h, s, 1);
      S.range.style.setProperty("--thumb", rgbStr(c.r, c.g, c.b));
    }
    {
      let c = hsvToRgb(0, 0, v);
      V.range.style.setProperty("--thumb", rgbStr(c.r, c.g, c.b));
    }
  }

  function applyFromHSV(h, s, v, { write = REALTIME_WRITE } = {}) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); v = clamp(v, 0, 1);

    // 用纯数学把 HSV 映射到 HSL（避免 RGB/HEX 量化）
    const hsl = hsvToHslPure(h, s, v);

    // 同步两组 UI（浮点）
    updateHsvSlidersUI(h, s, v);
    updateHslSlidersUI(hsl.h, hsl.s, hsl.l);

    // 仅用于预览/输出时，才计算 8bit RGB/HEX
    const { r, g, b } = hsvToRgb(h, s, v);
    const hex = rgbToHex(r, g, b);
    document.getElementById("cp-hex-out").value = hex;
    document.getElementById("cp-preview").style.background = hex;
    if (write) setTarget(hex);
  }

  function applyFromHSL(h, s, l, { write = REALTIME_WRITE } = {}) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);

    // 用纯数学把 HSL 映射到 HSV（避免 RGB/HEX 量化）
    const hsv = hslToHsvPure(h, s, l);

    // 同步两组 UI（浮点）
    updateHslSlidersUI(h, s, l);
    updateHsvSlidersUI(hsv.h, hsv.s, hsv.v);

    // 仅用于预览/输出时，才计算 8bit RGB/HEX
    const { r, g, b } = hslToRgb(h, s, l);
    const hex = rgbToHex(r, g, b);
    document.getElementById("cp-hex-out").value = hex;
    document.getElementById("cp-preview").style.background = hex;
    if (write) setTarget(hex);
  }

  function setAllFromHex(hex) {
    hex = cleanHex(hex);
    if (!hex) return;
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255,
      g = (n >> 8) & 255,
      b = n & 255;
    const hsl = rgbToHsl(r, g, b);
    const hsv = rgbToHsv(r, g, b);

    updateHslSlidersUI(hsl.h, hsl.s, hsl.l);
    updateHsvSlidersUI(hsv.h, hsv.s, hsv.v);

    document.getElementById("cp-hex-out").value = hex;
    document.getElementById("cp-preview").style.background = hex;
    if (REALTIME_WRITE) setTarget(hex);
  }

  const panes = {
    "hsv-sl": () => $("#cp-hsv-sl"),
    "hsl-sl": () => $("#cp-hsl-sl"),
  };
  const switchMode = (mode) => {
    modal
      .querySelectorAll(".cp-tab")
      .forEach((t) => t.classList.toggle("active", t.dataset.mode === mode));
    modal
      .querySelectorAll(".cp-pane")
      .forEach((p) => p.classList.remove("active"));
    const pane = panes[mode]?.();
    if (pane) pane.classList.add("active");
  };
  modal.addEventListener("click", (e) => {
    const t = e.target.closest(".cp-tab");
    if (t) switchMode(t.dataset.mode);
  });

  const buildPanesIfNeeded = () => {
    if (modal.__built) return;
    const box = $("#cp-pickers");
    const hsvSl = createHsvSliders(); // id: cp-hsv-sl
    const hslSl = createHslSliders(); // id: cp-hsl-sl
    hsvSl.classList.add("active");
    box.append(hsvSl, hslSl);
    modal.__built = true;
  };

  // ---------- Button drag ----------
  function restoreFabPos() {
    const saved = localStorage.getItem(FAB_POS_KEY);
    let left, top;
    if (saved) {
      try {
        const p = JSON.parse(saved);
        left = p.left;
        top = p.top;
      } catch {}
    }
    const w = 56,
      h = 56,
      pad = 20;
    if (typeof left !== "number" || typeof top !== "number") {
      left = window.innerWidth - w - pad;
      top = window.innerHeight - h - pad;
    }
    fab.style.left =
      Math.max(8, Math.min(left, window.innerWidth - w - 8)) + "px";
    fab.style.top =
      Math.max(8, Math.min(top, window.innerHeight - h - 8)) + "px";
  }
  function saveFabPos() {
    const r = fab.getBoundingClientRect();
    localStorage.setItem(
      FAB_POS_KEY,
      JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) })
    );
  }
  function enableFabDrag() {
    let dragging = false,
      offsetX = 0,
      offsetY = 0;
    const onDown = (e) => {
      dragging = true;
      fab.classList.add("dragging");
      const r = fab.getBoundingClientRect();
      offsetX = e.clientX - r.left;
      offsetY = e.clientY - r.top;
      fab.setPointerCapture(e.pointerId);
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const w = 56,
        h = 56;
      let x = e.clientX - offsetX,
        y = e.clientY - offsetY;
      x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
      y = Math.max(8, Math.min(y, window.innerHeight - h - 8));
      fab.style.left = x + "px";
      fab.style.top = y + "px";
    };
    const onUp = (e) => {
      if (!dragging) return;
      dragging = false;
      fab.classList.remove("dragging");
      fab.releasePointerCapture(e.pointerId);
      saveFabPos();
    };
    fab.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("resize", restoreFabPos);
  }

  // ---------- Window drag ----------
  function clampModalToViewport(left, top) {
    const r = modal.getBoundingClientRect();
    const maxLeft = window.innerWidth - r.width - 8;
    const maxTop = window.innerHeight - r.height - 8;
    return {
      left: Math.max(8, Math.min(left, maxLeft)),
      top: Math.max(8, Math.min(top, maxTop)),
    };
  }
  function restoreModalPos() {
    modal.style.right = "auto";
    modal.style.bottom = "auto";
    const saved = localStorage.getItem(MODAL_POS_KEY);
    let left, top;
    if (saved) {
      try {
        const p = JSON.parse(saved);
        left = p.left;
        top = p.top;
      } catch {}
    }
    if (typeof left !== "number" || typeof top !== "number") {
      const r = modal.getBoundingClientRect();
      left = window.innerWidth - r.width - 20;
      top = window.innerHeight - r.height - 88;
    }
    const pos = clampModalToViewport(left, top);
    modal.style.left = pos.left + "px";
    modal.style.top = pos.top + "px";
  }
  function saveModalPos() {
    const r = modal.getBoundingClientRect();
    localStorage.setItem(
      MODAL_POS_KEY,
      JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) })
    );
  }
  function enableModalDrag() {
    const header = modal.querySelector("#cp-header");
    let dragging = false,
      offsetX = 0,
      offsetY = 0;
    header.addEventListener("pointerdown", (e) => {
      const r = modal.getBoundingClientRect();
      modal.style.right = "auto";
      modal.style.bottom = "auto";
      modal.style.left = Math.round(r.left) + "px";
      modal.style.top = Math.round(r.top) + "px";

      dragging = true;
      offsetX = e.clientX - r.left;
      offsetY = e.clientY - r.top;
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    window.addEventListener(
      "pointermove",
      (e) => {
        if (!dragging) return;
        const { left, top } = clampModalToViewport(
          e.clientX - offsetX,
          e.clientY - offsetY
        );
        modal.style.left = left + "px";
        modal.style.top = top + "px";
      },
      { passive: false }
    );
    window.addEventListener("pointerup", (e) => {
      if (!dragging) return;
      dragging = false;
      header.releasePointerCapture(e.pointerId);
      saveModalPos();
    });
    window.addEventListener("resize", () => {
      if (modal.style.display !== "none") restoreModalPos();
    });
  }

  // ---------- Show hide ----------
  const hexOut = () => modal.querySelector("#cp-hex-out");

  const openModal = async () => {
    overlay.style.display = "block";
    modal.style.display = "block";
    buildPanesIfNeeded();
    const startHex = getTargetHex() || "#FF6A00";
    setAllFromHex(startHex);
    restoreModalPos();
  };

  const closeModal = () => {
    overlay.style.display = "none";
    modal.style.display = "none";
  };

  document.addEventListener("click", (e) => {
    if (e.target.id === "cp-apply") {
      const hex = cleanHex(hexOut().value);
      if (!hex) return;
      setTarget(hex);
      closeModal();
    } else if (e.target.id === "cp-close") {
      closeModal();
    }
  });
  overlay.addEventListener("click", closeModal);
  fab.addEventListener("click", openModal);

  modal.addEventListener("input", (e) => {
    if (e.target.id === "cp-hex-out") {
      const hex = cleanHex(e.target.value);
      if (hex) setAllFromHex(hex);
    }
  });

  // ---------- 颜色选择器，启动！ ----------
  restoreFabPos();
  enableFabDrag();
  enableModalDrag();

  const initHex = getTargetHex();
  if (initHex) setTarget(initHex);
})();


