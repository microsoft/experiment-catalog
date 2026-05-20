/**
 * Centralized configuration for the UI.
 *
 * All components import `apiPrefix` instead of computing it inline.
 * This makes the base URL easy to mock in tests and change in one place.
 */
export const apiPrefix: string =
  typeof window !== "undefined"
    ? (() => {
        // Development: use local API server
        if (window.location.hostname === "localhost") {
          return "http://localhost:6010";
        }

        // Production: derive base path from current URL
        // Extract everything before the first known backend route prefix.
        // This supports both single-segment (/catalog) and multi-segment (/api/v2/catalog) virtual directories.
        const segments = window.location.pathname.split("/").filter(Boolean);
        const knownRoutePrefixes = ["api", "auth"];
        
        for (let i = 0; i < segments.length; i++) {
          if (knownRoutePrefixes.includes(segments[i])) {
            return i > 0 ? "/" + segments.slice(0, i).join("/") : "";
          }
        }
        
        // Fallback: if no known route prefix found, use first segment as vdir
        return segments.length > 0 ? `/${segments[0]}` : "";
      })()
    : "";
