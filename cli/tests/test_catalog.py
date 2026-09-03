from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch

from experiment_catalog import Catalog, PushValidationError, load_csv
from experiment_catalog.client import CatalogClient


class FakeClient:
    def __init__(self) -> None:
        self.projects: list[dict[str, Any]] = []
        self.experiments: dict[tuple[str, str], dict[str, Any]] = {}
        self.results: list[tuple[str, str, dict[str, Any]]] = []
        self.calls: list[tuple[Any, ...]] = []

    def list_projects(self) -> list[dict[str, Any]]:
        return self.projects

    def create_project(self, name: str) -> None:
        self.calls.append(("create_project", name))
        self.projects.append({"name": name})

    def get_experiment(self, project: str, experiment: str) -> dict[str, Any] | None:
        return self.experiments.get((project, experiment))

    def create_experiment(self, project: str, name: str, hypothesis: str) -> None:
        self.calls.append(("create_experiment", project, name, hypothesis))
        self.experiments[(project, name)] = {
            "name": name,
            "hypothesis": hypothesis,
        }

    def add_result(self, project: str, experiment: str, result: dict[str, Any]) -> None:
        self.calls.append(("add_result", project, experiment, result))
        self.results.append((project, experiment, result))


class CsvTests(unittest.TestCase):
    def write_csv(self, contents: str) -> Path:
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "results.csv"
        path.write_text(contents, encoding="utf-8")
        return path

    def test_metrics_are_columns_and_empty_values_are_omitted(self) -> None:
        path = self.write_csv(
            "ref,inference_uri,correctness,latency\nq1,outputs/q1.json,0.9,1200\nq2,,0.8,\n"
        )

        results = load_csv(path, set_name="candidate-a")

        self.assertEqual(
            results[0],
            {
                "ref": "q1",
                "set": "candidate-a",
                "inference_uri": "outputs/q1.json",
                "metrics": {"correctness": 0.9, "latency": 1200},
            },
        )
        self.assertEqual(results[1]["metrics"], {"correctness": 0.8})

    def test_classification_labels_are_supported(self) -> None:
        path = self.write_csv("ref,retrieval_accuracy\nq1,t+\n")

        results = load_csv(path, set_name="candidate-a")

        self.assertEqual(results[0]["metrics"]["retrieval_accuracy"], "t+")

    def test_classification_labels_require_compatible_metric_names(self) -> None:
        path = self.write_csv("ref,quality\nq1,t+\n")

        with self.assertRaisesRegex(PushValidationError, "metric name must contain"):
            load_csv(path, set_name="candidate-a")

    def test_ref_and_metric_columns_are_required(self) -> None:
        path = self.write_csv("inference_uri\noutputs/q1.json\n")
        with self.assertRaisesRegex(PushValidationError, "ref column"):
            load_csv(path, set_name="candidate-a")

        path = self.write_csv("ref,inference_uri\nq1,outputs/q1.json\n")
        with self.assertRaisesRegex(PushValidationError, "metric column"):
            load_csv(path, set_name="candidate-a")

    def test_target_columns_are_rejected(self) -> None:
        path = self.write_csv("ref,set,correctness\nq1,candidate-a,0.9\n")

        with self.assertRaisesRegex(PushValidationError, "command parameters"):
            load_csv(path, set_name="candidate-a")

    def test_non_numeric_metric_is_rejected(self) -> None:
        path = self.write_csv("ref,correctness\nq1,high\n")

        with self.assertRaisesRegex(PushValidationError, "must be numeric"):
            load_csv(path, set_name="candidate-a")


class CatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = FakeClient()
        self.catalog = Catalog("", client=self.client)

    def test_create_project_is_idempotent(self) -> None:
        self.assertTrue(self.catalog.create_project("sprint-42"))
        self.assertFalse(self.catalog.create_project("sprint-42"))
        self.assertEqual(self.client.calls, [("create_project", "sprint-42")])

    def test_create_experiment_rejects_hypothesis_change(self) -> None:
        self.client.experiments[("sprint-42", "prompt-test")] = {
            "name": "prompt-test",
            "hypothesis": "Original",
        }

        with self.assertRaisesRegex(PushValidationError, "different hypothesis"):
            self.catalog.create_experiment("sprint-42", "prompt-test", "Changed")

    def test_push_metrics_posts_each_result(self) -> None:
        self.client.experiments[("sprint-42", "prompt-test")] = {
            "name": "prompt-test",
            "hypothesis": "Candidate improves correctness.",
        }

        report = self.catalog.push_metrics(
            project="sprint-42",
            experiment="prompt-test",
            set_name="candidate-a",
            results=[{"ref": "q1", "metrics": {"correctness": 0.9}}],
        )

        self.assertEqual(report.result_count, 1)
        self.assertEqual(self.client.results[0][2]["set"], "candidate-a")

    def test_push_metrics_supports_retrieval_values(self) -> None:
        self.client.experiments[("sprint-42", "prompt-test")] = {
            "name": "prompt-test",
            "hypothesis": "Candidate improves correctness.",
        }

        self.catalog.push_metrics(
            project="sprint-42",
            experiment="prompt-test",
            set_name="candidate-a",
            results=[
                {
                    "ref": "q1",
                    "metrics": {
                        "retrieval_f1": {
                            "found": ["doc-1", "doc-2"],
                            "expected": ["doc-2", "doc-3"],
                        }
                    },
                }
            ],
        )

        self.assertEqual(
            self.client.results[0][2]["metrics"]["retrieval_f1"]["found"],
            ["doc-1", "doc-2"],
        )

    def test_push_requires_existing_experiment(self) -> None:
        with self.assertRaisesRegex(PushValidationError, "create it before pushing"):
            self.catalog.push_metrics(
                project="sprint-42",
                experiment="prompt-test",
                set_name="candidate-a",
                results=[{"ref": "q1", "metrics": {"correctness": 0.9}}],
            )

    def test_dry_run_performs_no_writes(self) -> None:
        self.client.experiments[("sprint-42", "prompt-test")] = {
            "name": "prompt-test",
            "hypothesis": "Candidate improves correctness.",
        }

        report = self.catalog.push_metrics(
            project="sprint-42",
            experiment="prompt-test",
            set_name="candidate-a",
            results=[{"ref": "q1", "metrics": {"correctness": 0.9}}],
            dry_run=True,
        )

        self.assertTrue(report.dry_run)
        self.assertEqual(self.client.results, [])

    def test_in_memory_classification_requires_compatible_metric_name(self) -> None:
        self.client.experiments[("sprint-42", "prompt-test")] = {
            "name": "prompt-test",
            "hypothesis": "Candidate improves correctness.",
        }

        with self.assertRaisesRegex(PushValidationError, "metric name must contain"):
            self.catalog.push_metrics(
                project="sprint-42",
                experiment="prompt-test",
                set_name="candidate-a",
                results=[{"ref": "q1", "metrics": {"quality": "t+"}}],
                dry_run=True,
            )


class CatalogClientTests(unittest.TestCase):
    @patch("experiment_catalog.client.urlopen")
    def test_token_is_sent_as_bearer_authorization_header(self, urlopen: MagicMock) -> None:
        response = MagicMock()
        response.status = 200
        response.read.return_value = b"[]"
        urlopen.return_value.__enter__.return_value = response

        CatalogClient("https://catalog.example/api", token="test-token").list_projects()

        request = urlopen.call_args.args[0]
        self.assertEqual(request.get_header("Authorization"), "Bearer test-token")


if __name__ == "__main__":
    unittest.main()
