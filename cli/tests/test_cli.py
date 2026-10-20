from __future__ import annotations

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

from experiment_catalog.cli import main
from experiment_catalog.models import PushReport


class CliTests(unittest.TestCase):
    @patch("experiment_catalog.cli.Catalog")
    def test_create_project_command(self, catalog_type: Mock) -> None:
        catalog_type.return_value.create_project.return_value = True
        output = io.StringIO()

        with redirect_stdout(output):
            exit_code = main(
                [
                    "--base-url",
                    "http://localhost:6010/api",
                    "create-project",
                    "sprint-42",
                ]
            )

        self.assertEqual(exit_code, 0)
        self.assertEqual(json.loads(output.getvalue())["created"], True)
        catalog_type.return_value.create_project.assert_called_once_with("sprint-42")

    @patch("experiment_catalog.cli.Catalog")
    def test_create_experiment_command(self, catalog_type: Mock) -> None:
        catalog_type.return_value.create_experiment.return_value = True

        exit_code = main(
            [
                "--base-url",
                "http://localhost:6010/api",
                "create-experiment",
                "--project",
                "sprint-42",
                "prompt-test",
                "--hypothesis",
                "Candidate improves quality.",
            ]
        )

        self.assertEqual(exit_code, 0)
        catalog_type.return_value.create_experiment.assert_called_once_with(
            "sprint-42",
            "prompt-test",
            "Candidate improves quality.",
        )

    @patch("experiment_catalog.cli.Catalog")
    def test_push_command_uses_catalog_push(self, catalog_type: Mock) -> None:
        catalog_type.return_value.push_csv.return_value = PushReport(
            project="sprint-42",
            experiment="prompt-test",
            set_name="candidate-a",
            result_count=2,
            dry_run=True,
        )

        exit_code = main(
            [
                "--base-url",
                "http://localhost:6010/api",
                "push",
                "results.csv",
                "--project",
                "sprint-42",
                "--experiment",
                "prompt-test",
                "--set",
                "candidate-a",
                "--dry-run",
            ]
        )

        self.assertEqual(exit_code, 0)
        catalog_type.return_value.push_csv.assert_called_once_with(
            "results.csv",
            project="sprint-42",
            experiment="prompt-test",
            set_name="candidate-a",
            dry_run=True,
        )


if __name__ == "__main__":
    unittest.main()
