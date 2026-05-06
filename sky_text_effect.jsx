/**
 * sky_text_effect.jsx  -  "Sky Inside Letters"
 * ─────────────────────────────────────────────────────────────────────────────
 * Adobe After Effects ExtendScript plugin
 *
 * USAGE
 *   File > Scripts > Run Script File...
 *   Save to [AE]/Scripts/ to access from the Scripts menu.
 *   Save to [AE]/Scripts/ScriptUI Panels/ for panel-menu access.
 *
 * HOW TO USE
 *   1. Open your composition in After Effects.
 *   2. Select exactly one text layer in the Timeline.
 *   3. Run this script.
 *   4. A "SKY_TEXT_EFFECT" pre-comp is built containing all generated layers.
 *
 * WHAT IS BUILT (inside the SKY_TEXT_EFFECT pre-comp)
 *   (bottom) <name>_BASE    - 60 % opacity duplicate of the text layer.
 *            SKY_GRADIENT   - full-comp solid with a 4-Color Gradient, clipped
 *                             to letterform shapes via Alpha Matte.
 *            <origLayer>    - original text layer (acts as the Alpha Matte).
 *
 * NOTES
 *   - Non-fatal property failures are listed in the completion dialog so you
 *     can see exactly what succeeded and what needs manual tweaking.
 *   - Levels is used for the black-point lift because the Curves effect's
 *     internal curve-data format cannot be reliably written via ExtendScript
 *     across all AE versions. The visual result is identical.
 *
 * UNDO
 *   Edit > Undo Sky Text Effect  (single undo step).
 *
 * REQUIREMENTS
 *   Adobe After Effects CC 2014 (13.0) or later.
 *   Built-in "4-Color Gradient" effect (Effect > Generate).
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function skyTextEffect() {

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

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

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Convert a 6-char hex string (no "#") to an AE [r,g,b,a] colour array
     * with values in the 0–1 range.
     */
    function hexToAE(hex) {
        return [
            parseInt(hex.substr(0, 2), 16) / 255,
            parseInt(hex.substr(2, 2), 16) / 255,
            parseInt(hex.substr(4, 2), 16) / 255,
            1
        ];
    }

    /**
     * Find a property on `parent` by trying each entry in `options` in order.
     * Each entry can be a string (match-name or display-name) or a number (index).
     * Returns the first Property found, or null if none succeed.
     */
    function findProp(parent, options) {
        for (var i = 0; i < options.length; i++) {
            try {
                var p = parent.property(options[i]);
                if (p) { return p; }
            } catch (e) {}
        }
        return null;
    }

    /**
     * Add an effect to `layer` by trying each name in `nameOptions`.
     * Tries both "ADBE Effect Parade" and "Effects" as the parent group.
     * Returns the new effect PropertyGroup, or null on total failure.
     */
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

    /**
     * Find a property on `parent` using `options` and set its value.
     * Returns true on success, false if the property was not found or setValue failed.
     */
    function setProp(parent, options, value) {
        var p = findProp(parent, options);
        if (!p) { return false; }
        try { p.setValue(value); return true; } catch (e) { return false; }
    }

    /**
     * Apply Easy Ease (velocity 0, influence 33.33 %) to every keyframe of
     * `prop`.  Handles both scalar and multi-dimensional properties.
     * Silently ignores spatial-only properties that don't support temporal easing.
     */
    function easyEaseAll(prop) {
        var n = prop.numKeys;
        if (n < 1) { return; }

        var dims = 1;
        try {
            var v = prop.value;
            if (v && typeof v.length === "number" && v.length > 1) {
                dims = v.length;
            }
        } catch (e) {}

        var ei = new KeyframeEase(0, 33.33);
        var eo = new KeyframeEase(0, 33.33);
        var inArr  = [];
        var outArr = [];
        for (var d = 0; d < dims; d++) { inArr.push(ei); outArr.push(eo); }

        for (var k = 1; k <= n; k++) {
            try { prop.setTemporalEasingAtKey(k, inArr, outArr); } catch (e) {}
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BUILD EFFECT
    // ─────────────────────────────────────────────────────────────────────────

    app.beginUndoGroup("Sky Text Effect");

    try {
        var W        = comp.width;
        var H        = comp.height;
        var dur      = comp.duration;
        var origName = origLayer.name;
        var warnings = []; // non-fatal issues reported at the end

        // ── ① Base fill ──────────────────────────────────────────────────────
        // Duplicate the text layer → rename → push to bottom → 60 % opacity.
        // Keeps letterforms readable when the sky gradient is very dark.

        var baseLayer = origLayer.duplicate();
        baseLayer.name = origName + "_BASE";
        baseLayer.moveToEnd();
        if (!setProp(baseLayer, ["Transform/Opacity", "Opacity", "ADBE Opacity"], 60)) {
            // Belt-and-suspenders: set via the Transform group path
            try {
                baseLayer.property("Transform").property("Opacity").setValue(60);
            } catch (e) {
                warnings.push("Base layer opacity: " + e.message);
            }
        }

        // ── ② SKY_GRADIENT solid ─────────────────────────────────────────────
        // White solid, same size as the comp. The gradient effect paints over it.

        var solid = comp.layers.addSolid([1, 1, 1], "SKY_GRADIENT", W, H, 1, dur);

        // Place solid directly BELOW the original text layer.
        // AE track-matte rule: the matte layer must be immediately ABOVE the
        // matted layer.  After this call origLayer is at (solid.index - 1).
        solid.moveAfter(origLayer);

        // ── ③ 4-Color Gradient effect ────────────────────────────────────────

        var fx4 = addFx(solid, ["ADBE 4-Color Gradient", "4-Color Gradient"]);
        if (!fx4) {
            throw new Error(
                "Could not add the 4-Color Gradient effect.\n" +
                "Verify it is available: Effect > Generate > 4-Color Gradient."
            );
        }

        // ─ Static colours ─
        // Each colour is tried by match-name, display-name, then property index.
        // Indices in the 4-Color Gradient effect: c1=4, c2=6, c3=8, c4=10
        // (odd indices 3,5,7,9 are the paired position/point properties).

        var colDefs = [
            { opts: ["ADBE 4col-c1", "Color 1", 4],  val: hexToAE("2E4A7A") }, // deep sky blue
            { opts: ["ADBE 4col-c2", "Color 2", 6],  val: hexToAE("C06C84") }, // dusty rose
            { opts: ["ADBE 4col-c3", "Color 3", 8],  val: hexToAE("FF8C42") }, // amber orange
            { opts: ["ADBE 4col-c4", "Color 4", 10], val: hexToAE("1A0A2E") }  // deep violet
        ];
        for (var ci = 0; ci < colDefs.length; ci++) {
            if (!setProp(fx4, colDefs[ci].opts, colDefs[ci].val)) {
                warnings.push("Color " + (ci + 1) + " could not be set on the gradient.");
            }
        }

        // ─ Animated colour-point positions ─
        // Each colour has an associated 2-D point in comp space.  Drifting
        // these points slowly creates the living-sky feel.

        var ix = W * 0.15;
        var iy = H * 0.15;

        // Starting positions — each corner inset ~15 % from the edge.
        var ptStarts = [
            [ix,     iy    ],   // top-left
            [W - ix, iy    ],   // top-right
            [ix,     H - iy],   // bottom-left
            [W - ix, H - iy]    // bottom-right
        ];

        // Each corner drifts in a distinct direction; ~6 % of shorter dimension.
        var dv = Math.min(W, H) * 0.06;
        var ptDeltas = [
            [ dv,        dv * 0.40],   // top-left   → right & gently down
            [-dv * 0.70, dv * 0.60],   // top-right  → left  & gently down
            [ dv * 0.50,-dv * 0.50],   // bottom-left  → right & gently up
            [-dv * 0.60,-dv * 0.70]    // bottom-right → left  & gently up
        ];

        // Point property lookup: match-name, display-name, then index fallback.
        // Indices in the effect: p1=3, p2=5, p3=7, p4=9
        var ptDefs = [
            { opts: ["ADBE 4col-p1", "Point 1", 3] },
            { opts: ["ADBE 4col-p2", "Point 2", 5] },
            { opts: ["ADBE 4col-p3", "Point 3", 7] },
            { opts: ["ADBE 4col-p4", "Point 4", 9] }
        ];

        // Drift plays over 10 s, capped at the comp duration.
        var kDur = Math.min(10, dur);

        for (var pi = 0; pi < 4; pi++) {
            var ptProp = findProp(fx4, ptDefs[pi].opts);
            if (ptProp) {
                try {
                    var s   = ptStarts[pi];
                    var dlt = ptDeltas[pi];
                    ptProp.setValueAtTime(0,    [s[0],          s[1]         ]);
                    ptProp.setValueAtTime(kDur, [s[0] + dlt[0], s[1] + dlt[1]]);
                    easyEaseAll(ptProp);
                } catch (e) {
                    warnings.push("Point " + (pi + 1) + " keyframes failed: " + e.message);
                }
            } else {
                warnings.push("Could not find Point " + (pi + 1) + " on the gradient effect.");
            }
        }

        // ── ④ Alpha Matte ────────────────────────────────────────────────────
        // origLayer is directly above solid in the stack (see moveAfter above).
        // ALPHA matte: AE uses the alpha channel of the layer immediately above
        // solid (origLayer) as a mask — gradient only shows inside letterforms.
        // AE will automatically hide the matte layer's eye icon.

        solid.trackMatteType = TrackMatteType.ALPHA;

        // ── ⑤ Vertical position drift ────────────────────────────────────────
        // Solid drifts upward 20 px over the entire comp duration.
        // Easy Ease on both keyframes gives gentle acceleration/deceleration.

        try {
            var posProp = solid.property("Transform").property("Position");
            var posVal  = posProp.value;
            var posX    = posVal[0]; // comp centre X
            var posY    = posVal[1]; // comp centre Y

            posProp.setValueAtTime(0,   [posX, posY     ]);
            posProp.setValueAtTime(dur, [posX, posY - 20]);
            easyEaseAll(posProp);
        } catch (e) {
            warnings.push("Position drift could not be applied: " + e.message);
        }

        // ── ⑥ Black-point lift ───────────────────────────────────────────────
        // Levels Output Black = 20/255 ≈ 0.078 — same visual result as a Curves
        // node mapping input 0 to output 20.  No pure black inside letterforms.
        //
        // AE stores Levels values in the 0–1 normalised range internally.
        // The Curves effect is NOT used here because its CurveData internal
        // format is not reliably writable via ExtendScript across AE versions.

        var levFx = addFx(solid, ["ADBE Levels", "Levels"]);
        if (levFx) {
            // Try match-name → display-name → index 6 (Output Black position)
            if (!setProp(levFx, ["ADBE Lev-outb", "Output Black", 6], 20 / 255)) {
                warnings.push("Levels Output Black could not be set. " +
                              "Set it manually: Output Black = 20 (or 0.078).");
            }
        } else {
            warnings.push("Could not add Levels effect. " +
                          "Add it manually and set Output Black to 20.");
        }

        // ── ⑦ Pre-compose ────────────────────────────────────────────────────
        // Collect live indices (they update as layers are moved) and sort
        // ascending as required by precompose.
        // moveAllAttributes = true keeps all keyframes, effects, and the
        // track-matte relationship inside the new pre-comp.

        var indices = [origLayer.index, solid.index, baseLayer.index];
        indices.sort(function (a, b) { return a - b; });
        comp.layers.precompose(indices, "SKY_TEXT_EFFECT", true);

        // ── Done ─────────────────────────────────────────────────────────────

        var msg = "Sky Text Effect applied!\n\n" +
                  "Layer structure inside SKY_TEXT_EFFECT (top to bottom):\n" +
                  "  " + origName + "  ← Alpha Matte (text shape)\n" +
                  "  SKY_GRADIENT        ← Gradient solid (matted + animated)\n" +
                  "  " + origName + "_BASE  ← 60 % opacity base fill";

        if (warnings.length > 0) {
            msg += "\n\nWarnings (check these manually):\n• " +
                   warnings.join("\n• ");
        }
        alert(msg);

    } catch (err) {
        alert(
            "Sky Text Effect failed:\n\n" + err.toString() +
            (err.line !== undefined ? "\nLine: " + err.line : "")
        );
    } finally {
        app.endUndoGroup();
    }

})();
