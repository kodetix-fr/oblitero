import { clamp } from './math.js';

// The box that holds everything that is not transparent in an RGBA image, or null when there is nothing.
export function inkBounds({ data, width, height }, alphaMin = 8) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < alphaMin) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right < 0 ? null : { left, top, right: right + 1, bottom: bottom + 1 };
}

// A scan or a photo of a signature on white paper: the paper becomes transparent, the ink keeps its color, and the pixels in
// between become partly transparent so that the edge stays smooth.
export function whiteToTransparent({ data }, paper = 245, ink = 160) {
  for (let i = 0; i < data.length; i += 4) {
    const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const keep = clamp((paper - luminance) / (paper - ink), 0, 1);
    data[i + 3] = Math.round(data[i + 3] * keep);
  }
  return { data };
}
