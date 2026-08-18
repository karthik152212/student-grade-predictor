/* ============================================================
   AI Student Grade Predictor — results page client logic.

   Sources of truth on this page:
     - the headline mark + grade : the SERVER prediction
     - coefficients / intercept  : injected server-side by Flask in #model-data

   Everything here is derived from those two real sources. Contributions
   and what-if figures apply the model's published linear coefficients to
   the user's actual inputs; the trained model stays the single source of
   truth and the prediction itself is never recomputed in the frontend.
   ============================================================ */

(function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function round2(v) {
    return Math.round(v * 100) / 100;
  }
  function round1(v) {
    return Math.round(v * 10) / 10;
  }

  /* ---- read model metadata injected by Flask (result.html) ---- */
  var modelInfo = (function () {
    var node = el("model-data");
    if (!node || !node.textContent.trim()) return null;
    try {
      return JSON.parse(node.textContent);
    } catch (e) {
      return null;
    }
  })();

  var FEATURES = modelInfo ? modelInfo.features : [];
  var coefficients = modelInfo ? modelInfo.coefficients : [];
  var intercept = modelInfo ? modelInfo.intercept : 0;

  var coefByFeature = {};
  FEATURES.forEach(function (f, i) {
    coefByFeature[f] = coefficients[i];
  });

  /* ---- display metadata (validation bounds live server-side) ---- */
  var FEATURE_LABELS = {
    study_hours: "Study Hours",
    attendance_rate: "Attendance",
    previous_score: "Previous Score"
  };
  var FEATURE_UNITS = { study_hours: "h", attendance_rate: "%", previous_score: "%" };
  var FEATURE_MIN = { study_hours: 0, attendance_rate: 0, previous_score: 0 };
  var FEATURE_MAX = { study_hours: 12, attendance_rate: 100, previous_score: 100 };

  /* ---- state handed over from the input page ---- */
  var state = (function () {
    try {
      var raw = sessionStorage.getItem("predictionState");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  })();

  if (!state || !state.prediction || typeof state.prediction.predicted_marks !== "number") {
    window.location.replace("/");
    return;
  }

  var inputs = state.inputs;
  var currentMark = state.prediction.predicted_marks; /* server prediction (clamped, rounded) */
  var currentGrade = state.prediction.grade;

  /* ---------- the model's linear formula, using injected coefficients ---------- */
  function predictFromModel(vals) {
    var total = intercept;
    FEATURES.forEach(function (f) {
      total += coefByFeature[f] * Number(vals[f]);
    });
    return total;
  }

  /* ---------- feature contributions (value * coefficient) ---------- */
  function contributions() {
    var list = [];
    FEATURES.forEach(function (f) {
      list.push({
        feature: f,
        value: Number(inputs[f]),
        coef: coefByFeature[f],
        amount: Number(inputs[f]) * coefByFeature[f]
      });
    });
    list.sort(function (a, b) {
      return Math.abs(b.amount) - Math.abs(a.amount);
    });
    return list;
  }

  /* ---------- what-if scenarios (personalized) ---------- */
  function whatIfScenarios() {
    var out = [];

    // For each feature, compute a realistic "improved" value:
    // move 25% of the remaining range toward max, rounded to a nice step.
    FEATURES.forEach(function (f) {
      var current = Number(inputs[f]);
      var lo = FEATURE_MIN[f];
      var hi = FEATURE_MAX[f];
      var remaining = hi - current;

      if (remaining <= 0) return; // already at max

      // Determine step size for rounding
      var step = f === "study_hours" ? 0.5 : 5;
      var target = current + remaining * 0.25;
      // Round up to nearest step
      target = lo + Math.ceil((target - lo) / step) * step;
      target = clamp(target, lo, hi);
      target = round2(target);

      if (target <= current) return; // no meaningful improvement

      var scenario = {};
      FEATURES.forEach(function (ff) {
        scenario[ff] = Number(inputs[ff]);
      });
      scenario[f] = target;

      var predicted = round2(clamp(predictFromModel(scenario), 0, 100));
      var improvement = round2(predicted - currentMark);

      if (improvement > 0) {
        out.push({
          feature: f,
          label: FEATURE_LABELS[f],
          from: current,
          to: target,
          unit: FEATURE_UNITS[f],
          predicted: predicted,
          improvement: improvement
        });
      }
    });

    out.sort(function (a, b) {
      return b.improvement - a.improvement;
    });
    return out;
  }

  /* ---------- rendering ---------- */
  function renderHero() {
    el("predicted-marks").textContent = round1(currentMark);
    el("predicted-grade").textContent = "Grade " + currentGrade;
    var badge = el("grade-badge");
    badge.textContent = currentGrade;
    badge.className = "grade-badge grade-" + currentGrade.toLowerCase();
  }

  function renderSummary() {
    el("sum-study").textContent = inputs.study_hours + " " + FEATURE_UNITS.study_hours;
    el("sum-attendance").textContent = inputs.attendance_rate + " " + FEATURE_UNITS.attendance_rate;
    el("sum-previous").textContent = inputs.previous_score + " " + FEATURE_UNITS.previous_score;
  }

  function renderContributions() {
    var list = contributions();
    var totalRaw = intercept + list.reduce(function (acc, c) { return acc + c.amount; }, 0);
    var top = list[0];
    var html = "";
    html += "<p class=\"contrib-intro\">The model is a weighted sum of your inputs. ";
    html += "Your <strong>" + FEATURE_LABELS[top.feature] + "</strong> is the strongest ";
    html += "driver: at " + top.value + FEATURE_UNITS[top.feature] + ", it contributes ";
    html += "approximately <strong>" + round2(top.amount) + " points</strong> ";
    html += "(" + top.value + " &times; " + round2(top.coef) + ").</p>";
    html += "<p class=\"contrib-note\">The remaining inputs, ranked by actual influence:</p>";
    html += "<ul class=\"contrib-list\">";
    list.forEach(function (c, i) {
      html += "<li><strong>" + (i + 1) + ".</strong> " + FEATURE_LABELS[c.feature];
      html += " (" + c.value + FEATURE_UNITS[c.feature] + ") &mdash; " + round2(c.amount);
      html += " points = " + c.value + " &times; " + round2(c.coef) + "</li>";
    });
    html += "</ul>";
    html += "<p class=\"contrib-sum\">With the intercept (" + round2(intercept) + "), ";
    html += "these contributions total <strong>" + round2(totalRaw) + "</strong>; the ";
    html += "reported prediction is " + round1(currentMark) + " (clamped/rounded by the ";
    html += "model), so the two agree closely.</p>";
    el("contribution-list").innerHTML = html;
  }

  function renderWhatIf() {
    var scenarios = whatIfScenarios();
    var html = "";

    if (scenarios.length === 0) {
      html += "<p class=\"whatif-intro\">You are already at or near the maximum for all inputs.</p>";
    } else {
      html += "<p class=\"whatif-intro\">Based on this model, the best improvement comes from increasing your <strong>";
      html += FEATURE_LABELS[scenarios[0].feature] + "</strong>:</p>";
      html += "<ul class=\"whatif-list\">";
      scenarios.forEach(function (s) {
        html += "<li><strong>" + FEATURE_LABELS[s.feature] + ":</strong> from ";
        html += s.from + s.unit + " &rarr; " + s.to + s.unit + ", predicted &asymp; ";
        html += "<strong>" + s.predicted + "</strong>, an improvement of <strong>+" + s.improvement;
        html += " points</strong></li>";
      });
      html += "</ul>";
    }

    html += "<p class=\"whatif-note\">Each scenario is compared to your actual prediction ";
    html += "(" + round1(currentMark) + ") using the loaded model.</p>";
    el("whatif-list").innerHTML = html;
  }

  function renderModelFlow() {
    function fmtC(c) {
      return (Math.round(c * 1000) / 1000).toFixed(3);
    }
    var eq = "predicted_marks = " + round2(intercept);
    FEATURES.forEach(function (f) {
      eq += (coefByFeature[f] >= 0 ? " + " : " ") + fmtC(coefByFeature[f]) + " * " + f;
    });
    var html = "";
    html += "<p class=\"flow-step\">The model is a linear regression. It computes:</p>";
    html += "<pre class=\"equation\">" + eq + "</pre>";
    html += "<p class=\"flow-step\">For your inputs the weighted sum is " + round2(intercept);
    var terms = [];
    FEATURES.forEach(function (f) {
      terms.push(round2(coefByFeature[f]) + " &times; " + Number(inputs[f]));
    });
    html += " + " + terms.join(" + ") + " &asymp; " + round1(currentMark);
    html += ", which maps to grade <strong>" + currentGrade + "</strong> ";
    html += "(A &ge; 90, B &ge; 75, C &ge; 60, D &ge; 40, F &lt; 40).</p>";
    html += "<p class=\"flow-step\">This page only reads the model's coefficients to build ";
    html += "the breakdown above; the mark and grade shown are the server's prediction, ";
    html += "not a re-computation.</p>";
    el("model-flow").innerHTML = html;
  }

  /* ---------- chart: predicted marks vs previous score (others held constant) ---------- */
  function trendPoints() {
    var xs = [], ys = [];
    for (var p = 0; p <= 100; p += 2) {
      xs.push(p);
      ys.push(clamp(predictFromModel({
        study_hours: Number(inputs.study_hours),
        attendance_rate: Number(inputs.attendance_rate),
        previous_score: p
      }), 0, 100));
    }
    return { xs: xs, ys: ys };
  }

  function initChart() {
    var ctx = el("trend-chart").getContext("2d");
    var tp = trendPoints();
    new Chart(ctx, {
      type: "line",
      data: {
        labels: tp.xs,
        datasets: [
          {
            label: "Model trend (current inputs)",
            data: tp.ys,
            borderColor: "#2f6fed",
            backgroundColor: "rgba(47, 111, 237, 0.10)",
            fill: true,
            tension: 0.25,
            showLine: true,
            pointRadius: 0
          },
          {
            label: "Your prediction",
            data: [{ x: Number(inputs.previous_score), y: clamp(predictFromModel(inputs), 0, 100) }],
            backgroundColor: "#dc2626",
            borderColor: "#dc2626",
            pointRadius: 8,
            pointHoverRadius: 10,
            showLine: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Previous Score (%)" }, min: 0, max: 100 },
          y: { title: { display: true, text: "Predicted Marks" }, min: 0, max: 100 }
        },
        plugins: {
          legend: { display: true },
          tooltip: { mode: "index", intersect: false }
        }
      }
    });
  }

  /* ---------- boot ---------- */
  function render() {
    renderHero();
    renderSummary();
    if (modelInfo && FEATURES.length) {
      renderContributions();
      renderWhatIf();
      renderModelFlow();
      initChart();
    } else {
      el("contribution-list").textContent = "Model details unavailable.";
      el("model-flow").textContent = "Model details unavailable.";
    }
  }

  render();
})();
