import { getProjectLinks } from "./api";

type LinkEntity = { project?: string; experiment?: string; set?: string };
export type LinkContext = Record<string, string | null | undefined>;

export function linkContext(
    entity: LinkEntity | undefined | null,
    baseline?: LinkEntity | null,
    result?: Result,
    ref?: string,
): LinkContext {
    return {
        project: entity?.project,
        experiment: entity?.experiment,
        set: entity?.set,
        ref: ref ?? result?.ref,
        gt: result?.ground_truth_uri,
        inf: result?.inference_uri,
        eval: result?.evaluation_uri,
        "baseline-project": baseline?.project,
        "baseline-experiment": baseline?.experiment,
        "baseline-set": baseline?.set,
    };
}

export function mergeCustomLinks(defaults: CustomLink[], project: CustomLink[]): CustomLink[] {
    const links = new Map(defaults.map((link) => [JSON.stringify([link.scope, link.name]), link]));
    for (const link of project) {
        links.set(JSON.stringify([link.scope, link.name]), link);
    }
    return [...links.values()];
}

export async function loadCustomLinks(
    projects: string[],
    defaults: CustomLink[],
): Promise<Record<string, CustomLink[]>> {
    const entries = await Promise.all([...new Set(projects)].map(async (project) => {
        try {
            return [project, mergeCustomLinks(defaults, await getProjectLinks(project))] as const;
        } catch (error) {
            console.warn(`Could not load custom links for ${project}; using deployment defaults.`, error);
            return [project, defaults] as const;
        }
    }));
    return Object.fromEntries(entries);
}

export function expandLink(url: string, context: LinkContext): string | undefined {
    let missing = false;
    const expanded = url.replace(/\{([^{}]*)\}/g, (_, key: string) => {
        const value = context[key];
        if (value == null || value === "") {
            missing = true;
            return "";
        }
        return encodeURIComponent(value);
    });
    if (missing || /[{}]/.test(expanded)) return undefined;
    try {
        const parsed = new URL(expanded);
        return parsed.protocol === "https:" || parsed.protocol === "http:" ? expanded : undefined;
    } catch {
        return undefined;
    }
}
