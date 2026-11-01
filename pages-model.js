export function createPages(count) {
  return Array.from({ length: count }, (_, source) => ({ id: source, source, rotation: 0, redactions: [] }));
}

// Rectangles are fractions of the page as displayed, so a quarter turn of the page turns them too.
export function rotateRect({ x, y, w, h }, delta) {
  return delta > 0 ? { x: 1 - y - h, y: x, w: h, h: w } : { x: y, y: 1 - x - w, w: h, h: w };
}

export function rotatePages(pages, ids, delta) {
  return pages.map((page) =>
    ids.has(page.id)
      ? {
          ...page,
          rotation: (page.rotation + delta + 360) % 360,
          redactions: page.redactions.map((rect) => rotateRect(rect, delta)),
        }
      : page,
  );
}

export function removePages(pages, ids) {
  return pages.filter((page) => !ids.has(page.id));
}

export function movePages(pages, ids, step) {
  const next = pages.slice();
  if (step < 0) {
    for (let i = 1; i < next.length; i++) {
      if (ids.has(next[i].id) && !ids.has(next[i - 1].id)) [next[i - 1], next[i]] = [next[i], next[i - 1]];
    }
  } else {
    for (let i = next.length - 2; i >= 0; i--) {
      if (ids.has(next[i].id) && !ids.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    }
  }
  return next;
}

export function rangeIds(pages, fromId, toId) {
  const from = pages.findIndex((page) => page.id === fromId);
  const to = pages.findIndex((page) => page.id === toId);
  if (from < 0 || to < 0) return [];
  return pages.slice(Math.min(from, to), Math.max(from, to) + 1).map((page) => page.id);
}
