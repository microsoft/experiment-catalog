interface Experiment {
    name: string;
    hypothesis?: string;
    created: Date;
    annotations?: Annotation[];
    emoji?: string | null;
    note?: string | null;
}