from __future__ import annotations

import argparse
import json
import os
import sys
from collections.abc import Sequence

from .catalog import Catalog
from .client import CatalogApiError
from .models import PushValidationError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="experiment-catalog",
        description="Create and publish Experiment Catalog data.",
    )
    parser.add_argument(
        "--base-url",
        default=os.getenv("EXPERIMENT_CATALOG_BASE_URL"),
        help="catalog API base URL, including /api (or EXPERIMENT_CATALOG_BASE_URL)",
    )
    parser.add_argument(
        "--token",
        default=os.getenv("EXPERIMENT_CATALOG_TOKEN"),
        help=argparse.SUPPRESS,
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30,
        help="HTTP timeout in seconds",
    )

    commands = parser.add_subparsers(dest="command", required=True)

    create_project = commands.add_parser("create-project", help="create a project")
    create_project.add_argument("name")

    create_experiment = commands.add_parser(
        "create-experiment",
        help="create an experiment",
    )
    create_experiment.add_argument("--project", required=True)
    create_experiment.add_argument("name")
    create_experiment.add_argument("--hypothesis", required=True)

    push = commands.add_parser("push", help="push metrics from a CSV file")
    push.add_argument("csv_file")
    push.add_argument("--project", required=True)
    push.add_argument("--experiment", required=True)
    push.add_argument("--set", dest="set_name", required=True)
    push.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and inspect catalog state without writing",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if not args.base_url:
        parser.error("--base-url or EXPERIMENT_CATALOG_BASE_URL is required")

    try:
        catalog = Catalog(args.base_url, token=args.token, timeout=args.timeout)
        if args.command == "create-project":
            output = {
                "project": args.name,
                "created": catalog.create_project(args.name),
            }
        elif args.command == "create-experiment":
            output = {
                "project": args.project,
                "experiment": args.name,
                "created": catalog.create_experiment(
                    args.project,
                    args.name,
                    args.hypothesis,
                ),
            }
        else:
            output = catalog.push_csv(
                args.csv_file,
                project=args.project,
                experiment=args.experiment,
                set_name=args.set_name,
                dry_run=args.dry_run,
            ).to_dict()
    except PushValidationError as error:
        print(f"validation error: {error}", file=sys.stderr)
        return 2
    except CatalogApiError as error:
        print(f"catalog API error: {error}", file=sys.stderr)
        return 1

    print(json.dumps(output, indent=2))
    return 0
