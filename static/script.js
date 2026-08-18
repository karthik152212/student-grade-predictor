/* ============================================================
   AI Student Grade Predictor — homepage client logic.

   This script handles ONLY the input page:
     - slider ↔ numeric-input synchronization
     - slider fill (blue/purple progress)
     - keyboard / blur commit
     - validation
     - POST /api/predict
     - save state → redirect to /result

   It must NOT reference any result-page DOM elements or load
   charting libraries.  The result page uses result.js instead.
   ============================================================ */

(function () {
  "use strict";

  /* ---------- configuration (single source of truth) ---------- */

  var SLIDERS = [
    {
      key: "study_hours",
      id: "study-hours",
      decimals: 1,
      min: 0,
      max: 12,
      step: 0.1
    },
    {
      key: "attendance_rate",
      id: "attendance-rate",
      decimals: 0,
      min: 0,
      max: 100,
      step: 1
    },
    {
      key: "previous_score",
      id: "previous-score",
      decimals: 0,
      min: 0,
      max: 100,
      step: 1
    }
  ];

  function cfg(key) {
    for (var i = 0; i < SLIDERS.length; i++) {
      if (SLIDERS[i].key === key) return SLIDERS[i];
    }
    return null;
  }

  /* ---------- DOM references ---------- */

  var sliders = {};
  var inputs = {};
  var predictBtn = document.getElementById("predict-btn");
  var errorEl = document.getElementById("predict-error");

  SLIDERS.forEach(function (s) {
    sliders[s.key] = document.getElementById(s.id);
    inputs[s.key] = document.getElementById(s.id + "-val");
  });

  /* ---------- helpers ---------- */

  function formatValue(key, value) {
    return Number(value).toFixed(cfg(key).decimals);
  }

  function roundTo(value, decimals) {
    var f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }

  /* ---------- slider fill ---------- */

  function paintSlider(slider) {
    var min = Number(slider.min);
    var max = Number(slider.max);
    var pct = ((Number(slider.value) - min) / (max - min)) * 100;
    slider.style.setProperty("--slider-fill", pct + "%");
  }

  /* ---------- sync numeric → slider ---------- */

  function commitValue(key) {
    var slider = sliders[key];
    var input = inputs[key];
    var c = cfg(key);
    var num = Number(input.value);

    // If empty or non-numeric, restore slider value
    if (input.value === "" || !isFinite(num)) {
      input.value = formatValue(key, Number(slider.value));
      return;
    }

    // Clamp and snap to step
    var lo = c.min;
    var hi = c.max;
    var step = c.step;
    var snapped = lo + Math.round((num - lo) / step) * step;
    snapped = Math.min(hi, Math.max(lo, snapped));
    snapped = roundTo(snapped, c.decimals);

    slider.value = snapped;
    input.value = formatValue(key, snapped);
    paintSlider(slider);
  }

  /* ---------- read current inputs ---------- */

  function readInputs() {
    var out = {};
    SLIDERS.forEach(function (s) {
      out[s.key] = Number(sliders[s.key].value);
    });
    return out;
  }

  function currentPayload() {
    var inputs = readInputs();
    var payload = {};
    SLIDERS.forEach(function (s) {
      payload[s.key] = inputs[s.key];
    });
    return JSON.stringify(payload);
  }

  /* ---------- all sliders → display ---------- */

  function updateReadouts() {
    SLIDERS.forEach(function (s) {
      inputs[s.key].value = formatValue(s.key, sliders[s.key].value);
      paintSlider(sliders[s.key]);
    });
  }

  /* ---------- error display ---------- */

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = "";
  }

  /* ---------- loading state ---------- */

  function setLoading(loading) {
    predictBtn.disabled = loading;
    predictBtn.textContent = loading ? "Predicting\u2026" : "Predict";
  }

  /* ---------- predict flow ---------- */

  function predict() {
    clearError();
    setLoading(true);

    fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: currentPayload()
    })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) {
            var msg =
              (body && body.error) || "Request failed (" + res.status + ")";
            throw new Error(msg);
          }
          return body;
        });
      })
      .then(function (data) {
        // Save state for the result page
        var state = {
          inputs: readInputs(),
          prediction: {
            predicted_marks: data.predicted_marks,
            grade: data.grade
          }
        };
        sessionStorage.setItem("predictionState", JSON.stringify(state));

        // Navigate to result page
        window.location.href = "/result";
      })
      .catch(function (err) {
        showError(err.message || "Something went wrong. Please try again.");
      })
      .finally(function () {
        setLoading(false);
      });
  }

  /* ---------- wire up events ---------- */

  SLIDERS.forEach(function (s) {
    // Live sync while dragging
    sliders[s.key].addEventListener("input", function () {
      inputs[s.key].value = formatValue(s.key, sliders[s.key].value);
      paintSlider(sliders[s.key]);
    });

    // Commit on blur / spinner change
    inputs[s.key].addEventListener("change", function () {
      commitValue(s.key);
    });

    // Commit on Enter
    inputs[s.key].addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitValue(s.key);
        this.blur();
      }
    });
  });

  predictBtn.addEventListener("click", predict);

  // Initial paint
  updateReadouts();
})();
