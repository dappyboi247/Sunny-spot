// Hand-Drawn Type – After Effects ExtendScript host
// Requires AE CC 2020+ (17.0+)

(function () {

  // ─── Entry point called from the HTML panel ───────────────────────────────

  function applyHandDrawnAnimation(paramsJSON) {
    try {
      var params = JSON.parse(paramsJSON);
      var comp = getActiveComp();
      if (!comp) return "ERROR: No active composition found. Please open or create a composition first.";

      app.beginUndoGroup("Hand-Drawn Type Animation");

      var textLayer = createOrSelectTextLayer(comp, params);
      if (typeof textLayer === "string") return textLayer; // error string

      var shapeLayer = convertTextToShapes(comp, textLayer);
      if (typeof shapeLayer === "string") return shapeLayer;

      var style = params.style || "write-on";
      if (style === "write-on")       applyWriteOn(comp, shapeLayer, params);
      else if (style === "scribble")  applyScribbleIn(comp, shapeLayer, params);
      else if (style === "sketch")    applySketchReveal(comp, shapeLayer, params);

      addWiggleExpressions(shapeLayer, params.intensity);

      // Hide original text layer – shapes are what we see
      textLayer.enabled = false;

      app.endUndoGroup();
      return "SUCCESS";
    } catch (e) {
      try { app.endUndoGroup(); } catch (ignore) {}
      return "ERROR: " + e.message;
    }
  }

  // ─── Composition ──────────────────────────────────────────────────────────

  function getActiveComp() {
    var item = app.project.activeItem;
    if (item && item instanceof CompItem) return item;
    // Try to find any open comp
    for (var i = 1; i <= app.project.numItems; i++) {
      if (app.project.item(i) instanceof CompItem) return app.project.item(i);
    }
    return null;
  }

  // ─── Text layer ───────────────────────────────────────────────────────────

  function createOrSelectTextLayer(comp, params) {
    if (params.useSelected) {
      var sel = comp.selectedLayers;
      if (sel.length === 0) return "ERROR: No layer selected. Select a text layer or uncheck 'Use Selected Layer'.";
      var layer = sel[0];
      if (!(layer instanceof TextLayer)) return "ERROR: Selected layer is not a text layer.";
      return layer;
    }

    if (!params.text || params.text === "") return "ERROR: Please enter some text.";

    var textLayer = comp.layers.addText(params.text);
    var textProp  = textLayer.property("Source Text");
    var textDoc   = textProp.value;

    textDoc.fontSize      = parseInt(params.fontSize) || 72;
    textDoc.fillColor     = hexToRgb(params.color || "#ffffff");
    textDoc.font          = "ArialMT";
    textDoc.justification = ParagraphJustification.CENTER_JUSTIFY;

    textProp.setValue(textDoc);

    // Center in comp
    textLayer.position.setValue([comp.width / 2, comp.height / 2]);
    return textLayer;
  }

  // ─── Convert text → shape outlines ────────────────────────────────────────

  function convertTextToShapes(comp, textLayer) {
    // Select only this layer
    for (var i = 1; i <= comp.numLayers; i++) comp.layer(i).selected = false;
    textLayer.selected = true;

    // "Create Shapes from Text" – menu ID 3973 in AE CC 2019+
    // Fallback: use Layer > Create Masks from Text (3976) + add stroke
    try {
      app.executeCommand(3973); // Create Shapes from Text
    } catch (e) {
      return "ERROR: Could not convert text to shapes. Make sure you are running After Effects CC 2019 or later. (" + e.message + ")";
    }

    // After the command runs, the new shape layer is on top and selected
    var shapeLayer = comp.selectedLayers[0];
    if (!shapeLayer || !(shapeLayer instanceof ShapeLayer)) {
      return "ERROR: Shape layer was not created. The text may be empty.";
    }

    shapeLayer.name = textLayer.name + " – Hand-Drawn";
    return shapeLayer;
  }

  // ─── Animation styles ─────────────────────────────────────────────────────

  function applyWriteOn(comp, shapeLayer, params) {
    var iv     = intensityValues(params.intensity);
    var dur    = parseFloat(params.duration) || 2.0;
    var fps    = comp.frameRate;
    var stroke = parseFloat(params.strokeWidth) || 4;
    var color  = hexToRgb(params.color || "#ffffff");

    var contents = shapeLayer.property("Contents");

    for (var g = 1; g <= contents.numProperties; g++) {
      var group = contents.property(g);
      if (!group || group.matchName !== "ADBE Vector Group") continue;

      addStrokeToGroup(group, color, stroke + iv.strokeOffset);

      // Trim Paths: animate End from 0 → 100 over duration
      var trimPaths = group.property("Contents").addProperty("ADBE Vector Filter - Trim");
      var startFrame = Math.round((g - 1) * (dur / contents.numProperties) * fps);
      var endFrame   = Math.round(g       * (dur / contents.numProperties) * fps);

      var endProp = trimPaths.property("ADBE Vector Trim End");
      endProp.setValueAtTime(startFrame / fps, 0);
      endProp.setValueAtTime(endFrame   / fps, 100);

      // Ease out the keyframes for a natural deceleration
      var kf2 = endProp.nearestKeyIndex(endFrame / fps);
      endProp.setTemporalEaseAtKey(kf2, [new KeyframeEase(0, 66)], [new KeyframeEase(0, 33)]);
    }
  }

  function applyScribbleIn(comp, shapeLayer, params) {
    var iv     = intensityValues(params.intensity);
    var dur    = parseFloat(params.duration) || 2.0;
    var fps    = comp.frameRate;
    var stroke = parseFloat(params.strokeWidth) || 4;
    var color  = hexToRgb(params.color || "#ffffff");

    var contents = shapeLayer.property("Contents");

    for (var g = 1; g <= contents.numProperties; g++) {
      var group = contents.property(g);
      if (!group || group.matchName !== "ADBE Vector Group") continue;

      var perGlyph = dur / contents.numProperties;
      var startT   = (g - 1) * perGlyph;

      // Primary stroke
      addStrokeToGroup(group, color, stroke);
      var trim1 = group.property("Contents").addProperty("ADBE Vector Filter - Trim");
      animateTrimEnd(trim1, startT, startT + perGlyph * 0.85, fps);

      // Offset scribble stroke (slightly different width + offset for sketch texture)
      addStrokeToGroup(group, color, stroke * 0.6 + iv.strokeOffset);
      var trim2 = group.property("Contents").addProperty("ADBE Vector Filter - Trim");
      animateTrimEnd(trim2, startT + perGlyph * 0.1, startT + perGlyph, fps);

      // Offset path expression for scribble wobble
      try {
        var offsetPaths = group.property("Contents").addProperty("ADBE Vector Filter - Offset");
        var amt = offsetPaths.property("ADBE Vector Offset Amount");
        amt.expression = "wiggle(" + iv.wiggleFreq + ", " + (iv.strokeOffset * 2) + ")";
      } catch (ignore) {}
    }
  }

  function applySketchReveal(comp, shapeLayer, params) {
    var iv    = intensityValues(params.intensity);
    var dur   = parseFloat(params.duration) || 2.0;
    var fps   = comp.frameRate;
    var color = hexToRgb(params.color || "#ffffff");
    var stroke = parseFloat(params.strokeWidth) || 4;

    var contents = shapeLayer.property("Contents");

    // Add strokes to all groups first
    for (var g = 1; g <= contents.numProperties; g++) {
      var group = contents.property(g);
      if (!group || group.matchName !== "ADBE Vector Group") continue;
      addStrokeToGroup(group, color, stroke);
    }

    // Opacity: fade in over first 25% of duration
    var opProp = shapeLayer.property("Transform").property("Opacity");
    opProp.setValueAtTime(0,           0);
    opProp.setValueAtTime(dur * 0.25,  100);

    // Turbulent Displace effect: amount animates from high → 0
    var fx = shapeLayer.Effects.addProperty("ADBE Turbulent Displace");
    if (fx) {
      var displaceProp = fx.property("ADBE Turbulent Displace-0002"); // Amount
      if (!displaceProp) displaceProp = fx.property(2);
      if (displaceProp) {
        displaceProp.setValueAtTime(0,   iv.displaceAmt);
        displaceProp.setValueAtTime(dur, 0);
      }

      // Evolution expression for continuously shifting distortion
      var evolutionProp = fx.property("ADBE Turbulent Displace-0004");
      if (!evolutionProp) evolutionProp = fx.property(4);
      if (evolutionProp) {
        evolutionProp.expression = "time * 180";
      }
    }
  }

  // ─── Wiggle expressions for organic movement ──────────────────────────────

  function addWiggleExpressions(shapeLayer, intensity) {
    var iv = intensityValues(intensity);

    try {
      var pos = shapeLayer.property("Transform").property("Position");
      pos.expression = "wiggle(" + iv.wiggleFreq + ", " + iv.wiggleAmp + ")";
    } catch (ignore) {}

    try {
      var rot = shapeLayer.property("Transform").property("Rotation");
      rot.expression = "wiggle(" + Math.max(1, iv.wiggleFreq - 1) + ", " + (iv.wiggleAmp * 0.3) + ")";
    } catch (ignore) {}
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function addStrokeToGroup(group, color, width) {
    try {
      var stroke = group.property("Contents").addProperty("ADBE Vector Graphic - Stroke");
      stroke.property("ADBE Vector Stroke Color").setValue(color);
      stroke.property("ADBE Vector Stroke Width").setValue(width);
      stroke.property("ADBE Vector Stroke Line Cap").setValue(2); // Round cap
      stroke.property("ADBE Vector Stroke Line Join").setValue(2); // Round join
    } catch (ignore) {}
  }

  function animateTrimEnd(trimPaths, startTime, endTime, fps) {
    var endProp = trimPaths.property("ADBE Vector Trim End");
    endProp.setValueAtTime(startTime, 0);
    endProp.setValueAtTime(endTime,   100);
    try {
      var kf = endProp.nearestKeyIndex(endTime);
      endProp.setTemporalEaseAtKey(kf, [new KeyframeEase(0, 66)], [new KeyframeEase(0, 33)]);
    } catch (ignore) {}
  }

  function intensityValues(intensity) {
    var presets = {
      subtle: { wiggleFreq: 2,  wiggleAmp: 0.8, displaceAmt: 5,  strokeOffset: 0.5 },
      medium: { wiggleFreq: 3,  wiggleAmp: 2.0, displaceAmt: 15, strokeOffset: 1.5 },
      heavy:  { wiggleFreq: 5,  wiggleAmp: 4.0, displaceAmt: 30, strokeOffset: 3.0 }
    };
    return presets[intensity] || presets.medium;
  }

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    var r = parseInt(hex.substring(0, 2), 16) / 255;
    var g = parseInt(hex.substring(2, 4), 16) / 255;
    var b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  // ─── Expose to CEP ────────────────────────────────────────────────────────

  this.applyHandDrawnAnimation = applyHandDrawnAnimation;

})();
