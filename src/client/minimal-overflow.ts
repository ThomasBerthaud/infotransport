// Measure visible content, not block boxes: absolute cells can overflow without
// changing the document's scroll size, and text can escape an otherwise fitting table.
export function overflowingMinimalBlocks(document: Document): number[] {
  const overflowing: number[] = [];
  document.querySelectorAll<HTMLElement>('.minimal-block').forEach((block, index) => {
    const bounds = block.getBoundingClientRect();
    const outside = (rect: DOMRect) =>
      rect.width > 0 &&
      rect.height > 0 &&
      (rect.left < bounds.left - 1 ||
        rect.right > bounds.right + 1 ||
        rect.top < bounds.top - 1 ||
        rect.bottom > bounds.bottom + 1);
    const walker = document.createTreeWalker(block, 4 /* SHOW_TEXT */);
    const range = document.createRange();
    let overflow = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim() || node.parentElement?.closest('svg')) continue;
      range.selectNodeContents(node);
      if (Array.from(range.getClientRects()).some(outside)) {
        overflow = true;
        break;
      }
    }
    // A disturbance icon is visible content too, including when text fits exactly.
    if (
      overflow ||
      Array.from(block.querySelectorAll('svg')).some((svg) => outside(svg.getBoundingClientRect()))
    )
      overflowing.push(index);
  });
  return overflowing;
}
