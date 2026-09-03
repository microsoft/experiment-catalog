#!/usr/bin/env python3

import importlib.util
import json
import math
import os
import re
import sys
from contextlib import redirect_stdout
from pathlib import Path

NAME_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]+$")
MAX_NAME_LENGTH = 100


def load_functions(folder: Path):
    functions = {}
    for path in sorted(folder.glob("*.py")):
        if path.name.startswith("_"):
            continue
        metric_name = path.stem
        if len(metric_name) > MAX_NAME_LENGTH or not NAME_PATTERN.fullmatch(
            metric_name
        ):
            raise ValueError(f"invalid aggregate metric filename: {path.name}")

        spec = importlib.util.spec_from_file_location(
            f"experiment_catalog_aggregate_{metric_name}",
            path,
        )
        if spec is None or spec.loader is None:
            raise ValueError(f"cannot load aggregate function: {path.name}")
        module = importlib.util.module_from_spec(spec)
        with redirect_stdout(sys.stderr):
            spec.loader.exec_module(module)
        aggregate = getattr(module, "aggregate", None)
        if not callable(aggregate):
            raise ValueError(f"{path.name} must define aggregate(results)")
        functions[metric_name] = aggregate
    return functions


def run(folder: Path, payload):
    folder_string = str(folder.resolve())
    if folder_string not in sys.path:
        sys.path.insert(0, folder_string)
    functions = load_functions(folder)
    output = {}
    for group in payload.get("groups", []):
        group_id = group["id"]
        results = group["results"]
        metrics = {}
        for metric_name, aggregate in functions.items():
            try:
                with redirect_stdout(sys.stderr):
                    value = aggregate(results)
            except Exception as error:
                raise RuntimeError(f"{metric_name}: {error}") from error
            if value is None:
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise TypeError(
                    f"{metric_name}: aggregate must return a number or None"
                )
            if not math.isfinite(value):
                raise ValueError(
                    f"{metric_name}: aggregate must return a finite number"
                )
            metrics[metric_name] = value
        output[group_id] = metrics
    return {"groups": output}


def main():
    if hasattr(os, "setsid"):
        os.setsid()
    if len(sys.argv) != 2:
        raise ValueError("aggregate function folder argument is required")
    folder = Path(sys.argv[1])
    if not folder.is_dir():
        raise ValueError(f"aggregate function folder does not exist: {folder}")
    payload = json.load(sys.stdin)
    json.dump(run(folder, payload), sys.stdout, allow_nan=False, separators=(",", ":"))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
