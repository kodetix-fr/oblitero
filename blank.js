// The share of a page that may be inked for the page to count as blank, on a scale of 0 to 100 that the slider moves along:
// the thresholds are spread over four powers of ten, because scan noise, dust and a stamp differ by orders of magnitude.
export const MIN_INK = 0.00001;
export const MAX_INK = 0.1;
export const POSITIONS = 100;
export const DEFAULT_POSITION = 37;

export const thresholdAt = (position) => MIN_INK * (MAX_INK / MIN_INK) ** (position / POSITIONS);

// The ids of the pages that hold less ink than `threshold`. `items`: [{ id, ink }].
export const blankIds = (items, threshold) => new Set(items.filter((item) => item.ink < threshold).map((item) => item.id));
