/**
 * sky_text_effect.jsx  -  "Sky Inside Letters"
 * ─────────────────────────────────────────────────────────────────────────────
 * Adobe After Effects ExtendScript  |  ScriptUI Panel
 *
 * INSTALLATION (dockable panel)
 *   Copy to: [AE app folder] / Scripts / ScriptUI Panels /
 *   Restart AE, then: Window > sky_text_effect.jsx
 *
 * INSTALLATION (run once)
 *   File > Scripts > Run Script File…  and pick this file.
 *
 * HOW TO USE
 *   1. Open a composition with at least one text layer.
 *   2. Select the text layer in the Timeline.
 *   3. Adjust colours / settings in the panel.
 *   4. Click Apply Effect — watch the status bar at the bottom.
 *   5. A "SKY_TEXT_EFFECT" pre-comp appears in the timeline.
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function (thisObj) {

    // ─────────────────────────────────────────────────────────────────────────
    // DEFAULTS
    // ─────────────────────────────────────────────────────────────────────────

    var DEFAULTS = {
        c1:        "2E4A7A",   // Corner 1  —  deep sky blue    (top-left)
        c2:        "C06C84",   // Corner 2  —  dusty rose       (top-right)
        c3:        "FF8C42",   // Corner 3  —  amber orange     (bottom-left)
        c4:        "1A0A2E",   // Corner 4  —  deep violet      (bottom-right)
        opacity:   60,         // Base fill opacity  (%)
        driftDur:  10,         // Gradient drift duration  (seconds)
        driftPct:  6,          // Drift magnitude  (% of shorter comp dimension)
        vertDrift: 20,         // Vertical position drift  (px, upward)
        blackLift: 20,         // Levels Output Black  (0–255)
        inset:     15          // Colour-point corner inset  (%)
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CORE HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    function hexToAE(hex) {
        hex = hex.replace(/^#/, "").trim();
        return [
            parseInt(hex.substr(0, 2), 16) / 255,
            parseInt(hex.substr(2, 2), 16) / 255,
            parseInt(hex.substr(4, 2), 16) / 255,
            1
        ];
    }

    function findProp(parent, options) {
        for (var i = 0; i < options.length; i++) {
            try { var p = parent.property(options[i]); if (p) { return p; } } catch (e) {}
        }
        return null;
    }

    function addFx(layer, nameOptions) {
        var groupKeys = ["ADBE Effect Parade", "Effects"];
        for (var gi = 0; gi < groupKeys.length; gi++) {
            var fxGroup;
            try { fxGroup = layer.property(groupKeys[gi]); } catch (e) { continue; }
            if (!fxGroup) { continue; }
            for (var ni = 0; ni < nameOptions.length; ni++) {
                try { return fxGroup.addProperty(nameOptions[ni]); } catch (e) {}
            }
        }
        return null;
    }

    function setProp(parent, options, value) {
        var p = findProp(parent, options);
        if (!p) { return false; }
        try { p.setValue(value); return true; } catch (e) { return false; }
    }

    function easyEaseAll(prop) {
        var n = prop.numKeys;
        if (n < 1) { return; }
        var dims = 1;
        try { var v = prop.value; if (v && typeof v.length === "number" && v.length > 1) { dims = v.length; } } catch (e) {}
        var ei = new KeyframeEase(0, 33.33);
        var eo = new KeyframeEase(0, 33.33);
        var ia = [], oa = [];
        for (var d = 0; d < dims; d++) { ia.push(ei); oa.push(eo); }
        for (var k = 1; k <= n; k++) {
            try { prop.setTemporalEasingAtKey(k, ia, oa); } catch (e) {}
        }
    }

    /**
     * Robust active-comp finder.
     * Clicking a floating palette button can cause app.project.activeItem
     * to lose focus and return null. This falls back to scanning for a comp
     * that has a selected layer, then any open comp.
     */
    function findActiveComp() {
        var item = app.project.activeItem;
        if (item instanceof CompItem) { return item; }

        // Fallback 1: comp with a selected layer
        for (var i = 1; i <= app.project.numItems; i++) {
            try {
                item = app.project.items[i];
                if (item instanceof CompItem && item.selectedLayers.length > 0) {
                    return item;
                }
            } catch (e) {}
        }

        // Fallback 2: first comp in the project
        for (var j = 1; j <= app.project.numItems; j++) {
            try {
                item = app.project.items[j];
                if (item instanceof CompItem) { return item; }
            } catch (e) {}
        }

        return null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    function validateHex(str) {
        var s = str.replace(/^#/, "").trim();
        return /^[0-9A-Fa-f]{6}$/.test(s) ? s : null;
    }

    function validateNum(str, min, max) {
        var n = parseFloat(str);
        if (isNaN(n)) { return null; }
        if (min !== undefined && n < min) { return null; }
        if (max !== undefined && n > max) { return null; }
        return n;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EFFECT ENGINE
    // Throws a descriptive Error on any failure — caller shows it in UI.
    // Never calls alert() directly; all feedback goes through the status bar.
    // ─────────────────────────────────────────────────────────────────────────

    function applyEffect(params) {

        // ── Comp / layer checks ──────────────────────────────────────────────

        var comp = findActiveComp();
        if (!comp) {
            throw new Error("No composition found. Open a comp and try again.");
        }
        if (comp.selectedLayers.length === 0) {
            throw new Error("No layer selected. Click a text layer in the Timeline first.");
        }
        var origLayer = comp.selectedLayers[0];
        if (!(origLayer instanceof TextLayer)) {
            throw new Error("Selected layer is not a text layer. Select a text layer and try again.");
        }

        // ── Param validation ─────────────────────────────────────────────────

        var errs = [];
        var c1  = validateHex(params.c1);       if (!c1)  { errs.push("Color 1 — not a valid hex (e.g. 2E4A7A)"); }
        var c2  = validateHex(params.c2);       if (!c2)  { errs.push("Color 2 — not a valid hex"); }
        var c3  = validateHex(params.c3);       if (!c3)  { errs.push("Color 3 — not a valid hex"); }
        var c4  = validateHex(params.c4);       if (!c4)  { errs.push("Color 4 — not a valid hex"); }
        var opa = validateNum(params.opacity,  0, 100);  if (opa  === null) { errs.push("Opacity: must be 0–100"); }
        var dDr = validateNum(params.driftDur, 1,  30);  if (dDr  === null) { errs.push("Gradient drift: must be 1–30"); }
        var dPc = validateNum(params.driftPct, 0,  20);  if (dPc  === null) { errs.push("Drift amount: must be 0–20"); }
        var vDr = validateNum(params.vertDrift);          if (vDr  === null) { errs.push("Vertical drift: must be a number"); }
        var bLf = validateNum(params.blackLift, 0, 254);  if (bLf  === null) { errs.push("Black-point lift: must be 0–254"); }
        var ins = validateNum(params.inset,     1,  49);  if (ins  === null) { errs.push("Corner inset: must be 1–49"); }
        if (errs.length > 0) { throw new Error("Fix these values:\n• " + errs.join("\n• ")); }

        // ── Build ────────────────────────────────────────────────────────────

        app.beginUndoGroup("Sky Text Effect");
        try {
            var W        = comp.width;
            var H        = comp.height;
            var dur      = comp.duration;
            var origName = origLayer.name;
            var warnings = [];

            // 1 — Base fill
            var baseLayer = origLayer.duplicate();
            baseLayer.name = origName + "_BASE";
            baseLayer.moveToEnd();
            try { baseLayer.property("Transform").property("Opacity").setValue(opa); }
            catch (e) { warnings.push("Base opacity: " + e.message); }

            // 2 — SKY_GRADIENT solid
            var solid = comp.layers.addSolid([1, 1, 1], "SKY_GRADIENT", W, H, 1, dur);
            solid.moveAfter(origLayer);

            // 3 — 4-Color Gradient
            var fx4 = addFx(solid, ["ADBE 4-Color Gradient", "4-Color Gradient"]);
            if (!fx4) { throw new Error("Could not add 4-Color Gradient. Check Effect > Generate."); }

            var colDefs = [
                { opts: ["ADBE 4col-c1", "Color 1", 4],  val: hexToAE(c1) },
                { opts: ["ADBE 4col-c2", "Color 2", 6],  val: hexToAE(c2) },
                { opts: ["ADBE 4col-c3", "Color 3", 8],  val: hexToAE(c3) },
                { opts: ["ADBE 4col-c4", "Color 4", 10], val: hexToAE(c4) }
            ];
            for (var ci = 0; ci < colDefs.length; ci++) {
                if (!setProp(fx4, colDefs[ci].opts, colDefs[ci].val)) {
                    warnings.push("Color " + (ci + 1) + " not set — set it manually in Effect Controls.");
                }
            }

            // Animated point positions
            var ix = W * (ins / 100), iy = H * (ins / 100);
            var ptStarts = [[ix, iy], [W-ix, iy], [ix, H-iy], [W-ix, H-iy]];
            var dv = Math.min(W, H) * (dPc / 100);
            var ptDeltas = [
                [ dv,        dv * 0.40],
                [-dv * 0.70, dv * 0.60],
                [ dv * 0.50,-dv * 0.50],
                [-dv * 0.60,-dv * 0.70]
            ];
            var ptDefs = [
                { opts: ["ADBE 4col-p1", "Point 1", 3] },
                { opts: ["ADBE 4col-p2", "Point 2", 5] },
                { opts: ["ADBE 4col-p3", "Point 3", 7] },
                { opts: ["ADBE 4col-p4", "Point 4", 9] }
            ];
            var kDur = Math.min(dDr, dur);
            for (var pi = 0; pi < 4; pi++) {
                var ptProp = findProp(fx4, ptDefs[pi].opts);
                if (ptProp) {
                    try {
                        var s = ptStarts[pi], dl = ptDeltas[pi];
                        ptProp.setValueAtTime(0,    [s[0],         s[1]        ]);
                        ptProp.setValueAtTime(kDur, [s[0] + dl[0], s[1] + dl[1]]);
                        easyEaseAll(ptProp);
                    } catch (e) { warnings.push("Point " + (pi+1) + ": " + e.message); }
                } else {
                    warnings.push("Point " + (pi+1) + " not found — gradient won't animate.");
                }
            }

            // 4 — Alpha Matte
            solid.trackMatteType = TrackMatteType.ALPHA;

            // 5 — Vertical drift
            try {
                var posProp = solid.property("Transform").property("Position");
                var pv = posProp.value;
                posProp.setValueAtTime(0,   [pv[0], pv[1]      ]);
                posProp.setValueAtTime(dur, [pv[0], pv[1] - vDr]);
                easyEaseAll(posProp);
            } catch (e) { warnings.push("Position drift: " + e.message); }

            // 6 — Black-point lift (Levels)
            var levFx = addFx(solid, ["ADBE Levels", "Levels"]);
            if (levFx) {
                if (!setProp(levFx, ["ADBE Lev-outb", "Output Black", 6], bLf / 255)) {
                    warnings.push("Levels Output Black not set — set manually to " + bLf + ".");
                }
            } else {
                warnings.push("Levels effect not added.");
            }

            // 7 — Pre-compose
            var indices = [origLayer.index, solid.index, baseLayer.index];
            indices.sort(function (a, b) { return a - b; });
            comp.layers.precompose(indices, "SKY_TEXT_EFFECT", true);

            // Return result string for the status bar
            var result = "Done! SKY_TEXT_EFFECT added to timeline.";
            if (warnings.length > 0) {
                result += " (" + warnings.length + " warning" +
                          (warnings.length > 1 ? "s" : "") + " — see console)";
                for (var wi = 0; wi < warnings.length; wi++) {
                    $.writeln("Sky Text Effect warning: " + warnings[wi]);
                }
            }
            return result;

        } finally {
            app.endUndoGroup();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────────────────────────────────

    function buildUI(thisObj) {

        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Sky Text Effect", undefined, { resizeable: true });

        win.orientation   = "column";
        win.alignChildren = ["fill", "top"];
        win.margins       = [12, 12, 12, 12];
        win.spacing       = 8;

        // ── Title ─────────────────────────────────────────────────────────────

        var titleLbl = win.add("statictext", undefined, "SKY TEXT EFFECT");
        titleLbl.alignment = ["center", "top"];

        // ── Helper: hex colour row ─────────────────────────────────────────────

        function makeColorRow(parent, labelStr, defaultHex, hintStr) {
            var row = parent.add("group");
            row.orientation   = "row";
            row.alignChildren = ["left", "center"];
            row.spacing       = 4;

            var lbl = row.add("statictext", undefined, labelStr);
            lbl.preferredSize = [82, -1];

            row.add("statictext", undefined, "#");

            var field = row.add("edittext", undefined, defaultHex);
            field.preferredSize = [62, -1];

            if (hintStr) {
                var hint = row.add("statictext", undefined, hintStr);
                hint.preferredSize = [84, -1];
            }
            return field;
        }

        // ── Helper: slider row ────────────────────────────────────────────────
        // Returns { field, slider } so reset can update both.

        function makeSliderRow(parent, labelStr, defVal, minVal, maxVal, unitsStr) {
            var row = parent.add("group");
            row.orientation   = "row";
            row.alignment     = ["fill", "top"];
            row.alignChildren = ["left", "center"];
            row.spacing       = 6;

            var lbl = row.add("statictext", undefined, labelStr);
            lbl.preferredSize = [108, -1];

            var sldr = row.add("slider", undefined, defVal, minVal, maxVal);
            sldr.alignment     = ["fill", "center"];
            sldr.preferredSize = [-1, 16];

            var field = row.add("edittext", undefined, String(defVal));
            field.preferredSize = [38, -1];

            if (unitsStr) {
                var uLbl = row.add("statictext", undefined, unitsStr);
                uLbl.preferredSize = [28, -1];
            }

            sldr.onChanging = function () {
                field.text = String(Math.round(sldr.value));
            };
            field.onChange = function () {
                var n = parseFloat(field.text);
                if (!isNaN(n)) { sldr.value = Math.min(maxVal, Math.max(minVal, n)); }
            };

            return { field: field, slider: sldr };
        }

        // ── Colours panel ─────────────────────────────────────────────────────

        var colPanel = win.add("panel", undefined, "Colours");
        colPanel.orientation   = "column";
        colPanel.alignChildren = ["fill", "top"];
        colPanel.margins       = [10, 14, 10, 10];
        colPanel.spacing       = 5;

        var f_c1 = makeColorRow(colPanel, "Corner 1 (↖)", DEFAULTS.c1, "deep sky blue");
        var f_c2 = makeColorRow(colPanel, "Corner 2 (↗)", DEFAULTS.c2, "dusty rose");
        var f_c3 = makeColorRow(colPanel, "Corner 3 (↙)", DEFAULTS.c3, "amber orange");
        var f_c4 = makeColorRow(colPanel, "Corner 4 (↘)", DEFAULTS.c4, "deep violet");

        // ── Settings panel ────────────────────────────────────────────────────

        var setPanel = win.add("panel", undefined, "Settings");
        setPanel.orientation   = "column";
        setPanel.alignChildren = ["fill", "top"];
        setPanel.margins       = [10, 14, 10, 10];
        setPanel.spacing       = 6;

        var r_opa = makeSliderRow(setPanel, "Base fill opacity",  DEFAULTS.opacity,    0, 100, "%");
        var r_dDr = makeSliderRow(setPanel, "Gradient drift",     DEFAULTS.driftDur,   1,  30, "s");
        var r_dPc = makeSliderRow(setPanel, "Drift amount",       DEFAULTS.driftPct,   0,  20, "%");
        var r_vDr = makeSliderRow(setPanel, "Vertical drift",     DEFAULTS.vertDrift,  0, 100, "px");
        var r_bLf = makeSliderRow(setPanel, "Black-point lift",   DEFAULTS.blackLift,  0, 100, "/255");
        var r_ins = makeSliderRow(setPanel, "Corner inset",       DEFAULTS.inset,      1,  49, "%");

        // ── Buttons ───────────────────────────────────────────────────────────

        var btnGroup = win.add("group");
        btnGroup.orientation   = "row";
        btnGroup.alignment     = ["fill", "top"];
        btnGroup.alignChildren = ["fill", "center"];
        btnGroup.spacing       = 6;
        btnGroup.margins       = [0, 4, 0, 0];

        var resetBtn = btnGroup.add("button", undefined, "Reset");
        resetBtn.preferredSize = [60, 26];

        var applyBtn = btnGroup.add("button", undefined, "Apply Effect");
        applyBtn.preferredSize = [-1, 26];

        // ── Status bar ────────────────────────────────────────────────────────
        // All feedback goes here — no alert() dialogs that could hide behind panel.

        var statusBar = win.add("statictext", undefined, "Select a text layer, then click Apply.");
        statusBar.alignment   = ["fill", "bottom"];
        statusBar.preferredSize = [-1, 28];

        function setStatus(msg) {
            statusBar.text = msg;
            win.update();
        }

        // ── Reset ─────────────────────────────────────────────────────────────

        resetBtn.onClick = function () {
            f_c1.text = DEFAULTS.c1;
            f_c2.text = DEFAULTS.c2;
            f_c3.text = DEFAULTS.c3;
            f_c4.text = DEFAULTS.c4;
            r_opa.field.text = String(DEFAULTS.opacity);    r_opa.slider.value = DEFAULTS.opacity;
            r_dDr.field.text = String(DEFAULTS.driftDur);   r_dDr.slider.value = DEFAULTS.driftDur;
            r_dPc.field.text = String(DEFAULTS.driftPct);   r_dPc.slider.value = DEFAULTS.driftPct;
            r_vDr.field.text = String(DEFAULTS.vertDrift);  r_vDr.slider.value = DEFAULTS.vertDrift;
            r_bLf.field.text = String(DEFAULTS.blackLift);  r_bLf.slider.value = DEFAULTS.blackLift;
            r_ins.field.text = String(DEFAULTS.inset);      r_ins.slider.value = DEFAULTS.inset;
            setStatus("Reset to defaults.");
        };

        // ── Apply ─────────────────────────────────────────────────────────────

        applyBtn.onClick = function () {
            setStatus("Running…");
            try {
                var result = applyEffect({
                    c1:        f_c1.text,
                    c2:        f_c2.text,
                    c3:        f_c3.text,
                    c4:        f_c4.text,
                    opacity:   r_opa.field.text,
                    driftDur:  r_dDr.field.text,
                    driftPct:  r_dPc.field.text,
                    vertDrift: r_vDr.field.text,
                    blackLift: r_bLf.field.text,
                    inset:     r_ins.field.text
                });
                setStatus(result);
            } catch (e) {
                setStatus("ERROR: " + e.message);
            }
        };

        return win;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INIT
    // ─────────────────────────────────────────────────────────────────────────

    var panel = buildUI(thisObj);

    if (panel instanceof Window) {
        panel.center();
        panel.show();
    } else {
        panel.layout.layout(true);
    }

})(this);
