#target aftereffects
#targetengine "sky_text_effect"

(function (thisObj) {
    var DEFAULTS = {
        c1: "2E4A7A",
        c2: "C06C84",
        c3: "FF8C42",
        c4: "1A0A2E",
        opacity: 55,
        driftDur: 10,
        driftPct: 8,
        vertDrift: 70,
        glow: 35,
        blur: 20
    };

    function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

    function normalizeHex(v) {
        var s = (v || "").replace(/^#/, "").replace(/\s+/g, "");
        return /^[0-9A-Fa-f]{6}$/.test(s) ? s.toUpperCase() : null;
    }

    function hexToRgb01(hex) {
        var h = normalizeHex(hex);
        return [
            parseInt(h.substr(0, 2), 16) / 255,
            parseInt(h.substr(2, 2), 16) / 255,
            parseInt(h.substr(4, 2), 16) / 255
        ];
    }

    function intToHex(rgbInt) {
        var n = rgbInt >>> 0;
        var r = (n >> 16) & 255;
        var g = (n >> 8) & 255;
        var b = n & 255;
        function h2(x) { var s = x.toString(16).toUpperCase(); return s.length < 2 ? "0" + s : s; }
        return h2(r) + h2(g) + h2(b);
    }

    function pickColor(currentHex) {
        var start = parseInt(normalizeHex(currentHex) || "FFFFFF", 16);
        var picked = $.colorPicker(start);
        if (picked < 0) { return null; }
        return intToHex(picked);
    }

    function getActiveComp() {
        if (!app.project) { return null; }
        var ai = app.project.activeItem;
        if (ai && ai instanceof CompItem) { return ai; }
        return null;
    }

    function findTextLayer(comp) {
        if (!comp) { return null; }
        if (comp.selectedLayers && comp.selectedLayers.length > 0) {
            var s = comp.selectedLayers[0];
            try { if (s.matchName === "ADBE Text Layer") { return s; } } catch (e) {}
        }
        for (var i = 1; i <= comp.layers.length; i++) {
            var l = comp.layers[i];
            try { if (l.matchName === "ADBE Text Layer") { return l; } } catch (e2) {}
        }
        return null;
    }

    function addEffect(layer, names) {
        var fx = null;
        try { fx = layer.property("ADBE Effect Parade"); } catch (e) {}
        if (!fx) { try { fx = layer.property("Effects"); } catch (e2) {} }
        if (!fx) { return null; }
        for (var i = 0; i < names.length; i++) {
            try { return fx.addProperty(names[i]); } catch (e3) {}
        }
        return null;
    }

    function setTrackMatte(layer, matteLayer) {
        try {
            if (typeof layer.setTrackMatte === "function") {
                layer.setTrackMatte(matteLayer, TrackMatteType.ALPHA);
                return true;
            }
        } catch (e) {}
        try { layer.trackMatteType = TrackMatteType.ALPHA; return true; } catch (e2) {}
        return false;
    }

    function safeSet(prop, value, warnings, label) {
        try { prop.setValue(value); return true; }
        catch (e) { warnings.push(label + " failed"); return false; }
    }

    function applySkyEffect(opts) {
        var comp = getActiveComp();
        if (!comp) { throw new Error("Open an active comp first."); }

        var textLayer = findTextLayer(comp);
        if (!textLayer) { throw new Error("No text layer found. Add/select a text layer."); }

        var c1 = normalizeHex(opts.c1), c2 = normalizeHex(opts.c2), c3 = normalizeHex(opts.c3), c4 = normalizeHex(opts.c4);
        if (!c1 || !c2 || !c3 || !c4) { throw new Error("Each color must be a 6-digit hex value."); }

        var opacity = clamp(parseFloat(opts.opacity), 0, 100); if (isNaN(opacity)) { opacity = DEFAULTS.opacity; }
        var driftDur = clamp(parseFloat(opts.driftDur), 1, 40); if (isNaN(driftDur)) { driftDur = DEFAULTS.driftDur; }
        var driftPct = clamp(parseFloat(opts.driftPct), 0, 25); if (isNaN(driftPct)) { driftPct = DEFAULTS.driftPct; }
        var vertDrift = clamp(parseFloat(opts.vertDrift), 0, 500); if (isNaN(vertDrift)) { vertDrift = DEFAULTS.vertDrift; }
        var glowAmt = clamp(parseFloat(opts.glow), 0, 100); if (isNaN(glowAmt)) { glowAmt = DEFAULTS.glow; }
        var blurAmt = clamp(parseFloat(opts.blur), 0, 100); if (isNaN(blurAmt)) { blurAmt = DEFAULTS.blur; }

        app.beginUndoGroup("Sky Text Effect");
        try {
            var w = comp.width;
            var h = comp.height;
            var d = comp.duration;
            var warnings = [];

            var base = textLayer.duplicate();
            base.name = textLayer.name + "_BASE";
            try { base.property("Transform").property("Opacity").setValue(opacity); } catch (e0) {}

            var sky = comp.layers.addSolid([1, 1, 1], "SKY_GRADIENT", w, h, 1, d);
            sky.moveAfter(textLayer);

            var grad = addEffect(sky, ["ADBE 4ColorGradient", "4-Color Gradient"]);
            if (!grad) { throw new Error("Could not add 4-Color Gradient effect."); }

            safeSet(grad.property(1), hexToRgb01(c1), warnings, "Color 1");
            safeSet(grad.property(3), hexToRgb01(c2), warnings, "Color 2");
            safeSet(grad.property(5), hexToRgb01(c3), warnings, "Color 3");
            safeSet(grad.property(7), hexToRgb01(c4), warnings, "Color 4");

            var p1 = grad.property(2), p2 = grad.property(4), p3 = grad.property(6), p4 = grad.property(8);
            var start = [[0, 0], [w, 0], [0, h], [w, h]];
            var dv = Math.min(w, h) * (driftPct / 100);
            var delta = [[dv, dv * 0.4], [-dv * 0.6, dv * 0.7], [dv * 0.5, -dv * 0.5], [-dv * 0.7, -dv * 0.6]];

            var keyT = Math.min(driftDur, d);
            var props = [p1, p2, p3, p4];
            for (var i = 0; i < 4; i++) {
                try {
                    props[i].setValueAtTime(0, start[i]);
                    props[i].setValueAtTime(keyT, [start[i][0] + delta[i][0], start[i][1] + delta[i][1]]);
                } catch (e1) { warnings.push("Point " + (i + 1) + " animation failed"); }
            }

            var pos = sky.property("Transform").property("Position");
            var pv = pos.value;
            pos.setValueAtTime(0, [pv[0], pv[1]]);
            pos.setValueAtTime(d, [pv[0], pv[1] - vertDrift]);

            var glow = addEffect(sky, ["ADBE Glo2", "Glow"]);
            if (glow) {
                try { glow.property(6).setValue(glowAmt); } catch (e2) {}
                try { glow.property(4).setValue(0.7); } catch (e3) {}
            }

            var blur = addEffect(sky, ["ADBE Box Blur2", "ADBE Gaussian Blur 2", "Fast Box Blur", "Gaussian Blur"]);
            if (blur) {
                try { blur.property(1).setValue(blurAmt); } catch (e4) {}
            }

            setTrackMatte(sky, textLayer);

            var ids = [textLayer.index, sky.index, base.index];
            ids.sort(function (a, b) { return a - b; });
            comp.layers.precompose(ids, "SKY_TEXT_EFFECT", true);

            if (warnings.length > 0) {
                return "Done with " + warnings.length + " warning(s).";
            }
            return "Done! SKY_TEXT_EFFECT created with animation.";
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
        win.margins = 12;
        win.spacing = 8;

        win.add("statictext", undefined, "SKY TEXT EFFECT");

        var colors = win.add("panel", undefined, "Colours");
        colors.orientation = "column";
        colors.alignChildren = ["fill", "top"];

        function colorRow(label, defaultHex) {
            var g = colors.add("group");
            g.orientation = "row";
            g.add("statictext", undefined, label).preferredSize = [95, -1];
            g.add("statictext", undefined, "#");
            var input = g.add("edittext", undefined, defaultHex);
            input.preferredSize = [75, -1];
            var pick = g.add("button", undefined, "Pick");
            pick.preferredSize = [46, -1];
            pick.onClick = function () {
                var next = pickColor(input.text);
                if (next) { input.text = next; }
            };
            return input;
        }

        var c1 = colorRow("Corner 1", DEFAULTS.c1);
        var c2 = colorRow("Corner 2", DEFAULTS.c2);
        var c3 = colorRow("Corner 3", DEFAULTS.c3);
        var c4 = colorRow("Corner 4", DEFAULTS.c4);

        var settings = win.add("panel", undefined, "Animation");
        settings.orientation = "column";
        settings.alignChildren = ["fill", "top"];

        function sliderRow(label, def, min, max, unit) {
            var g = settings.add("group");
            g.orientation = "row";
            g.add("statictext", undefined, label).preferredSize = [120, -1];
            var s = g.add("slider", undefined, def, min, max);
            s.preferredSize = [140, 16];
            var e = g.add("edittext", undefined, String(def));
            e.preferredSize = [45, -1];
            g.add("statictext", undefined, unit || "");
            s.onChanging = function () { e.text = String(Math.round(s.value)); };
            e.onChange = function () {
                var n = parseFloat(e.text);
                if (!isNaN(n)) {
                    n = clamp(n, min, max);
                    s.value = n;
                    e.text = String(Math.round(n));
                }
            };
            return { slider: s, field: e };
        }

        var opacity = sliderRow("Base opacity", DEFAULTS.opacity, 0, 100, "%");
        var driftDur = sliderRow("Drift duration", DEFAULTS.driftDur, 1, 40, "s");
        var driftPct = sliderRow("Drift amount", DEFAULTS.driftPct, 0, 25, "%");
        var vertDrift = sliderRow("Vertical drift", DEFAULTS.vertDrift, 0, 500, "px");
        var glow = sliderRow("Glow", DEFAULTS.glow, 0, 100, "%");
        var blur = sliderRow("Soft blur", DEFAULTS.blur, 0, 100, "px");

        var buttons = win.add("group");
        buttons.orientation = "row";
        var resetBtn = buttons.add("button", undefined, "Reset");
        var applyBtn = buttons.add("button", undefined, "Apply Effect");

        var status = win.add("statictext", undefined, "Ready.");
        function setStatus(msg) { status.text = msg; win.update(); }

        function resetRow(r, v) { r.slider.value = v; r.field.text = String(v); }

        resetBtn.onClick = function () {
            c1.text = DEFAULTS.c1; c2.text = DEFAULTS.c2; c3.text = DEFAULTS.c3; c4.text = DEFAULTS.c4;
            resetRow(opacity, DEFAULTS.opacity);
            resetRow(driftDur, DEFAULTS.driftDur);
            resetRow(driftPct, DEFAULTS.driftPct);
            resetRow(vertDrift, DEFAULTS.vertDrift);
            resetRow(glow, DEFAULTS.glow);
            resetRow(blur, DEFAULTS.blur);
            setStatus("Reset.");
        };

        applyBtn.onClick = function () {
            setStatus("Running...");
            try {
                var msg = applySkyEffect({
                    c1: c1.text,
                    c2: c2.text,
                    c3: c3.text,
                    c4: c4.text,
                    opacity: opacity.field.text,
                    driftDur: driftDur.field.text,
                    driftPct: driftPct.field.text,
                    vertDrift: vertDrift.field.text,
                    glow: glow.field.text,
                    blur: blur.field.text
                });
                setStatus(msg);
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
