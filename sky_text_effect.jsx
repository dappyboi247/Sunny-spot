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
 *   3. Adjust colours / settings in the panel as desired.
 *   4. Click  Apply Effect.
 *   5. A "SKY_TEXT_EFFECT" pre-comp is built in the timeline.
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
        opacity:   "60",       // Base fill opacity  (%)
        driftDur:  "10",       // Gradient drift duration  (seconds)
        driftPct:  "6",        // Drift magnitude  (% of shorter comp dimension)
        vertDrift: "20",       // Vertical position drift  (px, upward)
        blackLift: "20",       // Levels Output Black lift  (0–255)
        inset:     "15"        // Colour-point corner inset  (%)
    };

    // ─────────────────────────────────────────────────────────────────────────
    // CORE HELPERS  (shared by the effect engine)
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
    // ─────────────────────────────────────────────────────────────────────────

    function applyEffect(params) {

        // ── Comp / layer validation ──────────────────────────────────────────

        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            alert("Please open a composition first.");
            return;
        }
        if (comp.selectedLayers.length === 0) {
            alert("Please select a text layer.");
            return;
        }
        var origLayer = comp.selectedLayers[0];
        if (!(origLayer instanceof TextLayer)) {
            alert("Selected layer must be a text layer.");
            return;
        }

        // ── Param validation ─────────────────────────────────────────────────

        var errs = [];
        var c1  = validateHex(params.c1);       if (!c1)  { errs.push("Color 1 is not a valid hex value."); }
        var c2  = validateHex(params.c2);       if (!c2)  { errs.push("Color 2 is not a valid hex value."); }
        var c3  = validateHex(params.c3);       if (!c3)  { errs.push("Color 3 is not a valid hex value."); }
        var c4  = validateHex(params.c4);       if (!c4)  { errs.push("Color 4 is not a valid hex value."); }
        var opa = validateNum(params.opacity,  0, 100);  if (opa  === null) { errs.push("Opacity must be 0–100."); }
        var dDr = validateNum(params.driftDur, 0);       if (dDr  === null) { errs.push("Drift duration must be >= 0."); }
        var dPc = validateNum(params.driftPct, 0, 100);  if (dPc  === null) { errs.push("Drift amount must be 0–100."); }
        var vDr = validateNum(params.vertDrift);         if (vDr  === null) { errs.push("Vertical drift must be a number."); }
        var bLf = validateNum(params.blackLift, 0, 254); if (bLf  === null) { errs.push("Black-point lift must be 0–254."); }
        var ins = validateNum(params.inset,     1,  49); if (ins  === null) { errs.push("Corner inset must be 1–49."); }

        if (errs.length > 0) {
            alert("Please fix the following:\n\n• " + errs.join("\n• "));
            return;
        }

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
            if (!fx4) {
                throw new Error("Could not add 4-Color Gradient.\n" +
                                "Check: Effect > Generate > 4-Color Gradient.");
            }

            var colDefs = [
                { opts: ["ADBE 4col-c1", "Color 1", 4],  val: hexToAE(c1) },
                { opts: ["ADBE 4col-c2", "Color 2", 6],  val: hexToAE(c2) },
                { opts: ["ADBE 4col-c3", "Color 3", 8],  val: hexToAE(c3) },
                { opts: ["ADBE 4col-c4", "Color 4", 10], val: hexToAE(c4) }
            ];
            for (var ci = 0; ci < colDefs.length; ci++) {
                if (!setProp(fx4, colDefs[ci].opts, colDefs[ci].val)) {
                    warnings.push("Color " + (ci + 1) + " could not be set.");
                }
            }

            // Animated point positions
            var ix  = W * (ins / 100);
            var iy  = H * (ins / 100);
            var ptStarts = [
                [ix,     iy    ],
                [W - ix, iy    ],
                [ix,     H - iy],
                [W - ix, H - iy]
            ];
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
                    } catch (e) { warnings.push("Point " + (pi + 1) + " keyframes: " + e.message); }
                } else {
                    warnings.push("Could not find Point " + (pi + 1) + " on gradient.");
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
                    warnings.push("Levels Output Black could not be set. Set it manually to " + bLf + ".");
                }
            } else {
                warnings.push("Could not add Levels effect.");
            }

            // 7 — Pre-compose
            var indices = [origLayer.index, solid.index, baseLayer.index];
            indices.sort(function (a, b) { return a - b; });
            comp.layers.precompose(indices, "SKY_TEXT_EFFECT", true);

            var msg = "Done!  'SKY_TEXT_EFFECT' added to timeline.\n\n" +
                      "Inside the pre-comp:\n" +
                      "  " + origName + "  (Alpha Matte)\n" +
                      "  SKY_GRADIENT\n" +
                      "  " + origName + "_BASE  (base fill)";
            if (warnings.length > 0) {
                msg += "\n\nWarnings:\n• " + warnings.join("\n• ");
            }
            alert(msg);

        } catch (err) {
            alert("Sky Text Effect failed:\n\n" + err.toString() +
                  (err.line !== undefined ? "\nLine: " + err.line : ""));
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

        // ── Title ────────────────────────────────────────────────────────────

        var titleLbl = win.add("statictext", undefined, "SKY TEXT EFFECT");
        titleLbl.alignment = ["center", "top"];

        // ── Helper: hex colour row ────────────────────────────────────────────
        // Returns the edittext field.

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
            sldr.alignment    = ["fill", "center"];
            sldr.preferredSize = [-1, 16];

            var field = row.add("edittext", undefined, String(defVal));
            field.preferredSize = [38, -1];

            if (unitsStr) {
                var uLbl = row.add("statictext", undefined, unitsStr);
                uLbl.preferredSize = [28, -1];
            }

            // Keep slider and field in sync
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

        var r_opa = makeSliderRow(setPanel, "Base fill opacity",  60,  0, 100, "%");
        var r_dDr = makeSliderRow(setPanel, "Gradient drift",     10,  1,  30, "s");
        var r_dPc = makeSliderRow(setPanel, "Drift amount",        6,  0,  20, "%");
        var r_vDr = makeSliderRow(setPanel, "Vertical drift",     20,  0, 100, "px");
        var r_bLf = makeSliderRow(setPanel, "Black-point lift",   20,  0, 100, "/255");
        var r_ins = makeSliderRow(setPanel, "Corner inset",       15,  1,  49, "%");

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

        var statusBar = win.add("statictext", undefined,
            "Select a text layer, then click Apply.");
        statusBar.alignment = ["fill", "bottom"];

        // ── Reset handler ─────────────────────────────────────────────────────

        resetBtn.onClick = function () {
            f_c1.text = DEFAULTS.c1;
            f_c2.text = DEFAULTS.c2;
            f_c3.text = DEFAULTS.c3;
            f_c4.text = DEFAULTS.c4;

            r_opa.field.text = "60";  r_opa.slider.value = 60;
            r_dDr.field.text = "10";  r_dDr.slider.value = 10;
            r_dPc.field.text = "6";   r_dPc.slider.value = 6;
            r_vDr.field.text = "20";  r_vDr.slider.value = 20;
            r_bLf.field.text = "20";  r_bLf.slider.value = 20;
            r_ins.field.text = "15";  r_ins.slider.value = 15;

            statusBar.text = "Reset to defaults.";
            win.update();
        };

        // ── Apply handler ─────────────────────────────────────────────────────

        applyBtn.onClick = function () {
            statusBar.text = "Running…";
            win.update();

            try {
                applyEffect({
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
                statusBar.text = "Done! SKY_TEXT_EFFECT added to timeline.";
            } catch (e) {
                statusBar.text = "Error — see alert.";
                alert("Sky Text Effect error:\n\n" + e.toString() +
                      (e.line !== undefined ? "\nLine: " + e.line : ""));
            }
            win.update();
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
