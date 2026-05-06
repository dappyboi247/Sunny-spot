#target aftereffects
#targetengine "sky_text_effect"

(function (thisObj) {
    var DEFAULTS = {
        c1: "2E4A7A",
        c2: "C06C84",
        c3: "FF8C42",
        c4: "1A0A2E",
        opacity: 60
    };

    function hexToRgb01(hex) {
        var s = (hex || "").replace(/^#/, "").replace(/\s+/g, "");
        return [
            parseInt(s.substr(0, 2), 16) / 255,
            parseInt(s.substr(2, 2), 16) / 255,
            parseInt(s.substr(4, 2), 16) / 255
        ];
    }

    function validHex(value) {
        var s = (value || "").replace(/^#/, "").replace(/\s+/g, "");
        return /^[0-9A-Fa-f]{6}$/.test(s) ? s : null;
    }

    function findComp() {
        var a = app.project ? app.project.activeItem : null;
        if (a && a instanceof CompItem) { return a; }
        if (!app.project) { return null; }
        for (var i = 1; i <= app.project.numItems; i++) {
            if (app.project.items[i] instanceof CompItem) { return app.project.items[i]; }
        }
        return null;
    }

    function getSelectedTextLayer(comp) {
        if (!comp || comp.selectedLayers.length < 1) { return null; }
        var l = comp.selectedLayers[0];
        try {
            if (l.matchName === "ADBE Text Layer") { return l; }
        } catch (e) {}
        return null;
    }

    function addFx(layer, names) {
        var fx = null;
        try { fx = layer.property("ADBE Effect Parade"); } catch (e) {}
        if (!fx) { try { fx = layer.property("Effects"); } catch (e2) {} }
        if (!fx) { return null; }
        for (var i = 0; i < names.length; i++) {
            try { return fx.addProperty(names[i]); } catch (e3) {}
        }
        return null;
    }

    function setTrackMatteSafe(layer, matteLayer) {
        try {
            if (typeof layer.setTrackMatte === "function") {
                layer.setTrackMatte(matteLayer, TrackMatteType.ALPHA);
                return;
            }
        } catch (e) {}
        try { layer.trackMatteType = TrackMatteType.ALPHA; } catch (e2) {}
    }

    function buildEffect(params) {
        if (!app.project) { throw new Error("No project open."); }
        var comp = findComp();
        if (!comp) { throw new Error("No composition open."); }

        var textLayer = getSelectedTextLayer(comp);
        if (!textLayer) { throw new Error("Select one text layer in the active comp."); }

        var c1 = validHex(params.c1);
        var c2 = validHex(params.c2);
        var c3 = validHex(params.c3);
        var c4 = validHex(params.c4);
        if (!c1 || !c2 || !c3 || !c4) { throw new Error("Colors must be 6-digit hex."); }

        var opacity = parseFloat(params.opacity);
        if (isNaN(opacity)) { opacity = DEFAULTS.opacity; }
        opacity = Math.max(0, Math.min(100, opacity));

        app.beginUndoGroup("Sky Text Effect");
        try {
            var w = comp.width;
            var h = comp.height;
            var d = comp.duration;

            var base = textLayer.duplicate();
            base.name = textLayer.name + "_BASE";
            try { base.property("Transform").property("Opacity").setValue(opacity); } catch (e0) {}

            var sky = comp.layers.addSolid([1, 1, 1], "SKY_GRADIENT", w, h, 1, d);
            sky.moveAfter(textLayer);

            var g = addFx(sky, ["ADBE 4ColorGradient", "4-Color Gradient"]);
            if (g) {
                try { g.property(1).setValue(hexToRgb01(c1).concat([1])); } catch (e1) {}
                try { g.property(3).setValue(hexToRgb01(c2).concat([1])); } catch (e2) {}
                try { g.property(5).setValue(hexToRgb01(c3).concat([1])); } catch (e3) {}
                try { g.property(7).setValue(hexToRgb01(c4).concat([1])); } catch (e4) {}
                try { g.property(2).setValue([0, 0]); } catch (e5) {}
                try { g.property(4).setValue([w, 0]); } catch (e6) {}
                try { g.property(6).setValue([0, h]); } catch (e7) {}
                try { g.property(8).setValue([w, h]); } catch (e8) {}
            }

            setTrackMatteSafe(sky, textLayer);

            var ids = [textLayer.index, sky.index, base.index];
            ids.sort(function (a, b) { return a - b; });
            try {
                comp.layers.precompose(ids, "SKY_TEXT_EFFECT", true);
            } catch (e9) {
                var nullLayer = comp.layers.addNull();
                nullLayer.name = "SKY_TEXT_EFFECT_FALLBACK";
            }

            return "Done! Effect created.";
        } finally {
            app.endUndoGroup();
        }
    }

    function buildUI(thisObj) {
        var win = (thisObj instanceof Panel) ? thisObj : new Window("palette", "sky_text_effect", undefined, { resizeable: true });

        win.orientation = "column";
        win.alignChildren = ["fill", "top"];
        win.margins = 12;
        win.spacing = 8;

        win.add("statictext", undefined, "SKY TEXT EFFECT");

        var p = win.add("panel", undefined, "Colours");
        p.orientation = "column";
        p.alignChildren = ["fill", "top"];

        function row(label, val) {
            var g = p.add("group");
            g.orientation = "row";
            g.add("statictext", undefined, label).preferredSize = [100, -1];
            g.add("statictext", undefined, "#");
            var e = g.add("edittext", undefined, val);
            e.preferredSize = [80, -1];
            return e;
        }

        var c1 = row("Corner 1", DEFAULTS.c1);
        var c2 = row("Corner 2", DEFAULTS.c2);
        var c3 = row("Corner 3", DEFAULTS.c3);
        var c4 = row("Corner 4", DEFAULTS.c4);

        var s = win.add("group");
        s.add("statictext", undefined, "Opacity %");
        var op = s.add("edittext", undefined, String(DEFAULTS.opacity));
        op.preferredSize = [50, -1];

        var buttons = win.add("group");
        buttons.orientation = "row";
        var testBtn = buttons.add("button", undefined, "Test");
        var applyBtn = buttons.add("button", undefined, "Apply Effect");

        var status = win.add("statictext", undefined, "Ready.");

        function setStatus(msg) {
            status.text = msg;
            win.update();
        }

        testBtn.onClick = function () {
            setStatus("Test clicked.");
        };

        $.global.skyTextDoApply = function () {
            try {
                var result = buildEffect({
                    c1: c1.text,
                    c2: c2.text,
                    c3: c3.text,
                    c4: c4.text,
                    opacity: op.text
                });
                setStatus(result);
            } catch (e) {
                setStatus("ERROR: " + e.message);
            }
        };

        applyBtn.onClick = function () {
            setStatus("Running...");
            app.scheduleTask("$.global.skyTextDoApply()", 20, false);
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
