/** dom.ts — tiny DOM helpers for the UI overlay. Text via textContent only. */

export function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(
  className: string,
  text: string,
  onClick: () => void,
  ariaLabel?: string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = className;
  b.textContent = text;
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

/** Formats 12345 → "12,345". */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
