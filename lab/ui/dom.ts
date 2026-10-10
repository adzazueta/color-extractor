/// <reference lib="dom" />

export type Child = Node | string | number | null | undefined | false;

export interface Options {
  readonly className?: string;
  /** Attributes: `true` sets an empty attribute, `false` and `undefined` skip it. */
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** Properties assigned to the element, for example `value` or `checked`. */
  readonly set?: Readonly<Record<string, unknown>>;
  readonly on?: {
    readonly [E in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[E]) => void;
  };
}

function nodes(children: readonly Child[]): Node[] {
  const result: Node[] = [];
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    // All text goes through text nodes: nothing here ever parses HTML.
    result.push(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
  return result;
}

function applyAttributes(
  element: Element,
  attrs: Readonly<Record<string, string | number | boolean | undefined>>,
): void {
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    element.setAttribute(name, value === true ? "" : String(value));
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: Options | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options !== null) {
    if (options.className !== undefined) element.className = options.className;
    if (options.attrs !== undefined) applyAttributes(element, options.attrs);
    if (options.set !== undefined) Object.assign(element, options.set);
    if (options.on !== undefined) {
      for (const [name, handler] of Object.entries(options.on)) {
        element.addEventListener(name, handler as EventListener);
      }
    }
  }
  element.append(...nodes(children));
  return element;
}

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string | number | boolean | undefined>>,
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  applyAttributes(element, attrs);
  element.append(...nodes(children));
  return element;
}

export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren(...nodes(children));
}
