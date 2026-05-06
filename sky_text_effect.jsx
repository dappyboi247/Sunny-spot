#target aftereffects
#targetengine "sky_text_effect"

/**
 * sky_text_effect.jsx - "Sky Inside Letters"
 * Adobe After Effects ExtendScript | ScriptUI Panel
 */

(function (thisObj) {
    var DEFAULTS = {
        c1: "2E4A7A",
        c2: "C06C84",
        c3: "FF8C42",
        c4: "1A0A2E",
        opacity: 60,
        driftDur: 10,
        driftPct: 6,
        vertDrift: 20,
        blackLift: 20,
        inset: 15
    };

    function hexToAE(hex) {
        hex = (hex || "").replace(/^#/, "").replace(/\s+/g, "");
        return [
            parseInt(hex.substr(0, 2), 16) / 255,
            parseInt(hex.substr(2, 2), 16) / 255,
            parseInt(hex.substr(4, 2), 16) / 255,
            1
        ];
    }

    function findProp(parent, names) {
        if (!parent) { return null; }
        for (var i = 0; i < names.length; i++) {
            try {
                var p = parent.property(names[i]);
                if (p) { return p; }
            } catch (e) {}
        }
        return null;
    }

    function addEffect(layer, names) {
        var fxGroup = findProp(layer, ["ADBE Effect Parade", "Effects"]);
        if (!fxGroup) { return null; }
        for (var i = 0; i < names.length; i++) {
            try {
                return fxGroup.addProperty(names[i]);
            } catch (e) {}
        }
        return null;
    }

    function setProp(parent, names, value) {
        var prop = findProp(parent, names);
        if (!prop) { return false; }
        try {
            prop.setValue(value);
            return true;
        } catch (e) {
            return false;
        }
    }

    function setEase(prop) {
        if (!prop || prop.numKeys < 1) { return; }

        var dims = 1;
        try {
            var v = prop.value;
            if (v && typeof v.length === "number" && v.length > 1) {
                dims = v.length;
            }
        } catch (e) {}

        var inEase = [];
        var outEase = [];
        for (var i = 0; i < dims; i++) {
            inEase.push(new KeyframeEase(0, 33.33));
            outEase.push(new KeyframeEase(0, 33.33));
        }

        for (var k = 1; k <= prop.numKeys; k++) {
            try {
                prop.setTemporalEaseAtKey(k, inEase, outEase);
            } catch (e2) {}
        }
    }

    function validateHex(value) {
        var s = (value || "").replace(/^#/, "").replace(/\s+/g, "");
        return /^[0-9A-Fa-f]{6}$/.test(s) ? s : null;
    }

    function validateNum(value, min, max) {
        var n = parseFloat(value);
        if (isNaN(n)) { return null; }
        if (min !== undefined && n < min) { return null; }
        if (max !== undefined && n > max) { return null; }
        return n;
    }

    function findActiveComp() {
        var item = app.project.activeItem;
        if (item instanceof CompItem) { return item; }

        for (var i = 1; i <= app.project.numItems; i++) {
            try {
                item = app.project.items[i];
                if (item instanceof CompItem && item.selectedLayers.length > 0) {
                    return item;
                }
            } catch (e) {}
        }

        for (var j = 1; j <= app.project.numItems; j++) {
            try {
                item = app.project.items[j];
                if (item instanceof CompItem) { return item; }
            } catch (e2) {}
        }

        return null;
    }

    function isTextLayer(layer) {
        if (!layer) { return false; }
        try {
            if (layer.matchName === "ADBE Text Layer") { return true; }
        } catch (e) {}
        try {
            return !!layer.property("ADBE Text Properties");
        } catch (e2) {
            return false;
        }
    }

    function applyTrackMatte(layer, matteLayer, matteType) {
        if (!layer) { return false; }
        try {
            if (typeof layer.setTrackMatte === "function") {
                layer.setTrackMatte(matteLayer, matteType);
                return true;
            }
        } catch (e) {}

        try {
            layer.trackMatteType = matteType;
            return true;
        } catch (e2) {}

        return false;
    }

    function applyEffect(params) {
        if (!app.project) {
            throw new Error("No project is open.");
        }

        var comp = findActiveComp();
        if (!comp) {
            throw new Error("No composition found. Open a comp and try again.");
        }
        if (comp.selectedLayers.length === 0) {
            throw new Error("No layer selected. Click a text layer in the Timeline first.");
        }

        var origLayer = comp.selectedLayers[0];
        if (!isTextLayer(origLayer)) {
            throw new Error("Selected layer is not a text layer. Select a text layer and try again.");
        }

        var errs = [];
        var c1 = validateHex(params.c1); if (!c1) { errs.push("Color 1 - not a valid hex (e.g. 2E4A7A)"); }
        var c2 = validateHex(params.c2); if (!c2) { errs.push("Color 2 - not a valid hex"); }
        var c3 = validateHex(params.c3); if (!c3) { errs.push("Color 3 - not a valid hex"); }
        var c4 = validateHex(params.c4); if (!c4) { errs.push("Color 4 - not a valid hex"); }
        var opa = validateNum(params.opacity, 0, 100); if (opa === null) { errs.push("Opacity: must be 0-100"); }
        var dDr = validateNum(params.driftDur, 1, 30); if (dDr === null) { errs.push("Gradient drift: must be 1-30"); }
        var dPc = validateNum(params.driftPct, 0, 20); if (dPc === null) { errs.push("Drift amount: must be 0-20"); }
        var vDr = validateNum(params.vertDrift); if (vDr === null) { errs.push("Vertical drift: must be a number"); }
        var bLf = validateNum(params.blackLift, 0, 254); if (bLf === null) { errs.push("Black-point lift: must be 0-254"); }
        var ins = validateNum(params.inset, 1, 49); if (ins === null) { errs.push("Corner inset: must be 1-49"); }
        if (errs.length > 0) {
            throw new Error("Fix these values:\n* " + errs.join("\n* "));
        }

        app.beginUndoGroup("Sky Text Effect");
        try {
            var W = comp.width;
            var H = comp.height;
            var dur = comp.duration;
            var origName = origLayer.name;
            var warnings = [];

            $.writeln("Sky Text Effect: applying to comp '" + comp.name + "', layer '" + origName + "'.");

            var baseLayer = origLayer.duplicate();
            baseLayer.name = origName + "_BASE";
            baseLayer.moveToEnd();
            try {
                var baseTransform = findProp(baseLayer, ["ADBE Transform Group", "Transform"]);
                if (baseTransform) {
                    setProp(baseTransform, ["ADBE Opacity", "Opacity"], opa);
                }
            } catch (e0) {
                warnings.push("Base opacity could not be set.");
            }

            var solid = comp.layers.addSolid([1, 1, 1], "SKY_GRADIENT", W, H, 1, dur);
            solid.moveAfter(origLayer);

            var fx4 = addEffect(solid, ["ADBE 4ColorGradient", "4-Color Gradient"]);
            if (!fx4) {
                throw new Error("Could not add 4-Color Gradient. Check Effect > Generate.");
            }

            var colorProps = [
                { names: ["ADBE 4ColorGradient-0001", "Color 1", 4], value: hexToAE(c1) },
                { names: ["ADBE 4ColorGradient-0003", "Color 2", 6], value: hexToAE(c2) },
                { names: ["ADBE 4ColorGradient-0005", "Color 3", 8], value: hexToAE(c3) },
                { names: ["ADBE 4ColorGradient-0007", "Color 4", 10], value: hexToAE(c4) }
            ];
            for (var ci = 0; ci < colorProps.length; ci++) {
                if (!setProp(fx4, colorProps[ci].names, colorProps[ci].value)) {
                    warnings.push("Color " + (ci + 1) + " was not set automatically.");
                }
            }

            var ix = W * (ins / 100);
            var iy = H * (ins / 100);
            var ptStarts = [[ix, iy], [W - ix, iy], [ix, H - iy], [W - ix, H - iy]];
            var dv = Math.min(W, H) * (dPc / 100);
            var ptDeltas = [
                [dv, dv * 0.40],
                [-dv * 0.70, dv * 0.60],
                [dv * 0.50, -dv * 0.50],
                [-dv * 0.60, -dv * 0.70]
            ];
            var ptDefs = [
                { names: ["ADBE 4ColorGradient-0002", "Point 1", 3] },
                { names: ["ADBE 4ColorGradient-0004", "Point 2", 5] },
                { names: ["ADBE 4ColorGradient-0006", "Point 3", 7] },
                { names: ["ADBE 4ColorGradient-0008", "Point 4", 9] }
            ];
            var kDur = Math.min(dDr, dur);
            for (var pi = 0; pi < 4; pi++) {
                var ptProp = findProp(fx4, ptDefs[pi].names);
                if (ptProp) {
                    try {
                        var s = ptStarts[pi];
                        var dl = ptDeltas[pi];
                        ptProp.setValueAtTime(0, [s[0], s[1]]);
                        ptProp.setValueAtTime(kDur, [s[0] + dl[0], s[1] + dl[1]]);
                        setEase(ptProp);
                    } catch (e2) {
                        warnings.push("Point " + (pi + 1) + ": " + e2.message);
                    }
                } else {
                    warnings.push("Point " + (pi + 1) + " was not found.");
                }
            }

            if (!applyTrackMatte(solid, origLayer, TrackMatteType.ALPHA)) {
                warnings.push("Track matte could not be applied automatically.");
            }

            try {
                var posGroup = findProp(solid, ["ADBE Transform Group", "Transform"]);
                var posProp = findProp(posGroup, ["ADBE Position", "Position"]);
                var pv = posProp.value;
                posProp.setValueAtTime(0, [pv[0], pv[1]]);
                posProp.setValueAtTime(dur, [pv[0], pv[1] - vDr]);
                setEase(posProp);
            } catch (e3) {
                warnings.push("Position drift: " + e3.message);
            }

            var levFx = addEffect(solid, ["ADBE Easy Levels2", "Levels"]);
            if (levFx) {
                if (!setProp(levFx, ["ADBE Lev-outb", "Output Black", 6], bLf / 255)) {
                    warnings.push("Levels Output Black was not set automatically.");
                }
            } else {
                warnings.push("Levels effect not added.");
            }

            var indices = [origLayer.index, solid.index, baseLayer.index];
            indices.sort(function (a, b) { return a - b; });
            comp.layers.precompose(indices, "SKY_TEXT_EFFECT", true);

            var result = "Done! SKY_TEXT_EFFECT added to timeline.";
            if (warnings.length > 0) {
                result += " (" + warnings.length + " warning" + (warnings.length > 1 ? "s" : "") + " - see console)";
                for (var wi = 0; wi < warnings.length; wi++) {
                    $.writeln("Sky Text Effect warning: " + warnings[wi]);
                }
            }
            return result;
        } catch (err) {
            $.writeln("Sky Text Effect ERROR: " + err.toString());
            throw err;
        } finally {
            app.endUndoGroup();
        }
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel)
            ? thisObj
            : new Window("palette", "Sky Text Effect", undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.margins = [12, 12, 12, 12];
        win.spacing = 8;

        var titleLbl = win.add("statictext", undefined, "SKY TEXT EFFECT");
        titleLbl.alignment = ["center", "top"];

        function makeColorRow(parent, labelStr, defaultHex, hintStr) {
            var row = parent.add("group");
            row.orientation = "row";
            row.alignChildren = ["left", "center"];
            row.spacing = 4;

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

        function makeSliderRow(parent, labelStr, defVal, minVal, maxVal, unitsStr) {
            var row = parent.add("group");
            row.orientation = "row";
            row.alignment = ["fill", "top"];
            row.alignChildren = ["left", "center"];
            row.spacing = 6;

            var lbl = row.add("statictext", undefined, labelStr);
            lbl.preferredSize = [108, -1];

            var sldr = row.add("slider", undefined, defVal, minVal, maxVal);
            sldr.alignment = ["fill", "center"];
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
                if (!isNaN(n)) {
                    sldr.value = Math.min(maxVal, Math.max(minVal, n));
                }
            };

            return { field: field, slider: sldr };
        }

        var colPanel = win.add("panel", undefined, "Colours");
        colPanel.orientation = "column";
        colPanel.alignChildren = ["fill", "top"];
        colPanel.margins = [10, 14, 10, 10];
        colPanel.spacing = 5;

        var f_c1 = makeColorRow(colPanel, "Corner 1 (NW)", DEFAULTS.c1, "deep sky blue");
        var f_c2 = makeColorRow(colPanel, "Corner 2 (NE)", DEFAULTS.c2, "dusty rose");
        var f_c3 = makeColorRow(colPanel, "Corner 3 (SW)", DEFAULTS.c3, "amber orange");
        var f_c4 = makeColorRow(colPanel, "Corner 4 (SE)", DEFAULTS.c4, "deep violet");

        var setPanel = win.add("panel", undefined, "Settings");
        setPanel.orientation = "column";
        setPanel.alignChildren = ["fill", "top"];
        setPanel.margins = [10, 14, 10, 10];
        setPanel.spacing = 6;

        var r_opa = makeSliderRow(setPanel, "Base fill opacity", DEFAULTS.opacity, 0, 100, "%");
        var r_dDr = makeSliderRow(setPanel, "Gradient drift", DEFAULTS.driftDur, 1, 30, "s");
        var r_dPc = makeSliderRow(setPanel, "Drift amount", DEFAULTS.driftPct, 0, 20, "%");
        var r_vDr = makeSliderRow(setPanel, "Vertical drift", DEFAULTS.vertDrift, 0, 100, "px");
        var r_bLf = makeSliderRow(setPanel, "Black-point lift", DEFAULTS.blackLift, 0, 100, "/255");
        var r_ins = makeSliderRow(setPanel, "Corner inset", DEFAULTS.inset, 1, 49, "%");

        var btnGroup = win.add("group");
        btnGroup.orientation = "row";
        btnGroup.alignment = ["fill", "top"];
        btnGroup.alignChildren = ["fill", "center"];
        btnGroup.spacing = 6;
        btnGroup.margins = [0, 4, 0, 0];

        var testBtn = btnGroup.add("button", undefined, "Test");
        testBtn.preferredSize = [50, 26];

        var resetBtn = btnGroup.add("button", undefined, "Reset");
        resetBtn.preferredSize = [60, 26];

        var applyBtn = btnGroup.add("button", undefined, "Apply Effect");
        applyBtn.preferredSize = [-1, 26];

        var statusBar = win.add("statictext", undefined, "Select a text layer, then click Apply.");
        statusBar.alignment = ["fill", "bottom"];
        statusBar.preferredSize = [-1, 28];

        function setStatus(msg) {
            statusBar.text = msg;
            win.update();
        }

        testBtn.onClick = function () {
            $.writeln("Sky Text Effect: TEST button clicked");
            alert("Test button clicked");
            setStatus("Test click received.");
        };

        resetBtn.onClick = function () {
            f_c1.text = DEFAULTS.c1;
            f_c2.text = DEFAULTS.c2;
            f_c3.text = DEFAULTS.c3;
            f_c4.text = DEFAULTS.c4;
            r_opa.field.text = String(DEFAULTS.opacity); r_opa.slider.value = DEFAULTS.opacity;
            r_dDr.field.text = String(DEFAULTS.driftDur); r_dDr.slider.value = DEFAULTS.driftDur;
            r_dPc.field.text = String(DEFAULTS.driftPct); r_dPc.slider.value = DEFAULTS.driftPct;
            r_vDr.field.text = String(DEFAULTS.vertDrift); r_vDr.slider.value = DEFAULTS.vertDrift;
            r_bLf.field.text = String(DEFAULTS.blackLift); r_bLf.slider.value = DEFAULTS.blackLift;
            r_ins.field.text = String(DEFAULTS.inset); r_ins.slider.value = DEFAULTS.inset;
            setStatus("Reset to defaults.");
        };

        applyBtn.onClick = function () {
            $.writeln("Sky Text Effect: APPLY button clicked");
            alert("Apply button clicked");
            setStatus("Running...");
            try {
                var result = applyEffect({
                    c1: f_c1.text,
                    c2: f_c2.text,
                    c3: f_c3.text,
                    c4: f_c4.text,
                    opacity: r_opa.field.text,
                    driftDur: r_dDr.field.text,
                    driftPct: r_dPc.field.text,
                    vertDrift: r_vDr.field.text,
                    blackLift: r_bLf.field.text,
                    inset: r_ins.field.text
                });
                setStatus(result);
            } catch (e) {
                setStatus("ERROR: " + e.message);
            }
        };

        return win;
    }

    var panel = buildUI(thisObj);
    if (panel instanceof Window) {
        panel.center();
        panel.show();
    } else {
        panel.layout.layout(true);
    }

})(this);
