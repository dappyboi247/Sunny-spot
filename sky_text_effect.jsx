/**
 * sky_text_effect.jsx  -  "Sky Inside Letters"
 * ─────────────────────────────────────────────────────────────────────────────
 * Adobe After Effects ExtendScript plugin
 *
 * USAGE
 *   File > Scripts > Run Script File...
 *   Save to [AE]/Scripts/ to access from the Scripts menu.
 *   Save to [AE]/Scripts/ScriptUI Panels/ for panel-menu access.
 *   (The script executes directly; no dockable-panel UI wrapper is included.)
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
 *   Effects on SKY_GRADIENT:
 *   - 4-Color Gradient    : corner colours from deep blue → rose → amber → violet,
 *                           with each colour-point keyframed to drift over 10 s.
 *   - Position keyframes  : Y drifts up 20 px over the comp duration (Easy Ease).
 *   - Levels              : Output Black lifted to 20/255 ≈ 0.078, eliminating
 *                           pure black inside the letters for a luminous feel.
 *                           (This is the scriptable equivalent of a Curves node
 *                           with input 0 mapped to output 20; the Curves effect's
 *                           internal curve-data format is not reliably writable
 *                           via ExtendScript across all AE versions.)
 *
 * UNDO
 *   Edit > Undo Sky Text Effect  (single undo step).
 *
 * REQUIREMENTS
 *   Adobe After Effects CC 2014 (13.0) or later.
 *   Requires the built-in "4-Color Gradient" effect (Generate category).
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function skyTextEffect() {

    // ─────────────────────────────────────────────────────────────────────────
    // VALIDATION
    // ─────────────────────────────────────────────────────────────────────────

    var comp = app.project.activeItem;

    if (!comp || !(comp instanceof CompItem)) {
        alert("Sky Text Effect:\nPlease open a composition first.");
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
     * Convert a 6-character hex string (no "#") to an AE colour array [r,g,b,a]
     * with component values normalised to the 0–1 range.
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
     * Apply Easy Ease (velocity 0, influence 33.33 %) to every keyframe of a
     * Property.  Works for both scalar and multi-dimensional properties.
     * Silently skips spatial-only (non-temporal) properties.
     */
    function easyEaseAll(prop) {
        var n = prop.numKeys;
        if (n < 1) { return; }
        var ei   = new KeyframeEase(0, 33.33);
        var eo   = new KeyframeEase(0, 33.33);
        var dims = (prop.value instanceof Array) ? prop.value.length : 1;
        var inArr = [], outArr = [];
        for (var d = 0; d < dims; d++) { inArr.push(ei); outArr.push(eo); }
        for (var k = 1; k <= n; k++) {
            try { prop.setTemporalEasingAtKey(k, inArr, outArr); }
            catch (e) { /* spatial property — temporal easing not applicable */ }
        }
    }

    /**
     * Safely set a value on a sub-property identified by match-name or index.
     * Returns true on success, false on any error.
     */
    function trySet(parent, nameOrIdx, value) {
        try { parent.property(nameOrIdx).setValue(value); return true; }
        catch (e) { return false; }
    }

    /**
     * Safely retrieve a keyframeable Property by match-name, falling back to
     * a numeric index.  Returns null if neither lookup succeeds.
     */
    function getProp(parent, matchName, fallbackIdx) {
        var prop = null;
        try { prop = parent.property(matchName); } catch (e) {}
        if (!prop || !prop.canSetValueAtTime) {
            try { prop = parent.property(fallbackIdx); } catch (e) {}
        }
        return (prop && prop.canSetValueAtTime) ? prop : null;
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
        var FX       = "ADBE Effect Parade"; // match-name for the Effects group

        // ── ① Base fill ──────────────────────────────────────────────────────
        // Duplicate the text layer, push it to the bottom of the stack, and
        // lower its opacity to 60 %.  This keeps letterforms legible even when
        // the sky gradient is very dark.

        var baseLayer = origLayer.duplicate();
        baseLayer.name = origName + "_BASE";
        baseLayer.moveToEnd();
        baseLayer.property("Transform").property("Opacity").setValue(60);

        // ── ② SKY_GRADIENT solid ─────────────────────────────────────────────
        // A white solid that will be painted with the 4-Color Gradient below
        // and clipped to the letterform shapes via an Alpha Matte.

        var solid = comp.layers.addSolid([1, 1, 1], "SKY_GRADIENT", W, H, 1, dur);

        // Place solid directly BELOW the original text layer.
        // AE track-matte convention: the matte layer must be immediately ABOVE
        // the matted layer.  origLayer (text) will be the matte; solid is matted.
        solid.moveAfter(origLayer);

        // ── ③ 4-Color Gradient effect ────────────────────────────────────────

        var fx4 = solid.property(FX).addProperty("ADBE 4-Color Gradient");

        // ─ Static colours ─
        // Match-names: "ADBE 4col-c1" through "ADBE 4col-c4".
        // Fallback indices within the effect: 4, 6, 8, 10
        // (odd indices 3,5,7,9 are the paired position/point properties).

        var colMatchNames = ["ADBE 4col-c1", "ADBE 4col-c2",
                             "ADBE 4col-c3", "ADBE 4col-c4"];
        var colIndexes    = [4, 6, 8, 10];
        var colValues     = [
            hexToAE("2E4A7A"),  // deep sky blue   — top-left corner
            hexToAE("C06C84"),  // dusty rose       — top-right corner
            hexToAE("FF8C42"),  // amber orange     — bottom-left corner
            hexToAE("1A0A2E")   // deep violet      — bottom-right corner
        ];

        for (var ci = 0; ci < 4; ci++) {
            if (!trySet(fx4, colMatchNames[ci], colValues[ci])) {
                trySet(fx4, colIndexes[ci], colValues[ci]);
            }
        }

        // ─ Animated colour-point positions ─
        // Each colour has an associated 2-D "point" that controls where it is
        // centred in comp space.  Animating these positions produces the gentle
        // living-sky movement without an obviously mechanical feel.

        // Starting positions: each corner inset ~15 % from the respective edge.
        var ix = W * 0.15, iy = H * 0.15;
        var ptStart = [
            [ix,     iy    ],   // top-left
            [W - ix, iy    ],   // top-right
            [ix,     H - iy],   // bottom-left
            [W - ix, H - iy]    // bottom-right
        ];

        // Each corner drifts in a distinct direction; magnitude ≈ 6 % of the
        // shorter comp dimension — subtle enough not to read as animation.
        var dv = Math.min(W, H) * 0.06;
        var ptDelta = [
            [ dv,        dv * 0.40],   // top-left   → right & gently down
            [-dv * 0.70, dv * 0.60],   // top-right  → left  & gently down
            [ dv * 0.50,-dv * 0.50],   // bottom-left  → right & gently up
            [-dv * 0.60,-dv * 0.70]    // bottom-right → left  & gently up
        ];

        var ptMatchNames = ["ADBE 4col-p1", "ADBE 4col-p2",
                            "ADBE 4col-p3", "ADBE 4col-p4"];
        var ptIndexes    = [3, 5, 7, 9]; // fallback indices within fx4

        // Drift plays over 10 s, or the full comp duration if it is shorter.
        var kDur = Math.min(10, dur);

        for (var pi = 0; pi < 4; pi++) {
            var ptProp = getProp(fx4, ptMatchNames[pi], ptIndexes[pi]);
            if (ptProp) {
                var s   = ptStart[pi];
                var dlt = ptDelta[pi];
                ptProp.setValueAtTime(0,    [s[0],          s[1]         ]);
                ptProp.setValueAtTime(kDur, [s[0] + dlt[0], s[1] + dlt[1]]);
                easyEaseAll(ptProp);
            }
        }

        // ── ④ Alpha Matte ────────────────────────────────────────────────────
        // origLayer is now directly above solid in the layer stack.
        // Setting TrackMatteType.ALPHA on solid instructs AE to use the alpha
        // channel of the layer immediately above (origLayer / the text) as a
        // mask, so the gradient is only visible inside the letterforms.
        // AE will automatically hide the matte layer's eye icon in the timeline.

        solid.trackMatteType = TrackMatteType.ALPHA;

        // ── ⑤ Vertical position drift ────────────────────────────────────────
        // The solid drifts upward 20 px over the full comp duration.
        // Easy Ease on both keyframes produces gentle acceleration/deceleration.

        var posProp  = solid.property("Transform").property("Position");
        var posStart = posProp.value.slice();   // copy [cx, cy] — comp centre

        posProp.setValueAtTime(0,   [posStart[0], posStart[1]     ]);
        posProp.setValueAtTime(dur, [posStart[0], posStart[1] - 20]);
        easyEaseAll(posProp);

        // ── ⑥ Black-point lift ───────────────────────────────────────────────
        // Levels: Output Black = 20/255 ≈ 0.078
        //
        // This is the numerical equivalent of a Curves adjustment that maps
        // input level 0 to output level 20, preventing any pure black from
        // appearing inside the letterforms and keeping the effect luminous.
        //
        // The Curves effect (ADBE CurvesCustom) is NOT used here because its
        // internal curve-data structure is stored as a non-standard custom value
        // type that cannot be reliably written via ExtendScript across all
        // shipping versions of After Effects.  Levels achieves the identical
        // visual result and is fully scriptable.
        //
        // AE Levels stores its values in the 0–1 normalised range internally,
        // even though the UI displays them as 0–255.

        var levFx = solid.property(FX).addProperty("ADBE Levels");
        // "ADBE Lev-outb" = Output Black match-name; index 6 is the fallback.
        if (!trySet(levFx, "ADBE Lev-outb", 20 / 255)) {
            trySet(levFx, 6, 20 / 255);
        }

        // ── ⑦ Pre-compose ────────────────────────────────────────────────────
        // Bundle origLayer (matte), solid (sky), and baseLayer (fill) into a
        // single pre-comp.  moveAllAttributes = true keeps all effects,
        // keyframes, and the track-matte relationship inside the pre-comp.

        var indices = [origLayer.index, solid.index, baseLayer.index];
        indices.sort(function (a, b) { return a - b; });
        comp.layers.precompose(indices, "SKY_TEXT_EFFECT", true);

        alert(
            "Sky Text Effect applied!\n\n" +
            "The 'SKY_TEXT_EFFECT' pre-comp has been added to your timeline.\n\n" +
            "Layer structure inside the pre-comp (top to bottom):\n" +
            "  " + origName + "         ← Alpha Matte source (text shape)\n" +
            "  SKY_GRADIENT           ← Gradient solid (matted + animated)\n" +
            "  " + origName + "_BASE   ← 60 % opacity base fill"
        );

    } catch (err) {
        alert(
            "Sky Text Effect — unexpected error:\n\n" +
            err.toString() +
            (err.line !== undefined ? "\nLine: " + err.line : "")
        );
    } finally {
        app.endUndoGroup();
    }

})();
