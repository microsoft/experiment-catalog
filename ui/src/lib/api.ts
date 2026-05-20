/**
 * Centralized API service layer.
 *
 * Every fetch call that the UI makes goes through this module.  Components
 * import individual functions instead of constructing URLs and calling fetch
 * directly, which makes the code easier to test, refactor, and change.
 */
import { apiPrefix } from "./config";

// ── Helpers ─────────────────────────────────────────────────────────────────

function url(path: string): string {
    return `${apiPrefix}${path}`;
}

const JSON_HEADERS = {
    "Content-Type": "application/json",
} as const;

// ── Auth ────────────────────────────────────────────────────────────────────

export interface AuthStatus {
    username?: string;
    is_required?: boolean;
}

function toLocalReturnUrl(returnUrl: string): string {
    // Server accepts local URLs; convert absolute same-origin URLs to local paths.
    if (returnUrl.startsWith("/")) {
        return returnUrl;
    }

    if (typeof window === "undefined") {
        return "/";
    }

    try {
        const parsed = new URL(returnUrl, window.location.origin);
        if (parsed.origin === window.location.origin) {
            return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
        }
    } catch {
        // Ignore parse errors and fall through to a safe default.
    }

    return "/";
}

export async function getAuthStatus(): Promise<AuthStatus> {
    const response = await fetch(url("/auth/status"), {
        credentials: "include",
    });
    return response.json() as Promise<AuthStatus>;
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function getUiSettings(): Promise<UiSettings> {
    try {
        const response = await fetch(url("/api/settings"), {
            credentials: "include",
        });
        return response.json() as Promise<UiSettings>;
    } catch {
        return {};
    }
}

export function getLoginUrl(returnUrl: string): string {
    return `${apiPrefix}/auth/login?return-url=${encodeURIComponent(toLocalReturnUrl(returnUrl))}`;
}

// ── Fetch helper ────────────────────────────────────────────────────────────

async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(url(path), { credentials: "include" });
    if (response.status === 401) {
        // Clear stale cookie and redirect to login
        document.cookie =
            "auth_not_required=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        const returnUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        window.location.href = getLoginUrl(returnUrl);
        throw new Error("Authentication required");
    }
    return response.json() as Promise<T>;
}

// ── Projects ────────────────────────────────────────────────────────────────

export async function listProjects(): Promise<Project[]> {
    return fetchJson<Project[]>("/api/projects");
}

export async function createProject(name: string): Promise<Response> {
    return fetch(url("/api/projects"), {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
        credentials: "include",
    });
}

// ── Experiments ─────────────────────────────────────────────────────────────

export async function listExperiments(
    projectName: string,
): Promise<Experiment[]> {
    return fetchJson<Experiment[]>(
        `/api/projects/${projectName}/experiments`,
    );
}

export async function getExperiment(
    projectName: string,
    experimentName: string,
): Promise<Experiment> {
    return fetchJson<Experiment>(
        `/api/projects/${projectName}/experiments/${experimentName}`,
    );
}

export async function createExperiment(
    projectName: string,
    name: string,
    hypothesis: string,
): Promise<Response> {
    return fetch(url(`/api/projects/${projectName}/experiments`), {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, hypothesis }),
        credentials: "include",
    });
}

// ── Download ────────────────────────────────────────────────────────────────

export function getExperimentDownloadUrl(
    projectName: string,
    experimentName: string,
): string {
    return url(
        `/api/projects/${projectName}/experiments/${experimentName}/download`,
    );
}

// ── Comparison ──────────────────────────────────────────────────────────────

export async function getComparison(
    projectName: string,
    experimentName: string,
    tagFilters?: string,
): Promise<Comparison> {
    const qs = tagFilters ? `?${tagFilters}` : "";
    return fetchJson<Comparison>(
        `/api/projects/${projectName}/experiments/${experimentName}/compare${qs}`,
    );
}

export async function getComparisonByRef(
    projectName: string,
    experimentName: string,
    setName: string,
    tagFilters?: string,
): Promise<ComparisonByRef> {
    const qs = tagFilters ? `?${tagFilters}` : "";
    return fetchJson<ComparisonByRef>(
        `/api/projects/${projectName}/experiments/${experimentName}/sets/${setName}/compare-by-ref${qs}`,
    );
}

// ── Sets / Results ──────────────────────────────────────────────────────────

export async function getSets(
    projectName: string,
    experimentName: string,
): Promise<string[]> {
    return fetchJson<string[]>(
        `/api/projects/${projectName}/experiments/${experimentName}/sets`,
    );
}

export async function getSetResults(
    projectName: string,
    experimentName: string,
    setName: string,
): Promise<Result[]> {
    return fetchJson<Result[]>(
        `/api/projects/${projectName}/experiments/${experimentName}/sets/${setName}`,
    );
}

// ── Baselines ───────────────────────────────────────────────────────────────

export async function useProjectBaseline(
    projectName: string,
    experimentName: string,
): Promise<Response> {
    return fetch(
        url(
            `/api/projects/${projectName}/experiments/${experimentName}/sets/:project/baseline`,
        ),
        {
            method: "PATCH",
            headers: JSON_HEADERS,
            credentials: "include",
        },
    );
}

export async function setAsProjectBaseline(
    projectName: string,
    experimentName: string,
): Promise<Response> {
    return fetch(
        url(
            `/api/projects/${projectName}/experiments/${experimentName}/baseline`,
        ),
        {
            method: "PATCH",
            headers: JSON_HEADERS,
            credentials: "include",
        },
    );
}

export async function setAsExperimentBaseline(
    projectName: string,
    experimentName: string,
    setName: string,
): Promise<Response> {
    return fetch(
        url(
            `/api/projects/${projectName}/experiments/${experimentName}/sets/${setName}/baseline`,
        ),
        {
            method: "PATCH",
            headers: JSON_HEADERS,
            credentials: "include",
        },
    );
}

// ── Analysis ────────────────────────────────────────────────────────────────

export async function computeStatistics(
    projectName: string,
    experimentName: string,
): Promise<Response> {
    return fetch(url("/api/analysis/statistics"), {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
            project: projectName,
            experiment: experimentName,
        }),
        credentials: "include",
    });
}

export interface MeaningfulTagsRequest {
    project: string;
    experiment: string;
    set: string;
    metric: string;
    compare_to: string;
    exclude_tags?: string[];
}

export interface MeaningfulTagsResponse {
    tags: { impact: number; diff: number; tag: string; count?: number | null }[];
}

export async function getMeaningfulTags(
    body: MeaningfulTagsRequest,
): Promise<MeaningfulTagsResponse> {
    const response = await fetch(url("/api/analysis/meaningful-tags"), {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
        credentials: "include",
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<MeaningfulTagsResponse>;
}

// ── Tags ────────────────────────────────────────────────────────────────────

export async function listTags(projectName: string): Promise<string[]> {
    return fetchJson<string[]>(`/api/projects/${projectName}/tags`);
}

// ── Annotations ─────────────────────────────────────────────────────────────

export async function addAnnotation(
    projectName: string,
    experimentName: string,
    set: string,
    annotation: Annotation,
): Promise<Response> {
    return fetch(
        url(
            `/api/projects/${projectName}/experiments/${experimentName}/results`,
        ),
        {
            method: "POST",
            headers: JSON_HEADERS,
            body: JSON.stringify({ set, annotations: [annotation] }),
            credentials: "include",
        },
    );
}
