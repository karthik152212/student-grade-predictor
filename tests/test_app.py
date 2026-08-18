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
        for marker in ('id="study-hours"', "predict-btn", "trend-chart"):
            self.assertIn(marker, r.get_data(as_text=True))

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
                f'id="{dom_id}-val"', template, f"missing readout output {dom_id}-val"
            )
            self.assertIn(
                f'for="{dom_id}"', template, f"missing label/output for {dom_id}"
            )

    def test_footer_deployment_statement(self):
        html = self.client.get("/").get_data(as_text=True)
        self.assertIn("Built with Flask + scikit-learn", html)
        self.assertIn("PythonAnywhere", html)
        self.assertNotIn("AWS EC2", html)


if __name__ == "__main__":
    unittest.main()
