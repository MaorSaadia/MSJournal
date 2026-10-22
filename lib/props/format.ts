import { D } from "@/lib/journal/processing";

/** Display rounding only; rule checks must use the original precise value. */
export function propPercent(value: string) {
  return `${new D(value).toDecimalPlaces(2).toFixed()}%`;
}
