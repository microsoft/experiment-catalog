from __future__ import annotations

from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

from .client import CatalogClient
from .models import (
    PushReport,
    PushValidationError,
    load_csv,
    validate_name,
    validate_results,
)


class Catalog:
    def __init__(
        self,
        base_url: str,
        *,
        token: str | None = None,
        timeout: float = 30,
        client: CatalogClient | None = None,
    ):
        self.client = client or CatalogClient(base_url, token=token, timeout=timeout)

    def create_project(self, name: str) -> bool:
        name = validate_name(name, "project")
        projects = self.client.list_projects()
        if any(project.get("name") == name for project in projects):
            return False
        self.client.create_project(name)
        return True

    def create_experiment(self, project: str, name: str, hypothesis: str) -> bool:
        project = validate_name(project, "project")
        name = validate_name(name, "experiment")
        if not isinstance(hypothesis, str) or not hypothesis.strip():
            raise PushValidationError("hypothesis must be a non-empty string")

        experiment = self.client.get_experiment(project, name)
        if experiment is not None:
            if experiment.get("hypothesis") != hypothesis:
                raise PushValidationError(
                    f"experiment {name!r} already exists with a different hypothesis"
                )
            return False
        self.client.create_experiment(project, name, hypothesis)
        return True

    def push_csv(
        self,
        csv_file: str | Path,
        *,
        project: str,
        experiment: str,
        set_name: str,
        dry_run: bool = False,
    ) -> PushReport:
        set_name = validate_name(set_name, "set")
        results = load_csv(csv_file, set_name=set_name)
        return self.push_metrics(
            project=project,
            experiment=experiment,
            set_name=set_name,
            results=results,
            dry_run=dry_run,
        )

    def push_metrics(
        self,
        *,
        project: str,
        experiment: str,
        set_name: str,
        results: Iterable[Mapping[str, Any]],
        dry_run: bool = False,
    ) -> PushReport:
        """Validate and push in-memory notebook results."""
        project = validate_name(project, "project")
        experiment = validate_name(experiment, "experiment")
        set_name = validate_name(set_name, "set")
        validated_results = validate_results(results, set_name=set_name)

        if self.client.get_experiment(project, experiment) is None:
            raise PushValidationError(
                f"experiment {experiment!r} does not exist in project {project!r}; "
                "create it before pushing metrics"
            )

        if not dry_run:
            for result in validated_results:
                self.client.add_result(project, experiment, result)

        return PushReport(
            project=project,
            experiment=experiment,
            set_name=set_name,
            result_count=len(validated_results),
            dry_run=dry_run,
        )
