/* ============================================================
   AI Student Grade Predictor — client logic (per UI_DESIGN.md)
   ============================================================ */

(function () {
  "use strict";

  var FEATURES = ["study_hours", "attendance_rate", "previous_score"];

  var sliderConfig = {
    study_hours: { decimals: 1 },
    attendance_rate: { decimals: 0 },
    previous_score: { decimals: 0 }
  };

  var el = {
    sliders: {},
    outputs: {},
    predictBtn: document.getElementById("predict-btn"),
    placeholder: document.getElementById("result-placeholder"),
    resultContent: document.getElementById("result-content"),
    marks: document.getElementById("predicted-marks"),
    badge: document.getElementById("grade-badge"),
    message: document.getElementById("grade-message"),
    error: document.getElementById("error-message"),
    canvas: document.getElementById("trend-chart")
  };

  FEATURES.forEach(function (f) {
    el.sliders[f] = document.getElementById(f);
    el.outputs[f] = document.getElementById(f + "-val");
  });

  // Model info + training data injected by the server.
  var modelInfo = JSON.parse(
    document.getElementById("model-data").textContent
  );
  var trainingPoints = JSON.parse(
    document.getElementById("train-data").textContent
  );

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

  function formatValue(feature, value) {
    return Number(value).toFixed(sliderConfig[feature].decimals);
  }

  function readInputs() {
    var out = {};
    FEATURES.forEach(function (f) {
      out[f] = Number(el.sliders[f].value);
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
    FEATURES.forEach(function (f) {
      el.outputs[f].textContent = formatValue(f, el.sliders[f].value);
      paintSlider(el.sliders[f]);
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
        modelInfo.coefficients[0] * inputs.study_hours +
        modelInfo.coefficients[1] * inputs.attendance_rate +
        modelInfo.coefficients[2] * prev;
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
            label: "Training data",
            data: trainingPoints.map(function (p) {
              return { x: p[0], y: p[1] };
            }),
            backgroundColor: "rgba(100, 116, 139, 0.35)",
            pointRadius: 2,
            pointHoverRadius: 5
          },
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
    chart.data.datasets[1].data = trendPoints();
    chart.update("none");
  }

  function setPredictionPoint(pred) {
    if (!chart) return;
    var inputs = readInputs();
    chart.data.datasets[2].data = [
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
    return JSON.stringify({
      study_hours: inputs.study_hours,
      attendance_rate: inputs.attendance_rate,
      previous_score: inputs.previous_score
    });
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

  FEATURES.forEach(function (f) {
    el.sliders[f].addEventListener("input", function () {
      updateReadouts(); // live number only — no API call
      refreshTrend();   // cheap client-side trend redraw
    });
  });

  el.predictBtn.addEventListener("click", predict);

  updateReadouts();
  initChart();
})();
