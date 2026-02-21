// ==UserScript==
// @name         BC Color Correction
// @name:zh      BC 颜色校正器
// @namespace    k-colorcorrector
// @version      1.0.7
// @run-at       document-end
// @description  Flllllloating UI~
// @author       Koephi
// @include      /^https:\/\/(www\.)?bondage(projects\.elementfx|-(europe|asia))\.com\/.*/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Configuration
    const TARGET = 'input[name="output"][placeholder="#RRGGBB"]';
    const CANVAS_SELECTOR = 'canvas';
    const UPDATE_DELAY = 100;
    const POLL_INTERVAL = 100;
    const FAB_POS_KEY = "cc-fab-pos";
    const MODAL_POS_KEY = "cc-modal-pos";

    // Utilities
    function cleanHex(hex) {
        if (!hex) return '';
        return hex.replace(/[^#0-9A-Fa-f]/gi, '').toUpperCase().padStart(7, '#');
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    function rgbToHex(r, g, b) {
        const toHex = (c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0').toUpperCase();
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    // HSV utilities
    function cssToHsv(color) {
        color = color || "#FFFFFF";
        var M = color.match(/^#(([0-9a-f]{3})|([0-9a-f]{6})|([0-9a-f]{8}))$/i);
        var R, G, B;
        if (M) {
            var GRP = M[1];
            if (GRP.length == 3) {
                R = parseInt(GRP[0] + GRP[0], 16) / 255;
                G = parseInt(GRP[1] + GRP[1], 16) / 255;
                B = parseInt(GRP[2] + GRP[2], 16) / 255;
            } else if (GRP.length == 6) {
                R = parseInt(GRP[0] + GRP[1], 16) / 255;
                G = parseInt(GRP[2] + GRP[3], 16) / 255;
                B = parseInt(GRP[4] + GRP[5], 16) / 255;
            }
        }
        if (isNaN(R) || isNaN(G) || isNaN(B)) {
            return { H: 0, S: 0, V: 1 };
        }
        var Max = Math.max(R, G, B);
        var Min = Math.min(R, G, B);
        var D = Max - Min;
        var H = 0;
        var S = (Max == 0) ? 0 : D / Max;
        var V = Max;
        if (D == 0) {
            H = 0;
        } else {
            if (Max == R) {
                H = (G - B) / D + (G < B ? 6 : 0);
            } else if (Max == G) {
                H = (B - R) / D + 2;
            } else {
                H = (R - G) / D + 4;
            }
            H /= 6;
        }
        return { H: H, S: S, V: V };
    }

    function getTargetHex() {
        const el = document.querySelector(TARGET);
        return cleanHex(el && ('value' in el ? el.value : el?.textContent));
    }

    function setTarget(hex) {
        const el = document.querySelector(TARGET);
        if (!el) return false;
        if ("value" in el) el.value = hex;
        else el.textContent = hex;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
    }

    let allCanvases = [];
    function detectCanvases() {
        allCanvases = Array.from(document.querySelectorAll(CANVAS_SELECTOR)).map(canvas => ({
            element: canvas,
            zIndex: parseInt(getComputedStyle(canvas).zIndex) || 0,
            rect: canvas.getBoundingClientRect()
        })).sort((a, b) => b.zIndex - a.zIndex);
        console.log('Detected canvases:', allCanvases.length);
    }

    function screenToCanvasCoords(screenX, screenY, canvas) {
        const rect = canvas.getBoundingClientRect();
        const x = (screenX - rect.left) * (canvas.width / rect.width);
        const y = (screenY - rect.top) * (canvas.height / rect.height);
        return { x: Math.floor(x), y: Math.floor(y) };
    }

    function getTopmostCanvasColor(screenX, screenY) {
        for (const { element: canvas } of allCanvases) {
            const rect = canvas.getBoundingClientRect();
            if (screenX >= rect.left && screenX <= rect.right && screenY >= rect.top && screenY <= rect.bottom) {
                const { x, y } = screenToCanvasCoords(screenX, screenY, canvas);
                if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        const imageData = ctx.getImageData(x, y, 1, 1);
                        const data = imageData.data;
                        return rgbToHex(data[0], data[1], data[2]);
                    }
                }
            }
        }
        return null;
    }

    // Pin management
    let pin = null;
    let isPinDragging = false;
    let pinScreenX = window.innerWidth / 2, pinScreenY = window.innerHeight / 2;
    let observer = null;
    let targetObserver = null;
    let targetEl = null;
    let pollInterval = null;
    let lastTargetHex = '';

    function createPin() {
        if (pin) return pin;

        detectCanvases();
        pin = document.createElement('div');
        pin.id = 'color-pin';
        pin.style.cssText = `
            position: fixed;
            width: 20px; height: 20px;
            background: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iOSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjIiLz4KPHBhdGggZD0iTTEwIDVWNUIiIHN0cm9rZT0iIzAwMDAwMCIgc3Ryb2tlLXdpZHRoPSIyIi8+PHBhdGggZD0iTTEwIDE1VjE1IiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMiIvPjxwYXRoIGQ9Ik01IDEwaDEwIiBzdHJva2U9IiMwMDAwMDAiIHN0cm9rZS13aWR0aD0iMiIvPgogICAgPC9zdmc+') no-repeat center/contain;
            pointer-events: auto;
            z-index: 99999;
            cursor: move;
            transform: translate(-50%, -50%);
        `;
        document.body.appendChild(pin);
        updatePinZIndex();

        let dragOffsetX = 0, dragOffsetY = 0;
        pin.onmousedown = (e) => {
            isPinDragging = true;
            dragOffsetX = e.clientX - pinScreenX;
            dragOffsetY = e.clientY - pinScreenY;
            e.preventDefault();
        };

        document.onmousemove = (e) => {
            if (!isPinDragging) return;
            pinScreenX = e.clientX - dragOffsetX;
            pinScreenY = e.clientY - dragOffsetY;
            pin.style.left = pinScreenX + 'px';
            pin.style.top = pinScreenY + 'px';
            updateActualColor();
        };

        document.onmouseup = () => { isPinDragging = false; };

        observer = new MutationObserver(() => {
            detectCanvases();
            updatePinZIndex();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        pin.style.left = pinScreenX + 'px';
        pin.style.top = pinScreenY + 'px';

        lastTargetHex = getTargetHex();
        pollInterval = setInterval(() => {
            const currentHex = getTargetHex();
            if (currentHex && currentHex !== lastTargetHex) {
                lastTargetHex = currentHex;
                setTimeout(updateActualColor, UPDATE_DELAY);
            }
        }, POLL_INTERVAL);

        updateActualColor();
        return pin;
    }

    function removePin() {
        if (pin) pin.remove();
        pin = null;
        if (observer) observer.disconnect();
        if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
        }
    }

    function updatePinZIndex() {
        if (!pin) return;
        const maxZ = Math.max(...allCanvases.map(c => c.zIndex), 0);
        pin.style.zIndex = maxZ + 1;
    }

    let updateTimeout;
    function updateActualColor() {
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            const actualHex = getTopmostCanvasColor(pinScreenX, pinScreenY);
            if (actualHex) {
                const actualHexSpan = document.getElementById('actual-hex');
                const actualHSpan = document.getElementById('actual-h');
                const actualSSpan = document.getElementById('actual-s');
                const actualVSpan = document.getElementById('actual-v');
                actualHexSpan.textContent = actualHex;
                const actualHsv = cssToHsv(actualHex);
                actualHSpan.textContent = Math.round(actualHsv.H * 360);
                actualSSpan.textContent = Math.round(actualHsv.S * 100);
                actualVSpan.textContent = Math.round(actualHsv.V * 100);
                updateHSVMarkers();
            }
        }, 16); // ~60fps
    }

    function computeCorrection() {
        const inputHex = getTargetHex();
        if (!inputHex) {
            return 'Error: Could not get current input hex.';
        }
        const actualHex = document.getElementById('actual-hex').textContent;
        const targetHex = document.getElementById('target-hex').value || '#000000';

        const inputRgb = hexToRgb(inputHex);
        const actualRgb = hexToRgb(actualHex);
        const targetRgb = hexToRgb(targetHex);

        function computeChannel(inputC, actualC, targetC) {
            if (inputC > 0 && actualC > 0) {
                const gamma = Math.log(actualC / 255) / Math.log(inputC / 255);
                if (!isNaN(gamma) && isFinite(gamma) && gamma !== 0) {
                    return Math.round(Math.max(0, Math.min(255, 255 * Math.pow(targetC / 255, 1 / gamma))));
                }
            }
            // Fallback: no correction or proportional
            return targetC;
        }

        const correctedR = computeChannel(inputRgb.r, actualRgb.r, targetRgb.r);
        const correctedG = computeChannel(inputRgb.g, actualRgb.g, targetRgb.g);
        const correctedB = computeChannel(inputRgb.b, actualRgb.b, targetRgb.b);

        const correctedHex = rgbToHex(correctedR, correctedG, correctedB);
        if (true) {
            setTarget(correctedHex);
        }
        return `Correction: ${correctedHex}`;
    }

    function updateHSVMarkers() {
        const targetHexInput = document.getElementById('target-hex');
        const targetHex = targetHexInput.value;
        const targetHsv = cssToHsv(targetHex || '#000000');
        const actualHexSpan = document.getElementById('actual-hex');
        const actualHex = actualHexSpan.textContent;
        const actualHsv = cssToHsv(actualHex);

        // H (0-360 -> 0-100%)
        document.getElementById('target-h-marker').style.left = (targetHsv.H * 100) + '%';
        document.getElementById('actual-h-marker').style.left = (actualHsv.H * 100) + '%';
        document.getElementById('hsv-values').textContent = `Target: ${Math.round(targetHsv.H * 360)} | Actual: ${Math.round(actualHsv.H * 360)}`;

        // S (0-1 -> 0-100%)
        document.getElementById('target-s-marker').style.left = (targetHsv.S * 100) + '%';
        document.getElementById('actual-s-marker').style.left = (actualHsv.S * 100) + '%';
        document.getElementById('hsv-values-s').textContent = `Target: ${Math.round(targetHsv.S * 100)}% | Actual: ${Math.round(actualHsv.S * 100)}%`;

        // V (0-1 -> 0-100%)
        document.getElementById('target-v-marker').style.left = (targetHsv.V * 100) + '%';
        document.getElementById('actual-v-marker').style.left = (actualHsv.V * 100) + '%';
        document.getElementById('hsv-values-v').textContent = `Target: ${Math.round(targetHsv.V * 100)}% | Actual: ${Math.round(actualHsv.V * 100)}%`;
    }

    function reDetectTarget() {
        if (targetObserver) targetObserver.disconnect();
        targetEl = document.querySelector(TARGET);
        if (targetEl) {
            setupTargetListeners(targetEl);
            lastTargetHex = getTargetHex();
            alert('TARGET re-detected and listeners re-added.');
        } else {
            alert('TARGET not found.');
        }
    }

    function setupTargetListeners(el) {
        const onChange = () => {
            if (pin) setTimeout(updateActualColor, UPDATE_DELAY);
        };

        if ('value' in el) {
            el.addEventListener('input', onChange);
            el.addEventListener('change', onChange);
        } else {
            targetObserver = new MutationObserver(onChange);
            targetObserver.observe(el, { childList: true, characterData: true, subtree: true });
        }
    }

    (function addStyle(css) {
        const s = document.createElement("style");
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
    })(`
        #cc-fab{
          position:fixed; z-index:2147483647; width:56px; height:56px; border-radius:50%;
          display:flex; align-items:center; justify-content:center; background:#111; color:#fff;
          font-size:24px; cursor:grab; box-shadow:0 8px 24px rgba(0,0,0,.25); user-select:none;
          touch-action:none;
        }
        #cc-fab.dragging{ cursor:grabbing; }

        #cc-modal{
          position:fixed; right:20px; bottom:88px; z-index:2147483647; background:#1e1e1e; color:#eaeaea;
          border-radius:12px; box-shadow:0 16px 40px rgba(0,0,0,.35); padding:10px; display:none;
          box-sizing:border-box;
          width: calc(var(--cc-w) + 20px);
          line-height:1.3;
          height: auto;
        }
        #cc-header{
          display:flex;align-items:center;gap:8px;margin-bottom:8px;
          cursor:move; user-select:none; touch-action:none;
        }
        #cc-title{font-size:13px;opacity:.9}
        #cc-actions{margin-left:auto;display:flex;gap:6px}
        .cc-btn{border:0;padding:6px 8px;font-size:12px;border-radius:6px;background:#2b2b2b;color:#eaeaea;cursor:pointer}
        .cc-btn:hover{filter:brightness(1.08)}

        :root{
          --cc-w: 380px;
          --cc-gap-y: 8px;
        }

        #cc-content{ display:flex; flex-direction:column; gap:var(--cc-gap-y); padding:4px 0; }
        .cc-section{ background: #2b2b2b; padding: 8px; border-radius: 6px; }
        .cc-row{ display:flex; align-items:center; gap:12px; margin-bottom: var(--cc-gap-y); }
        .cc-label{ width:80px; text-align:left; opacity:.9; font-size:12px }
        .cc-input{ flex:1; background:#111;color:#eaeaea;border:1px solid #333;border-radius:6px;padding:6px 8px;
          font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px }
        .cc-display{ background: #111; padding: 8px; border-radius: 6px; word-break: break-all; }
        .cc-hsv-axis{ display: flex; align-items: center; gap: 5px; margin: 5px 0; }
        .cc-hsv-bar{ flex: 1; height: 20px; position: relative; border-radius: 4px; }
        .cc-marker{ position: absolute; top: 0; width: 2px; height: 100%; }
        .cc-hsv-values{ width: 120px; text-align: right; font-size: 12px; opacity: .9; }
        #cc-correction-output{ margin-top: var(--cc-gap-y); }
    `);

    // ---------- DOM ----------
    const fab = document.createElement("div");
    fab.id = "cc-fab";
    fab.title = "Color Correction Tool";
    fab.textContent = "🧂";
    document.body.appendChild(fab);

    const modal = document.createElement("div");
    modal.id = "cc-modal";
    modal.innerHTML = `
        <div id="cc-header">
          <div id="cc-title">Color Correction Tool</div>
          <div id="cc-actions">
            <button id="toggle-ui" class="cc-btn">−</button>
          </div>
        </div>
        <div id="cc-content">
            <div class="cc-section">
                <div class="cc-row">
                    <label class="cc-label">Target Hex:</label>
                    <input type="text" id="target-hex" class="cc-input" placeholder="#FF0000" maxlength="7" style="text-transform: uppercase;">
                </div>
                <button id="get-input-btn" class="cc-btn" style="width: 100%; margin-bottom: var(--cc-gap-y);">Get INPUT Color</button>
                <button id="re-detect-btn" class="cc-btn" style="width: 100%; margin-bottom: var(--cc-gap-y);">Re-detect INPUT</button>
                <div id="input-display" class="cc-display" style="display: none;">
                    <strong>Input Hex:</strong> <span id="input-hex"></span><br>
                    <strong>HSV:</strong> H:<span id="input-h">0</span> S:<span id="input-s">0</span>% V:<span id="input-v">0</span>%
                </div>
            </div>
            <div class="cc-section">
                <button id="refresh-layers-btn" class="cc-btn" style="width: 100%; margin-bottom: var(--cc-gap-y);">Refresh Canvas Layers</button>
                <button id="toggle-pin-btn" class="cc-btn" style="width: 100%; margin-bottom: var(--cc-gap-y);">Toggle Pin (Pick Actual Color)</button>
                <div id="actual-display" class="cc-display">
                    <strong>Actual Hex (Topmost Canvas):</strong> <span id="actual-hex">#000000</span><br>
                    <strong>HSV:</strong> H:<span id="actual-h">0</span> S:<span id="actual-s">0</span>% V:<span id="actual-v">0</span>%
                </div>
            </div>
            <div class="cc-section">
                <strong>HSV Axes (<span style="color: #00f;">Target</span> vs <span style="color: #0f0;">Actual</span>):</strong><br>
                <div class="cc-hsv-axis">
                    <span>H:</span> <div class="cc-hsv-bar" style="background: linear-gradient(to right, red, orange, yellow, green, cyan, blue, magenta, red);">
                        <div id="target-h-marker" class="cc-marker" style="background: #00f; left: 0%;"></div>
                        <div id="actual-h-marker" class="cc-marker" style="background: #0f0; left: 0%;"></div>
                    </div>
                    <span id="hsv-values" class="cc-hsv-values">Target: 0 | Actual: 0</span>
                </div>
                <div class="cc-hsv-axis">
                    <span>S:</span> <div class="cc-hsv-bar" style="background: linear-gradient(to right, #fff, #f00);">
                        <div id="target-s-marker" class="cc-marker" style="background: #00f; left: 0%;"></div>
                        <div id="actual-s-marker" class="cc-marker" style="background: #0f0; left: 0%;"></div>
                    </div>
                    <span id="hsv-values-s" class="cc-hsv-values">Target: 0% | Actual: 0%</span>
                </div>
                <div class="cc-hsv-axis">
                    <span>V:</span> <div class="cc-hsv-bar" style="background: linear-gradient(to right, #000, #f00);">
                        <div id="target-v-marker" class="cc-marker" style="background: #00f; left: 0%;"></div>
                        <div id="actual-v-marker" class="cc-marker" style="background: #0f0; left: 0%;"></div>
                    </div>
                    <span id="hsv-values-v" class="cc-hsv-values">Target: 0% | Actual: 0%</span>
                </div>
            </div>
            <button id="compute-btn" class="cc-btn" style="width: 100%;">Compute Correction</button>
            <div id="correction-output" class="cc-display" style="display: none;">
                <strong>Correction Result:</strong> <span id="corrected-hex"></span>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Event listeners
    const refreshBtn = modal.querySelector('#refresh-layers-btn');
    refreshBtn.addEventListener('click', () => {
        detectCanvases();
        updatePinZIndex();
        if (pin) updateActualColor();
        alert(`Refreshed: Found ${allCanvases.length} canvases.`);
    });

    const targetHexInput = modal.querySelector('#target-hex');
    const getInputBtn = modal.querySelector('#get-input-btn');
    const inputDisplay = modal.querySelector('#input-display');
    const inputHexSpan = modal.querySelector('#input-hex');
    const inputHSpan = modal.querySelector('#input-h');
    const inputSSpan = modal.querySelector('#input-s');
    const inputVSpan = modal.querySelector('#input-v');
    const togglePinBtn = modal.querySelector('#toggle-pin-btn');
    const actualHexSpan = modal.querySelector('#actual-hex');
    const actualHSpan = modal.querySelector('#actual-h');
    const actualSSpan = modal.querySelector('#actual-s');
    const actualVSpan = modal.querySelector('#actual-v');
    const computeBtn = modal.querySelector('#compute-btn');
    const correctionOutput = modal.querySelector('#correction-output');
    const correctedHexSpan = modal.querySelector('#corrected-hex');
    const toggleBtn = modal.querySelector('#toggle-ui');
    toggleBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    const reDetectBtn = modal.querySelector('#re-detect-btn');

    getInputBtn.addEventListener('click', () => {
        const inputHex = getTargetHex();
        if (inputHex) {
            inputHexSpan.textContent = inputHex;
            const inputHsv = cssToHsv(inputHex);
            inputHSpan.textContent = Math.round(inputHsv.H * 360);
            inputSSpan.textContent = Math.round(inputHsv.S * 100);
            inputVSpan.textContent = Math.round(inputHsv.V * 100);
            inputDisplay.style.display = 'block';
            updateHSVMarkers();
        } else {
            alert('Could not find input element. Check TARGET selector.');
        }
    });

    togglePinBtn.addEventListener('click', () => {
        if (pin) {
            removePin();
            togglePinBtn.textContent = '🎯 Toggle Pin 🎯';
            actualHexSpan.textContent = '#000000';
            actualHSpan.textContent = 0; actualSSpan.textContent = 0; actualVSpan.textContent = 0;
            updateHSVMarkers();
        } else {
            createPin();
            togglePinBtn.textContent = 'Remove Pin';
        }
    });

    targetHexInput.addEventListener('input', updateHSVMarkers);

    computeBtn.addEventListener('click', () => {
        const correction = computeCorrection();
        correctedHexSpan.textContent = correction;
        correctionOutput.style.display = 'block';
    });

    toggleBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    reDetectBtn.addEventListener('click', reDetectTarget);

    targetEl = document.querySelector(TARGET);
    if (targetEl) {
        setupTargetListeners(targetEl);
    } else {
        const domObserver = new MutationObserver(() => {
            targetEl = document.querySelector(TARGET);
            if (targetEl) {
                domObserver.disconnect();
                setupTargetListeners(targetEl);
            }
        });
        domObserver.observe(document.body, { childList: true, subtree: true });
        console.warn('TARGET element not found initially; observing DOM for appearance.');
    }

    updateHSVMarkers();

    // ---------- FAB drag ----------
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
        const w = 56, h = 56, pad = 20;
        if (typeof left !== "number" || typeof top !== "number") {
            left = window.innerWidth - w - pad;
            top = window.innerHeight - h - pad;
        }
        fab.style.left = Math.max(8, Math.min(left, window.innerWidth - w - 8)) + "px";
        fab.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + "px";
    }
    function saveFabPos() {
        const r = fab.getBoundingClientRect();
        localStorage.setItem(FAB_POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
    }
    function enableFabDrag() {
        let dragging = false, offsetX = 0, offsetY = 0;
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
            const w = 56, h = 56;
            let x = e.clientX - offsetX, y = e.clientY - offsetY;
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

    // ---------- Modal drag ----------
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
        localStorage.setItem(MODAL_POS_KEY, JSON.stringify({ left: Math.round(r.left), top: Math.round(r.top) }));
    }
    function enableModalDrag() {
        const header = modal.querySelector("#cc-header");
        let dragging = false, offsetX = 0, offsetY = 0;

        const isControlTarget = (el) => !!el.closest('.cc-btn') || !!el.closest('.cc-input') || !!el.closest('#cc-actions');

        header.addEventListener("pointerdown", (e) => {
            if (isControlTarget(e.target)) return;

            const r = modal.getBoundingClientRect();
            modal.style.right = "auto";
            modal.style.bottom = "auto";
            modal.style.left = Math.round(r.left) + "px";
            modal.style.top = Math.round(r.top) + "px";

            dragging = true;
            offsetX = e.clientX - r.left;
            offsetY = e.clientY - r.top;
            try { header.setPointerCapture(e.pointerId); } catch (err) {}
            e.preventDefault();
        });

        window.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const { left, top } = clampModalToViewport(e.clientX - offsetX, e.clientY - offsetY);
            modal.style.left = left + "px";
            modal.style.top = top + "px";
        }, { passive: false });

        window.addEventListener("pointerup", (e) => {
            if (!dragging) return;
            dragging = false;
            try { header.releasePointerCapture(e.pointerId); } catch (err) {}
            saveModalPos();
        });

        window.addEventListener("resize", () => {
            if (modal.style.display !== "none") restoreModalPos();
        });

        const toggleBtn = modal.querySelector('#toggle-ui');
        if (toggleBtn) {
            toggleBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
            toggleBtn.addEventListener('pointerup', (e) => { e.stopPropagation(); });
            toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); modal.style.display = 'none'; });
        }
    }


    const openModal = () => {
        modal.style.display = "block";
        restoreModalPos();
        detectCanvases(); // Initial
    };

    fab.addEventListener("click", openModal);

    // ---------- Initialize ----------
    restoreFabPos();
    enableFabDrag();
    enableModalDrag();

    console.log('Color Correction UI Plus initialized.');

})();