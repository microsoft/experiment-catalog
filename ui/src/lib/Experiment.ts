interface Experiment {
    name: string;
    hypothesis?: string;
    created: Date;
    annotations?: Annotation[];
}