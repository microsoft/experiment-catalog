import tempfile
import unittest
from pathlib import Path

from aggregate_runner import run


class AggregateRunnerTests(unittest.TestCase):
    def test_filename_becomes_metric_name(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "efficiency.py").write_text(
                "def aggregate(results):\n"
                '    return sum(r["metrics"]["score"] for r in results) / len(results)\n',
                encoding="utf-8",
            )

            response = run(
                folder,
                {
                    "groups": [
                        {
                            "id": "set-a",
                            "results": [
                                {"ref": "q1", "metrics": {"score": 2}},
                                {"ref": "q2", "metrics": {"score": 4}},
                            ],
                        }
                    ]
                },
            )

        self.assertEqual(response["groups"]["set-a"]["efficiency"], 3)

    def test_private_helper_files_are_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "_helper.py").write_text("VALUE = 2\n", encoding="utf-8")
            (folder / "score.py").write_text(
                "from _helper import VALUE\n"
                "def aggregate(results):\n"
                "    return VALUE\n",
                encoding="utf-8",
            )

            response = run(
                folder,
                {"groups": [{"id": "set-a", "results": []}]},
            )

        self.assertEqual(response["groups"]["set-a"], {"score": 2})

    def test_missing_function_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "score.py").write_text("VALUE = 2\n", encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "must define aggregate"):
                run(folder, {"groups": []})

    def test_non_finite_return_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            (folder / "score.py").write_text(
                'def aggregate(results):\n    return float("inf")\n',
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "finite number"):
                run(folder, {"groups": [{"id": "set-a", "results": []}]})


if __name__ == "__main__":
    unittest.main()
