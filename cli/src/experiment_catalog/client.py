from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


class CatalogApiError(RuntimeError):
    """Raised when the Experiment Catalog API rejects or cannot complete a request."""

    def __init__(self, method: str, url: str, status: int | None, detail: str):
        self.method = method
        self.url = url
        self.status = status
        self.detail = detail
        status_text = f" returned HTTP {status}" if status is not None else " failed"
        super().__init__(f"{method} {url}{status_text}: {detail}")


class CatalogClient:
    def __init__(
        self,
        base_url: str,
        *,
        token: str | None = None,
        timeout: float = 30,
    ):
        if not base_url or not base_url.strip():
            raise ValueError("base_url is required")
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def list_projects(self) -> list[dict[str, Any]]:
        return self._request_json("GET", "/projects")

    def create_project(self, name: str) -> None:
        self._request_json("POST", "/projects", {"name": name})

    def get_experiment(self, project: str, experiment: str) -> dict[str, Any] | None:
        path = f"/projects/{_segment(project)}/experiments/{_segment(experiment)}"
        return self._request_json("GET", path, allowed_statuses={200, 404})

    def create_experiment(self, project: str, name: str, hypothesis: str) -> None:
        path = f"/projects/{_segment(project)}/experiments"
        self._request_json(
            "POST",
            path,
            {"name": name, "hypothesis": hypothesis},
        )

    def add_result(self, project: str, experiment: str, result: dict[str, Any]) -> None:
        path = f"/projects/{_segment(project)}/experiments/{_segment(experiment)}/results"
        self._request_json("POST", path, result)

    def _request_json(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        *,
        allowed_statuses: set[int] = {200},
    ) -> Any:
        content = self._request_bytes(
            method,
            path,
            payload,
            allowed_statuses=allowed_statuses,
        )
        if content is None or not content:
            return None
        try:
            return json.loads(content)
        except json.JSONDecodeError as error:
            raise CatalogApiError(
                method,
                self.base_url + path,
                200,
                "response was not valid JSON",
            ) from error

    def _request_bytes(
        self,
        method: str,
        path: str,
        payload: Any | None = None,
        *,
        allowed_statuses: set[int] = {200},
    ) -> bytes | None:
        url = self.base_url + path
        headers = {"Accept": "application/json"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        data = None
        if payload is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(payload, separators=(",", ":")).encode("utf-8")

        request = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                status = response.status
                content = response.read()
        except HTTPError as error:
            status = error.code
            content = error.read()
            if status in allowed_statuses:
                return None
            detail = content.decode("utf-8", errors="replace") or error.reason
            raise CatalogApiError(method, url, status, detail) from error
        except URLError as error:
            raise CatalogApiError(method, url, None, str(error.reason)) from error

        if status not in allowed_statuses:
            detail = content.decode("utf-8", errors="replace")
            raise CatalogApiError(method, url, status, detail)
        return content


def _segment(value: str) -> str:
    return quote(value, safe="")
