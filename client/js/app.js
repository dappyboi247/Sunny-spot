// Hand-Drawn Type – Panel UI Logic

(function () {
  var csInterface = new CSInterface();

  // ── State ──────────────────────────────────────────────────────────────────
  var selectedStyle    = "write-on";
  var selectedIntensity = "medium";

  // ── DOM refs ───────────────────────────────────────────────────────────────
  var textInput     = document.getElementById("textInput");
  var useSelected   = document.getElementById("useSelected");
  var fontSizeSlider = document.getElementById("fontSize");
  var fontSizeVal   = document.getElementById("fontSizeVal");
  var durationSlider = document.getElementById("duration");
  var durationVal   = document.getElementById("durationVal");
  var strokeSlider  = document.getElementById("strokeWidth");
  var strokeVal     = document.getElementById("strokeWidthVal");
  var colorPicker   = document.getElementById("colorPicker");
  var applyBtn      = document.getElementById("applyBtn");
  var statusEl      = document.getElementById("status");
  var styleBtns     = document.querySelectorAll(".style-btn");
  var intensityBtns = document.querySelectorAll(".intensity-btn");

  // ── Slider live labels ─────────────────────────────────────────────────────
  fontSizeSlider.addEventListener("input", function () {
    fontSizeVal.textContent = this.value;
  });

  durationSlider.addEventListener("input", function () {
    durationVal.textContent = (this.value / 10).toFixed(1) + "s";
  });

  strokeSlider.addEventListener("input", function () {
    strokeVal.textContent = this.value;
  });

  // ── Use Selected toggle ────────────────────────────────────────────────────
  useSelected.addEventListener("change", function () {
    textInput.disabled = this.checked;
    textInput.style.opacity = this.checked ? "0.4" : "1";
  });

  // ── Style selector ─────────────────────────────────────────────────────────
  styleBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      styleBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      selectedStyle = btn.getAttribute("data-style");
    });
  });

  // ── Intensity selector ─────────────────────────────────────────────────────
  intensityBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      intensityBtns.forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      selectedIntensity = btn.getAttribute("data-intensity");
    });
  });

  // ── Apply ──────────────────────────────────────────────────────────────────
  applyBtn.addEventListener("click", function () {
    var params = {
      text:        textInput.value.trim(),
      useSelected: useSelected.checked,
      fontSize:    parseInt(fontSizeSlider.value),
      color:       colorPicker.value,
      duration:    parseFloat(durationSlider.value) / 10,
      strokeWidth: parseFloat(strokeSlider.value),
      style:       selectedStyle,
      intensity:   selectedIntensity
    };

    if (!params.useSelected && params.text === "") {
      showStatus("Please enter some text.", "error");
      return;
    }

    setLoading(true);
    showStatus("Applying animation…", "");

    var script = "applyHandDrawnAnimation('" + escapeForEval(JSON.stringify(params)) + "')";

    csInterface.evalScript(script, function (result) {
      setLoading(false);
      if (!result || result === "undefined") {
        showStatus("No response from After Effects.", "error");
        return;
      }
      if (result.indexOf("SUCCESS") === 0) {
        showStatus("Animation applied!", "success");
      } else {
        var msg = result.replace(/^ERROR:\s*/, "");
        showStatus(msg, "error");
      }
    });
  });

  // ── Helpers ────────────────────────────────────────────────────────────────
  function setLoading(on) {
    applyBtn.disabled = on;
    applyBtn.innerHTML = on
      ? '<span class="spinner"></span>Applying…'
      : '<svg class="btn-icon" viewBox="0 0 20 20" fill="none"><path d="M3 17 L7 13 L15 5 Q16.5 3.5 18 5 Q19.5 6.5 18 8 L10 16 L6 17 Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M13 7 L15 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Apply Animation';
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = "status" + (type ? " " + type : "");
    if (type === "success") {
      setTimeout(function () {
        if (statusEl.classList.contains("success")) {
          statusEl.textContent = "";
          statusEl.className = "status";
        }
      }, 4000);
    }
  }

  function escapeForEval(str) {
    return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

})();
