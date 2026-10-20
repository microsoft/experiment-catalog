export const ELAPSED_TIME_FORMAT_TAG = "elapsed_time";

type FormatterOptions = {
  allowNegative?: boolean;
};

type MetricFormatter = (value: number, options?: FormatterOptions) => string;

const timeUnits = [
  { suffix: "d", milliseconds: 86_400_000 },
  { suffix: "h", milliseconds: 3_600_000 },
  { suffix: "m", milliseconds: 60_000 },
  { suffix: "s", milliseconds: 1_000 },
  { suffix: "ms", milliseconds: 1 },
] as const;

export const formatElapsedTime: MetricFormatter = (
  value,
  { allowNegative = false } = {},
) => {
  if (!Number.isFinite(value) || (value < 0 && !allowNegative)) return "-";

  const sign = value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);

  let precision = 1;
  if (absoluteValue >= timeUnits[0].milliseconds) {
    precision = timeUnits[1].milliseconds;
  } else if (absoluteValue >= timeUnits[1].milliseconds) {
    precision = timeUnits[2].milliseconds;
  } else if (absoluteValue >= timeUnits[2].milliseconds) {
    precision = timeUnits[3].milliseconds;
  }

  const roundedValue = Math.round(absoluteValue / precision) * precision;
  const largestUnitIndex = timeUnits.findIndex(
    ({ milliseconds }) => roundedValue >= milliseconds,
  );
  const startIndex =
    largestUnitIndex === -1 ? timeUnits.length - 1 : largestUnitIndex;
  const largestUnit = timeUnits[startIndex];
  const largestValue = Math.floor(roundedValue / largestUnit.milliseconds);
  const parts = [`${largestValue}${largestUnit.suffix}`];

  const smallerUnit = timeUnits[startIndex + 1];
  if (smallerUnit) {
    const remainder = roundedValue % largestUnit.milliseconds;
    const smallerValue = Math.floor(remainder / smallerUnit.milliseconds);
    if (smallerValue > 0) parts.push(`${smallerValue}${smallerUnit.suffix}`);
  }

  return sign + parts.join(" ");
};

const metricFormatters: Record<string, MetricFormatter> = {
  [ELAPSED_TIME_FORMAT_TAG]: formatElapsedTime,
};

export function hasMetricFormatter(
  tags: string[] | undefined,
  formatter: string,
): boolean {
  return tags?.includes(formatter) ?? false;
}

export function formatMetricValue(
  value: number,
  tags: string[] | undefined,
  fallback: (value: number) => string,
  options?: FormatterOptions,
): string {
  const formatterTag = tags?.find((tag) => metricFormatters[tag]);
  return formatterTag
    ? metricFormatters[formatterTag](value, options)
    : fallback(value);
}

export function formatNumber(value: number, fractionDigits = 3): string {
  if (!Number.isFinite(value)) return "-";

  return value.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}
