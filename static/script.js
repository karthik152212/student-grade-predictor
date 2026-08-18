/* ============================================================
   AI Student Grade Predictor — client logic (per UI_DESIGN.md)
   ============================================================ */

(function () {
  "use strict";

  // Explicit mapping between the backend API keys (underscores) and the
  // DOM ids used by the template (hyphens). Kept in one place so the
  // frontend never has to guess how an API key maps to an element id.
  var SLIDERS = [
    { key: "study_hours", id: "study-hours", decimals: 1 },
    { key: "attendance_rate", id: "attendance-rate", decimals: 0 },
    { key: "previous_score", id: "previous-score", decimals: 0 }
  ];

  function sliderConfig(key) {
    for (var i = 0; i < SLIDERS.length; i++) {
      if (SLIDERS[i].key === key) return SLIDERS[i];
    }
    return null; // only reachable if config is inconsistent; tests guard this
  }

  var el = {
    sliders: {},
    inputs: {},
    predictBtn: document.getElementById("predict-btn"),
    placeholder: document.getElementById("result-placeholder"),
    resultContent: document.getElementById("result-content"),
    marks: document.getElementById("predicted-marks"),
    badge: document.getElementById("grade-badge"),
    message: document.getElementById("grade-message"),
    error: document.getElementById("error-message"),
    canvas: document.getElementById("trend-chart")
  };

  SLIDERS.forEach(function (s) {
    el.sliders[s.key] = document.getElementById(s.id);
    el.inputs[s.key] = document.getElementById(s.id + "-val");
  });

  // Model info injected by the server (coefficients/intercept).
  var modelInfo = JSON.parse(
    document.getElementById("model-data").textContent
  );

  // Model coefficients indexed by feature name (order-safe).
  var coefByFeature = {};
  if (modelInfo) {
    for (var i = 0; i < modelInfo.features.length; i++) {
      coefByFeature[modelInfo.features[i]] = modelInfo.coefficients[i];
    }
  }

  var GRADES = [
    { threshold: 90, grade: "A", message: "Excellent — top of the class!" },
    { threshold: 75, grade: "B", message: "Great trajectory — keep it up!" },
    { threshold: 60, grade: "C", message: "On track — a little more focus could push you higher." },
    { threshold: 40, grade: "D", message: "Room to improve — consider more study time." }
  ];

  function gradeInfo(marks) {
    for (var i = 0; i < GRADES.length; i++) {
      if (marks >= GRADES[i].threshold) return GRADES[i];
    }
    return {
      grade: "F",
      message: "Needs attention — let's make a plan to improve."
    };
  }

  /* ---------- slider helpers ---------- */

  function formatValue(key, value) {
    return Number(value).toFixed(sliderConfig(key).decimals);
  }

  function roundTo(value, decimals) {
    var f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }

  // Commit a value typed into a numeric input back onto its slider.
  // Clamps to min/max, snaps to the slider step, normalizes the display,
  // and repaints fill + trend. Invalid/empty input restores the last
  // valid value so the app can never break from a bad keystroke.
  function commitValue(key) {
    var slider = el.sliders[key];
    var input = el.inputs[key];
    var cfg = sliderConfig(key);
    var num = Number(input.value);
    if (input.value === "" || !isFinite(num)) {
      input.value = formatValue(key, Number(slider.value));
      return;
    }
    var lo = Number(slider.min);
    var hi = Number(slider.max);
    var step = Number(slider.step);
    var snapped = lo + Math.round((num - lo) / step) * step;
    snapped = Math.min(hi, Math.max(lo, snapped));
    snapped = roundTo(snapped, cfg.decimals);

    slider.value = snapped;
    input.value = formatValue(key, snapped);
    paintSlider(slider);
    refreshTrend();
  }

  function readInputs() {
    var out = {};
    SLIDERS.forEach(function (s) {
      out[s.key] = Number(el.sliders[s.key].value);
    });
    return out;
  }

  function paintSlider(slider) {
    var min = Number(slider.min);
    var max = Number(slider.max);
    var pct = ((Number(slider.value) - min) / (max - min)) * 100;
    slider.style.setProperty("--slider-fill", pct + "%");
  }

  function updateReadouts() {
    SLIDERS.forEach(function (s) {
      el.inputs[s.key].value = formatValue(s.key, el.sliders[s.key].value);
      paintSlider(el.sliders[s.key]);
    });
  }

  /* ---------- chart ---------- */

  function trendPoints() {
    var inputs = readInputs();
    var pts = [];
    if (!modelInfo) return pts;
    for (var prev = 0; prev <= 100; prev += 5) {
      var y =
        modelInfo.intercept +
        coefByFeature.study_hours * inputs.study_hours +
        coefByFeature.attendance_rate * inputs.attendance_rate +
        coefByFeature.previous_score * prev;
      pts.push({ x: prev, y: Math.max(0, Math.min(100, y)) });
    }
    return pts;
  }

  var chart = null;

  function initChart() {
    if (!el.canvas) return;
    var ctx = el.canvas.getContext("2d");

    chart = new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          {
            label: "Model trend (current inputs)",
            data: trendPoints(),
            showLine: true,
            borderColor: "#4F46E5",
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.1
          },
          {
            label: "Your prediction",
            data: [],
            backgroundColor: "#4F46E5",
            borderColor: "#ffffff",
            borderWidth: 2,
            pointRadius: 8,
            pointHoverRadius: 11
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            title: { display: true, text: "Previous score" },
            min: 0,
            max: 100
          },
          y: {
            title: { display: true, text: "Final marks" },
            min: 0,
            max: 100
          }
        },
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: function (item) {
                return item.dataset.label + ": " + item.parsed.y.toFixed(2);
              }
            }
          }
        }
      }
    });
  }

  function refreshTrend() {
    if (!chart) return;
    chart.data.datasets[0].data = trendPoints();
    chart.update("none");
  }

  function setPredictionPoint(pred) {
    if (!chart) return;
    var inputs = readInputs();
    chart.data.datasets[1].data = [
      { x: inputs.previous_score, y: pred }
    ];
    chart.update();
  }

  /* ---------- result panel ---------- */

  function animateNumber(targetValue, duration) {
    var start = performance.now();
    var from = Number(el.marks.textContent) || 0;
    function step(now) {
      var t = Math.min(1, (now - start) / duration);
      var eased = 1 - Math.pow(1 - t, 3);
      el.marks.textContent = (from + (targetValue - from) * eased).toFixed(1);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function showError(msg) {
    el.error.textContent = msg;
    el.error.hidden = false;
  }

  function clearError() {
    el.error.hidden = true;
  }

  function updateResult(data) {
    var info = gradeInfo(data.predicted_marks);
    el.placeholder.hidden = true;
    el.resultContent.hidden = false;
    clearError();
    animateNumber(data.predicted_marks, 500);
    el.badge.textContent = info.grade;
    el.badge.className = "grade-badge badge-" + info.grade;
    el.message.textContent = info.message;
  }

  /* ---------- predict flow ---------- */

  function setLoading(loading) {
    el.predictBtn.disabled = loading;
    el.predictBtn.textContent = loading ? "Predicting…" : "Predict";
  }

  function currentPayload() {
    var inputs = readInputs();
    var payload = {};
    SLIDERS.forEach(function (s) {
      payload[s.key] = inputs[s.key];
    });
    return JSON.stringify(payload);
  }

  function predict() {
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
        updateResult(data);
        setPredictionPoint(data.predicted_marks);
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
    el.sliders[s.key].addEventListener("input", function () {
      updateReadouts(); // live number only — no API call
      refreshTrend();   // cheap client-side trend redraw
    });

    // Keyboard editing: commit on Enter and on blur/change (spinner too).
    el.inputs[s.key].addEventListener("change", function () {
      commitValue(s.key);
    });
    el.inputs[s.key].addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitValue(s.key);
        this.blur();
      }
    });
  });

  el.predictBtn.addEventListener("click", predict);

  updateReadouts();
  initChart();
})();
