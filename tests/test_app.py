"""
Unit tests for the Student Grade Predictor Flask app.

Uses only the standard library (unittest) and Flask's test client, so no
extra dependencies are required. Run from the project root:

    python -m unittest discover -s tests -v
"""

import pathlib
import re
import unittest

import app as app_module

VALID = {"study_hours": 6, "attendance_rate": 80, "previous_score": 70}
MAX = {"study_hours": 12, "attendance_rate": 100, "previous_score": 100}
ZEROS = {"study_hours": 0, "attendance_rate": 0, "previous_score": 0}


class GradePredictorTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app_module.app.test_client()

    def post(self, payload, raw=False):
        if raw:
            return self.client.post(
                "/api/predict", data=payload, content_type="application/json"
            )
        return self.client.post("/api/predict", json=payload)

    # ---- health ----
    def test_health(self):
        r = self.client.get("/api/health")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.get_json(), {"status": "ok"})

    # ---- valid prediction ----
    def test_valid_prediction_shape_and_range(self):
        r = self.post(VALID)
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertEqual(set(body.keys()), {"predicted_marks", "grade"})
        self.assertTrue(0 <= body["predicted_marks"] <= 100)
        self.assertIn(body["grade"], ("A", "B", "C", "D", "F"))

    # ---- boundaries ----
    def test_zeros_boundary(self):
        r = self.post(ZEROS)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(0 <= r.get_json()["predicted_marks"] <= 100)

    def test_max_boundary(self):
        r = self.post(MAX)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(0 <= r.get_json()["predicted_marks"] <= 100)

    # ---- grade bands ----
    def test_grade_bands(self):
        cases = [
            ({"study_hours": 12, "attendance_rate": 100, "previous_score": 100}, "A"),
            ({"study_hours": 8, "attendance_rate": 80, "previous_score": 85}, "B"),
            ({"study_hours": 5, "attendance_rate": 65, "previous_score": 70}, "C"),
            ({"study_hours": 2, "attendance_rate": 60, "previous_score": 60}, "D"),
            (ZEROS, "F"),
        ]
        for payload, expected in cases:
            body = self.post(payload).get_json()
            self.assertEqual(body["grade"], expected, payload)

    # ---- invalid inputs -> 400, never 500 ----
    def test_non_numeric_value_returns_400(self):
        r = self.post({"study_hours": "abc", "attendance_rate": 80, "previous_score": 70})
        self.assertEqual(r.status_code, 400)
        self.assertIn("error", r.get_json())

    def test_missing_key_returns_400(self):
        r = self.post({"study_hours": 5})
        self.assertEqual(r.status_code, 400)

    def test_out_of_range_returns_400(self):
        r = self.post({"study_hours": 99, "attendance_rate": 80, "previous_score": 70})
        self.assertEqual(r.status_code, 400)

    def test_negative_value_returns_400(self):
        r = self.post({"study_hours": -1, "attendance_rate": 80, "previous_score": 70})
        self.assertEqual(r.status_code, 400)

    def test_malformed_json_returns_400(self):
        r = self.post("not json", raw=True)
        self.assertEqual(r.status_code, 400)

    def test_homepage_serves_ui(self):
        r = self.client.get("/")
        self.assertEqual(r.status_code, 200)
        html = r.get_data(as_text=True)
        # Phase 2 homepage: minimal input page, no prediction/chart
        self.assertIn("AI Student Grade Predictor", html)
        self.assertIn("study-hours", html)
        self.assertIn("attendance-rate", html)
        self.assertIn("previous-score", html)
        self.assertIn("study-hours-val", html)
        self.assertIn("attendance-rate-val", html)
        self.assertIn("previous-score-val", html)
        self.assertIn("predict-btn", html)
        self.assertIn("home-layout", html)
        # Old Phase 1 elements must NOT be on the Phase 2 homepage
        self.assertNotIn("trend-chart", html)
        self.assertNotIn("predicted-marks", html)
        self.assertNotIn("grade-badge", html)
        self.assertNotIn("predicted-grade", html)
        self.assertNotIn("result-content", html)
        self.assertNotIn("model-data", html)
        self.assertNotIn("model-flow", html)
        self.assertNotIn("contribution-list", html)
        self.assertNotIn("whatif-list", html)
        self.assertNotIn("chart-section", html)
        self.assertNotIn("chart-wrap", html)
        self.assertNotIn("train-data", html)
        self.assertNotIn("Training data", html)

    def test_result_page_serves_ui(self):
        """Result page contains all expected sections including trend chart."""
        r = self.client.get("/result")
        self.assertEqual(r.status_code, 200)
        html = r.get_data(as_text=True)
        # Prediction / result section
        self.assertIn("YOUR PREDICTION", html)
        self.assertIn("predicted-marks", html)
        # Grade section
        self.assertIn("grade-badge", html)
        # Model-derived contribution section
        self.assertIn("contribution-list", html)
        # Personalized what-if section
        self.assertIn("whatif-list", html)
        # Model explanation section
        self.assertIn("model-flow", html)
        # Trend chart + current prediction point live on the result page
        self.assertIn("trend-chart", html)
        # Model metadata injected by the server for derivation
        self.assertIn("model-data", html)
        # Input summary echo
        self.assertIn("Study Hours", html)

    # ---- frontend contract tests ----
    def test_frontend_slider_mapping_matches_template(self):
        """Every slider config entry in script.js must resolve to real DOM ids."""
        root = pathlib.Path(__file__).resolve().parent.parent
        template = (root / "templates" / "index.html").read_text(encoding="utf-8")
        script = (root / "static" / "script.js").read_text(encoding="utf-8")

        pairs = re.findall(r'key:\s*"([^"]+)"\s*,\s*id:\s*"([^"]+)"', script)
        self.assertTrue(pairs, "expected SLIDERS config entries in script.js")
        self.assertEqual(
            {key for key, _ in pairs},
            {"study_hours", "attendance_rate", "previous_score"},
            "slider API keys must match the backend API contract",
        )
        for key, dom_id in pairs:
            self.assertIn(f'id="{dom_id}"', template, f"missing slider id {dom_id}")
            self.assertIn(
                f'id="{dom_id}-val"', template, f"missing readout input {dom_id}-val"
            )
            self.assertIn(
                f'for="{dom_id}"', template, f"missing label/output for {dom_id}"
            )

    def _input_attrs(self, template, input_id):
        m = re.search(
            r'<input\s[^>]*\bid="' + re.escape(input_id) + r'"[^>]*>',
            template,
        )
        self.assertIsNotNone(m, f"input #{input_id} not found in template")
        block = m.group(0)

        def attr(name):
            mm = re.search(name + r'="([^"]*)"', block)
            return mm.group(1) if mm else None

        return attr

    def test_slider_and_input_configuration(self):
        """A/C/D/E: sliders + numeric inputs expose the requested ranges."""
        root = pathlib.Path(__file__).resolve().parent.parent
        template = (root / "templates" / "index.html").read_text(encoding="utf-8")

        expected_sliders = {
            "study-hours": {"min": "0", "max": "12", "step": "0.1", "value": "6"},
            "attendance-rate": {"min": "0", "max": "100", "step": "1", "value": "80"},
            "previous-score": {"min": "0", "max": "100", "step": "1", "value": "70"},
        }
        for slider_id, attrs in expected_sliders.items():
            a = self._input_attrs(template, slider_id)
            self.assertEqual(a("type"), "range", slider_id)
            for name, val in attrs.items():
                self.assertEqual(a(name), val, f"{slider_id} {name}")

        expected_inputs = {
            "study-hours-val": ("number", "0", "12", "0.1", "6.0"),
            "attendance-rate-val": ("number", "0", "100", "1", "80"),
            "previous-score-val": ("number", "0", "100", "1", "70"),
        }
        for input_id, (typ, mn, mx, step, value) in expected_inputs.items():
            a = self._input_attrs(template, input_id)
            self.assertEqual(a("type"), typ, input_id)
            self.assertEqual(a("min"), mn, input_id)
            self.assertEqual(a("max"), mx, input_id)
            self.assertEqual(a("step"), step, input_id)
            self.assertEqual(a("value"), value, input_id)
            self.assertTrue(a("aria-label"), f"missing aria-label on {input_id}")

    def test_study_hours_decimal_payload(self):
        """B: the API accepts decimal study_hours such as 7.4."""
        r = self.post(
            {"study_hours": 7.4, "attendance_rate": 80, "previous_score": 70}
        )
        self.assertEqual(r.status_code, 200)
        self.assertTrue(0 <= r.get_json()["predicted_marks"] <= 100)

    def test_reference_prediction_case(self):
        """study 8 / attendance 90 / previous 85 -> ~81.1 marks, grade B."""
        r = self.post({"study_hours": 8, "attendance_rate": 90, "previous_score": 85})
        self.assertEqual(r.status_code, 200)
        body = r.get_json()
        self.assertAlmostEqual(body["predicted_marks"], 81.1, delta=1.0)
        self.assertEqual(body["grade"], "B")

    def test_api_contract_keys_unchanged(self):
        """F: the backend contract remains exactly the three API keys."""
        self.assertEqual(
            list(app_module.BOUNDS.keys()),
            ["study_hours", "attendance_rate", "previous_score"],
        )
        self.assertEqual(
            app_module.FEATURES, ["study_hours", "attendance_rate", "previous_score"]
        )

    def test_no_stale_underscore_dom_ids(self):
        """G: script.js must not look up DOM elements by underscore API keys."""
        root = pathlib.Path(__file__).resolve().parent.parent
        script = (root / "static" / "script.js").read_text(encoding="utf-8")
        template = (root / "templates" / "index.html").read_text(encoding="utf-8")

        for key in ("study_hours", "attendance_rate", "previous_score"):
            self.assertNotIn(f'getElementById("{key}")', script)
        for dom_id in ("study-hours", "attendance-rate", "previous-score"):
            self.assertIn(f'id: "{dom_id}"', script, "SLIDERS config id")
            self.assertIn(f'getElementById(s.id + "-val")', script, "readout wiring")
            self.assertIn(f'id="{dom_id}-val"', template)

    def test_chart_has_no_training_scatter(self):
        """H: the chart renders only trend + prediction, no training dots."""
        root = pathlib.Path(__file__).resolve().parent.parent
        script = (root / "static" / "script.js").read_text(encoding="utf-8")
        template = (root / "templates" / "index.html").read_text(encoding="utf-8")

        self.assertNotIn("Training data", script)
        self.assertNotIn("train-data", script)
        self.assertNotIn('<script id="train-data"', template)
        self.assertIn("showLine: true", script)
        self.assertIn("Your prediction", script)
        self.assertIn("Model trend (current inputs)", script)

    def test_footer_deployment_statement(self):
        html = self.client.get("/").get_data(as_text=True)
        self.assertIn("Built with Flask + scikit-learn", html)
        self.assertIn("PythonAnywhere", html)
        self.assertNotIn("AWS EC2", html)


if __name__ == "__main__":
    unittest.main()
