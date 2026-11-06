import { describe, expect, it, vi } from "vitest";
import { expandLink, linkContext, loadCustomLinks, mergeCustomLinks } from "./customLinks";
import { getProjectLinks } from "./api";

vi.mock("./api", () => ({ getProjectLinks: vi.fn() }));

describe("custom links", () => {
    it("overrides by scope and exact name, retaining unrelated defaults and project ordering", () => {
        const defaults: CustomLink[] = [
            { scope: "ref", name: "cow", url: "https://default.example" },
            { scope: "set", name: "cow", url: "https://set.example" },
        ];
        const project: CustomLink[] = [
            { scope: "ref", name: "cow", url: "https://override.example" },
            { scope: "ref", name: "new", url: "https://new.example" },
        ];
        expect(mergeCustomLinks(defaults, project)).toEqual([project[0], defaults[1], project[1]]);
        expect(mergeCustomLinks(defaults, [])).toEqual(defaults);
    });

    it("uses each owning project, fetching repeated projects only once", async () => {
        vi.mocked(getProjectLinks).mockImplementation(async (project) => [
            { scope: "ref", name: "cow", url: `https://${project}.example` },
        ]);
        const links = await loadCustomLinks(["current", "foreign", "current"], []);
        expect(getProjectLinks).toHaveBeenCalledTimes(2);
        expect(links.current[0].url).toBe("https://current.example");
        expect(links.foreign[0].url).toBe("https://foreign.example");
    });

    it("falls back per project without discarding successful overrides or deployment defaults", async () => {
        const defaults: CustomLink[] = [
            { scope: "ref", name: "cow", url: "https://default.example/{ref}" },
        ];
        vi.mocked(getProjectLinks).mockImplementation(async (project) => {
            if (project === "unavailable") throw new Error("HTTP 500");
            return [{ ...defaults[0], url: "https://project.example/{ref}" }];
        });
        const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
        try {
            const links = await loadCustomLinks(["unavailable", "available"], defaults);
            expect(links.unavailable).toEqual(defaults);
            expect(links.available[0].url).toBe("https://project.example/{ref}");
            expect(defaults[0].url).toBe("https://default.example/{ref}");
            expect(warning).toHaveBeenCalledOnce();
        } finally {
            warning.mockRestore();
        }
    });

    it("encodes values once, replaces repeated tokens, and does not recursively expand values", () => {
        expect(expandLink("https://tools.example/{ref}?again={ref}&inf={inf}", {
            ref: "a/b & {set}",
            inf: "https://artifacts.example/a?x=1&y=two words",
        })).toBe(
            "https://tools.example/a%2Fb%20%26%20%7Bset%7D?again=a%2Fb%20%26%20%7Bset%7D&inf=https%3A%2F%2Fartifacts.example%2Fa%3Fx%3D1%26y%3Dtwo%20words",
        );
    });

    it("uses row identity and the active baseline rather than the selected project's identity", () => {
        const context = linkContext(
            { project: "foreign", experiment: "other", set: "reference" },
            { project: "target", experiment: "chosen", set: "chosen-set" },
            { ref: "item", inference_uri: "https://artifact.example", is_baseline: false, created: new Date() },
        );
        expect(expandLink(
            "https://tools.example/{project}/{experiment}/{set}/{ref}?baseline={baseline-project}/{baseline-experiment}/{baseline-set}",
            context,
        )).toBe("https://tools.example/foreign/other/reference/item?baseline=target/chosen/chosen-set");
        expect(context.inf).toBe("https://artifact.example");
    });

    it.each([
        ["https://tools.example/{inf}", {}],
        ["https://tools.example/{inf}", { inf: null }],
        ["https://tools.example/{ref}", { ref: "" }],
        ["https://tools.example/{unknown}", {}],
        ["https://tools.example/{ref", { ref: "item" }],
        ["javascript:alert(1)", {}],
        ["/relative", {}],
    ])("hides unavailable or unsafe links: %s", (url, context) => {
        expect(expandLink(url, context)).toBeUndefined();
    });
});
