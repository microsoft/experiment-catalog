/**
 * Mock API response payloads for Playwright tests.
 *
 * Shapes match the TypeScript interfaces consumed by the Svelte UI.
 */

// ── Auth ────────────────────────────────────────────────────────────────────

export const authNotRequired = { is_required: false };
export const authRequired = { is_required: true };
export const authAuthenticated = { username: 'testuser', is_required: true };

// ── Projects ────────────────────────────────────────────────────────────────

export const projectsList = [
  { name: 'alpha-project' },
  { name: 'beta-project' },
  { name: 'gamma-project' },
];

// ── Experiments ─────────────────────────────────────────────────────────────

export const experimentsList = [
  {
    name: 'exp-001',
    hypothesis: 'Increasing context window improves accuracy',
    created: '2026-01-15T10:00:00Z',
    annotations: [],
  },
  {
    name: 'exp-002',
    hypothesis: 'Fine-tuning on domain data reduces latency',
    created: '2026-02-01T14:30:00Z',
    annotations: [{ text: 'Initial run', uri: null }],
  },
];

export const singleExperiment = {
  name: 'exp-001',
  hypothesis: 'Increasing context window improves accuracy',
  created: '2026-01-15T10:00:00Z',
  annotations: [],
};

// ── Metric definitions ──────────────────────────────────────────────────────

export const metricDefinitions: Record<string, object> = {
  accuracy: {
    name: 'accuracy',
    min: 0,
    max: 1,
    aggregate_function: 'Average',
    order: 1,
    tags: [],
  },
  latency: {
    name: 'latency',
    min: 0,
    max: 10000,
    aggregate_function: 'Average',
    order: 2,
    tags: [],
  },
  cost: {
    name: 'cost',
    min: 0,
    max: 100,
    aggregate_function: 'Cost',
    order: 3,
    tags: [],
  },
};

// ── Results / metrics ───────────────────────────────────────────────────────

function makeMetric(
  value: number,
  count = 50,
  stdDev = 0.05,
  tags: string[] = [],
  extras: { p_value?: number; ci_lower?: number; ci_upper?: number } = {},
) {
  return {
    count,
    value,
    normalized: value,
    std_dev: stdDev,
    tags,
    ...extras,
  };
}

export const baselineResult = {
  ref: 'ref-1',
  set: 'baseline',
  inference_uri: null,
  evaluation_uri: null,
  desc: 'Baseline run',
  is_baseline: true,
  created: '2026-01-10T08:00:00Z',
  runtime: 120,
  metrics: {
    accuracy: makeMetric(0.82),
    latency: makeMetric(450),
    cost: makeMetric(12.5),
  },
  annotations: [],
};

export const setAResult = {
  ref: 'ref-1',
  set: 'set-a',
  inference_uri: 'https://example.com/inference/set-a',
  evaluation_uri: 'https://example.com/eval/set-a',
  desc: 'Set A run',
  is_baseline: false,
  created: '2026-01-20T09:00:00Z',
  runtime: 95,
  metrics: {
    accuracy: makeMetric(0.87, 50, 0.05, [], { p_value: 0.03, ci_lower: 0.02, ci_upper: 0.08 }),
    latency: makeMetric(380, 50, 25.0, [], { p_value: 0.12, ci_lower: -90, ci_upper: -50 }),
    cost: makeMetric(14.2),
  },
  annotations: [{ text: 'Run note for set-a', uri: 'https://example.com/notes' }],
};

export const setBResult = {
  ref: 'ref-1',
  set: 'set-b',
  inference_uri: null,
  evaluation_uri: null,
  desc: 'Set B run',
  is_baseline: false,
  created: '2026-01-25T11:00:00Z',
  runtime: 110,
  metrics: {
    accuracy: makeMetric(0.85),
    latency: makeMetric(420),
    cost: makeMetric(11.8),
  },
  annotations: [],
};

// ── Comparison (aggregate by set) ───────────────────────────────────────────

export const comparison = {
  metric_definitions: metricDefinitions,
  project_baseline: {
    project: 'alpha-project',
    experiment: 'exp-baseline',
    set: 'baseline',
    result: baselineResult,
  },
  experiment_baseline: {
    project: 'alpha-project',
    experiment: 'exp-001',
    set: 'baseline',
    result: baselineResult,
  },
  sets: [
    {
      project: 'alpha-project',
      experiment: 'exp-001',
      set: 'set-a',
      result: setAResult,
    },
    {
      project: 'alpha-project',
      experiment: 'exp-001',
      set: 'set-b',
      result: setBResult,
    },
  ],
};

// ── Comparison by ref (drill-down) ──────────────────────────────────────────

export const comparisonByRef = {
  metric_definitions: metricDefinitions,
  project_baseline: {
    project: 'alpha-project',
    experiment: 'exp-baseline',
    set: 'baseline',
    results: { 'ref-1': baselineResult },
  },
  experiment_baseline: {
    project: 'alpha-project',
    experiment: 'exp-001',
    set: 'baseline',
    results: { 'ref-1': baselineResult },
  },
  experiment_set: {
    project: 'alpha-project',
    experiment: 'exp-001',
    set: 'set-a',
    results: { 'ref-1': setAResult },
  },
};

// ── Set iterations ──────────────────────────────────────────────────────────

export const setIterations = [setAResult];

export const baselineIterations = [baselineResult];

// ── Tags ────────────────────────────────────────────────────────────────────

export const tagsList = ['region:us-east', 'model:gpt-4', 'prompt:v2'];

// ── Meaningful tags ─────────────────────────────────────────────────────────

export const meaningfulTagsResponse = {
  tags: [
    { impact: 0.15, diff: 0.08, tag: 'model:gpt-4', count: 25 },
    { impact: -0.05, diff: -0.03, tag: 'prompt:v2', count: 18 },
  ],
};
