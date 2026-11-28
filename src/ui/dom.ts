// Small DOM helpers shared by the views.

type Attrs = Record<string, string>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...children);
  return el;
}

export function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * A text for keyboard players and one for touch screens. Both are in the page;
 * the style sheet shows the one that fits the device (`keys-only`, `touch-only`).
 */
export function keysOrTouch(keys: string, touch: string): HTMLElement[] {
  return [h("span", { class: "keys-only" }, keys), h("span", { class: "touch-only" }, touch)];
}

/** A button that never takes keyboard focus, so Space and Enter keep their looper meaning. */
export function button(label: string, title: string, onPress: () => void, className = ""): HTMLButtonElement {
  const el = h("button", { type: "button", title, class: className }, label);
  el.tabIndex = -1;
  el.addEventListener("mousedown", (e) => e.preventDefault());
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onPress();
  });
  return el;
}
