/**
 * Centralized configuration for the UI.
 *
 * All components import `apiPrefix` instead of computing it inline.
 * This makes the base URL easy to mock in tests and change in one place.
 */
export const apiPrefix: string =
    typeof window !== "undefined" && window.location.hostname === "localhost"
        ? "http://localhost:6010"
        : "";
