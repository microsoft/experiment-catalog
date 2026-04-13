interface Result {
    ref?: string;
    set?: string;
    inference_uri?: string;
    evaluation_uri?: string;
    desc?: string;
    metrics?: Record<string, Metric>;
    annotations?: Annotation[];
    is_baseline: boolean;
    created: Date;
    runtime?: number;
}

type ResultFilter = (result: Result) => boolean;