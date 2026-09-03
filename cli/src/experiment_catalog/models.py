from __future__ import annotations

import csv
import math
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]+$")
MAX_NAME_LENGTH = 100
CLASSIFICATIONS = {"t+", "t-", "f+", "f-"}
CLASSIFICATION_METRIC_INDICATORS = ("accuracy", "precision", "recall", "f1")
MAX_RETRIEVAL_ITEMS = 10_000
MAX_RETRIEVAL_ID_LENGTH = 500
URI_COLUMNS = ("ground_truth_uri", "inference_uri", "evaluation_uri")
RESERVED_COLUMNS = {"ref", *URI_COLUMNS}
DISALLOWED_COLUMNS = {"project", "experiment", "set", "metrics"}


class PushValidationError(ValueError):
    """Raised when pushed metric data is invalid."""


@dataclass(frozen=True)
class PushReport:
    project: str
    experiment: str
    set_name: str
    result_count: int
    dry_run: bool

    def to_dict(self) -> dict[str, Any]:
        return {
            "project": self.project,
            "experiment": self.experiment,
            "set": self.set_name,
            "result_count": self.result_count,
            "dry_run": self.dry_run,
        }


def load_csv(path: str | Path, *, set_name: str) -> tuple[dict[str, Any], ...]:
    csv_path = Path(path)
    if not csv_path.is_file():
        raise PushValidationError(f"CSV file not found: {csv_path}")

    try:
        with csv_path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            metric_columns = _validate_headers(reader.fieldnames)
            results = tuple(
                _csv_row_to_result(row, row_number, metric_columns, set_name)
                for row_number, row in enumerate(reader, start=2)
            )
    except (OSError, csv.Error) as error:
        raise PushValidationError(f"cannot read {csv_path}: {error}") from error

    if not results:
        raise PushValidationError("CSV file must contain at least one result row")
    return results


def validate_results(
    results: Iterable[Mapping[str, Any]],
    *,
    set_name: str,
) -> tuple[dict[str, Any], ...]:
    validated = tuple(
        _validate_result(dict(result), row_number, set_name)
        for row_number, result in enumerate(results, start=1)
    )
    if not validated:
        raise PushValidationError("results must contain at least one result")
    return validated


def validate_name(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise PushValidationError(f"{label} must be a non-empty string")
    if len(value) > MAX_NAME_LENGTH or not NAME_PATTERN.fullmatch(value):
        raise PushValidationError(
            f"{label} must be at most {MAX_NAME_LENGTH} characters and contain only "
            "letters, digits, hyphens, underscores, periods, or colons"
        )
    return value


def _validate_headers(fieldnames: list[str] | None) -> tuple[str, ...]:
    if not fieldnames:
        raise PushValidationError("CSV file must contain a header row")
    normalized = [field.strip() for field in fieldnames]
    if normalized != fieldnames:
        raise PushValidationError("CSV headers cannot have surrounding whitespace")
    if any(not field for field in normalized):
        raise PushValidationError("CSV headers cannot be blank")
    if len(normalized) != len(set(normalized)):
        raise PushValidationError("CSV headers cannot contain duplicates")
    if "ref" not in normalized:
        raise PushValidationError("CSV must contain a ref column")

    disallowed = sorted(set(normalized) & DISALLOWED_COLUMNS)
    if disallowed:
        raise PushValidationError(
            "CSV target fields must be command parameters, not columns: " + ", ".join(disallowed)
        )

    metric_columns = tuple(field for field in normalized if field not in RESERVED_COLUMNS)
    if not metric_columns:
        raise PushValidationError("CSV must contain at least one metric column")
    for metric_name in metric_columns:
        validate_name(metric_name, f"metric column {metric_name!r}")
    return metric_columns


def _csv_row_to_result(
    row: dict[str | None, str | list[str] | None],
    row_number: int,
    metric_columns: tuple[str, ...],
    set_name: str,
) -> dict[str, Any]:
    if None in row:
        raise PushValidationError(f"CSV row {row_number} has more values than headers")

    ref = (row.get("ref") or "").strip()
    result: dict[str, Any] = {
        "ref": validate_name(ref, f"CSV row {row_number} ref"),
        "set": set_name,
    }
    for field in URI_COLUMNS:
        value = (row.get(field) or "").strip()
        if value:
            result[field] = value

    metrics: dict[str, int | float | str] = {}
    for metric_name in metric_columns:
        value = (row.get(metric_name) or "").strip()
        if value:
            metrics[metric_name] = _parse_csv_metric(value, row_number, metric_name)
    if not metrics:
        raise PushValidationError(f"CSV row {row_number} must contain a metric value")
    result["metrics"] = metrics
    return result


def _parse_csv_metric(value: str, row_number: int, metric_name: str) -> int | float | str:
    if value in CLASSIFICATIONS:
        _validate_classification_metric_name(
            metric_name,
            f"CSV row {row_number} metric {metric_name!r}",
        )
        return value
    try:
        number = float(value)
    except ValueError as error:
        raise PushValidationError(
            f"CSV row {row_number} metric {metric_name!r} must be numeric or a classification label"
        ) from error
    if not math.isfinite(number):
        raise PushValidationError(f"CSV row {row_number} metric {metric_name!r} must be finite")
    return int(number) if number.is_integer() else number


def _validate_result(
    result: dict[str, Any],
    row_number: int,
    set_name: str,
) -> dict[str, Any]:
    label = f"result {row_number}"
    allowed = {"ref", "set", "metrics", *URI_COLUMNS}
    unknown = sorted(set(result) - allowed)
    if unknown:
        raise PushValidationError(f"{label} contains unsupported fields: {', '.join(unknown)}")

    result["ref"] = validate_name(result.get("ref"), f"{label}.ref")
    supplied_set = result.get("set", set_name)
    if supplied_set != set_name:
        raise PushValidationError(f"{label}.set must match {set_name!r}")
    result["set"] = set_name

    for field in URI_COLUMNS:
        if field in result and (not isinstance(result[field], str) or not result[field].strip()):
            raise PushValidationError(f"{label}.{field} must be a non-empty string")

    metrics = result.get("metrics")
    if not isinstance(metrics, Mapping) or not metrics:
        raise PushValidationError(f"{label}.metrics must be a non-empty object")
    validated_metrics: dict[str, Any] = {}
    for metric_name, value in metrics.items():
        name = validate_name(metric_name, f"{label}.metrics key")
        if isinstance(value, Mapping):
            validated_metrics[name] = _validate_retrieval_value(
                value,
                f"{label}.metrics.{name}",
            )
            continue
        if isinstance(value, bool) or not (
            isinstance(value, (int, float)) or (isinstance(value, str) and value in CLASSIFICATIONS)
        ):
            raise PushValidationError(
                f"{label}.metrics.{name} must be numeric, a classification label, or retrieval data"
            )
        if isinstance(value, float) and not math.isfinite(value):
            raise PushValidationError(f"{label}.metrics.{name} must be finite")
        if isinstance(value, str):
            _validate_classification_metric_name(name, f"{label}.metrics.{name}")
        validated_metrics[name] = value
    result["metrics"] = validated_metrics
    return result


def _validate_classification_metric_name(metric_name: str, label: str) -> None:
    lowered_name = metric_name.casefold()
    if not any(indicator in lowered_name for indicator in CLASSIFICATION_METRIC_INDICATORS):
        raise PushValidationError(
            f"{label} uses a classification label, but the metric name must contain "
            "accuracy, precision, recall, or f1"
        )


def _validate_retrieval_value(value: Mapping[str, Any], label: str) -> dict[str, list[str]]:
    if set(value) != {"found", "expected"}:
        raise PushValidationError(f"{label} retrieval data requires exactly found and expected")
    validated: dict[str, list[str]] = {}
    for field in ("found", "expected"):
        items = value[field]
        if not isinstance(items, list) or any(
            not isinstance(item, str) or not item or len(item) > MAX_RETRIEVAL_ID_LENGTH
            for item in items
        ):
            raise PushValidationError(
                f"{label}.{field} must contain non-empty strings up to "
                f"{MAX_RETRIEVAL_ID_LENGTH} characters"
            )
        if len(items) > MAX_RETRIEVAL_ITEMS:
            raise PushValidationError(
                f"{label}.{field} cannot contain more than {MAX_RETRIEVAL_ITEMS} IDs"
            )
        if len(items) != len(set(items)):
            raise PushValidationError(f"{label}.{field} cannot contain duplicates")
        validated[field] = list(items)
    return validated
