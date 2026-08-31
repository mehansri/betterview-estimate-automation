export type CombinationSuggestion = {
  styleCode: string;
  overallWidth: number;
  liteWidth: number;
  height: number;
};

type SuggestibleStyle = {
  code: string;
  size_ranges?: Array<{
    label?: string | null;
    ranges: Array<{ min: number; max: number }>;
  }>;
};

function rangeRowFits(row: NonNullable<SuggestibleStyle["size_ranges"]>[number], width: number, height: number) {
  for (let index = 0; index + 1 < row.ranges.length; index += 2) {
    const widthRange = row.ranges[index];
    const heightRange = row.ranges[index + 1];
    if (widthRange.min <= width && width <= widthRange.max && heightRange.min <= height && height <= heightRange.max) {
      return true;
    }
  }
  return false;
}

export function getCombinationSuggestion(
  style: SuggestibleStyle | undefined,
  width: number | string,
  height: number | string,
): CombinationSuggestion | null {
  const overallWidth = Number(width);
  const windowHeight = Number(height);

  if (
    !style ||
    !Number.isFinite(overallWidth) ||
    !Number.isFinite(windowHeight) ||
    overallWidth <= 32 ||
    overallWidth % 2 !== 0
  ) {
    return null;
  }

  const liteWidth = overallWidth / 2;
  const sizeRows = (style.size_ranges || []).filter((row) => {
    const label = (row.label || "").toLowerCase();
    return label.includes("double") || label.includes("triple") || label.includes("tri-pane");
  });
  if (!sizeRows.length || sizeRows.some((row) => rangeRowFits(row, overallWidth, windowHeight))) return null;
  if (!sizeRows.some((row) => rangeRowFits(row, liteWidth, windowHeight))) return null;

  return { styleCode: style.code, overallWidth, liteWidth, height: windowHeight };
}
