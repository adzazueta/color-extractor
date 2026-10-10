/// <reference lib="dom" />
import { h, replaceChildren, s } from "./dom.js";
import {
  ZOOMS,
  clientToPixel,
  displayScale,
  pixelCenter,
  type Rect,
  type Size,
  type Zoom,
} from "./geometry.js";
import { createMagnifier } from "./magnifier.js";
import type { ResultKey } from "./results.js";

export interface SampleMarker {
  readonly x: number;
  readonly y: number;
  /** For example "A1". */
  readonly label: string;
  readonly active: boolean;
}
export interface ResultMarker extends ResultKey {
  readonly x: number;
  readonly y: number;
}

export interface ViewerState {
  readonly bitmap: ImageBitmap | null;
  /** Shown instead of the image: loading, or why it failed. */
  readonly message: string | null;
  readonly zoom: Zoom;
  readonly picking: boolean;
  /** What the pick mode is adding to, for example "color B". */
  readonly pickTarget: string | null;
  readonly samples: readonly SampleMarker[];
  /** Empty while picking (decision 37g) and for test images. */
  readonly results: readonly ResultMarker[];
  readonly highlight: ResultKey | null;
}
export interface ViewerCallbacks {
  onZoom(zoom: Zoom): void;
  onPick(x: number, y: number): void;
  onStopPicking(): void;
}
export interface Viewer {
  readonly element: HTMLElement;
  update(state: ViewerState): void;
}

const SAMPLE_SIZE = 12;
const RING_RADIUS = 10;

function zoomLabel(zoom: Zoom): string {
  return zoom === "fit" ? "Fit" : `${zoom}×`;
}

export function createViewer(callbacks: ViewerCallbacks): Viewer {
  const canvas = h("canvas", { className: "viewer-canvas" });
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) throw new Error("The 2D canvas is not available.");
  const overlay = s("svg", { class: "viewer-overlay", "aria-hidden": "true" });
  const wrapper = h("div", { className: "viewer-wrapper" }, canvas, overlay);
  const message = h("p", { className: "viewer-message" });
  const stage = h("div", { className: "viewer-stage" }, wrapper, message);
  const magnifier = createMagnifier();
  const zoomButtons = ZOOMS.map((zoom) =>
    h(
      "button",
      { attrs: { type: "button" }, on: { click: () => callbacks.onZoom(zoom) } },
      zoomLabel(zoom),
    ),
  );
  const pickStatus = h("span", { className: "viewer-pick" });
  const toolbar = h(
    "div",
    { className: "viewer-toolbar" },
    h(
      "div",
      { className: "viewer-zoom", attrs: { role: "group", "aria-label": "Zoom" } },
      ...zoomButtons,
    ),
    pickStatus,
  );
  const element = h(
    "section",
    { className: "viewer", attrs: { "aria-label": "Image" } },
    toolbar,
    stage,
    magnifier.element,
  );

  let current: ViewerState | null = null;
  let drawn: ImageBitmap | null = null;

  function imageSize(): Size | null {
    return drawn === null ? null : { width: drawn.width, height: drawn.height };
  }

  function layout(): void {
    const state = current;
    const size = imageSize();
    if (state === null || size === null) {
      wrapper.hidden = true;
      return;
    }
    wrapper.hidden = false;
    const container = { width: stage.clientWidth - 24, height: stage.clientHeight - 24 };
    const scale = displayScale(state.zoom, container, size);
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    wrapper.style.width = `${width}px`;
    wrapper.style.height = `${height}px`;
    canvas.classList.toggle("pixelated", scale >= 2);
    renderOverlay(state, width, height, size);
  }

  function renderOverlay(state: ViewerState, width: number, height: number, size: Size): void {
    const rect: Rect = { left: 0, top: 0, width, height };
    overlay.setAttribute("width", String(width));
    overlay.setAttribute("height", String(height));
    overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const marks: SVGElement[] = [];
    for (const mark of state.samples) {
      const center = pixelCenter(mark.x, mark.y, rect, size);
      marks.push(
        s(
          "g",
          { class: mark.active ? "sample active" : "sample" },
          s("rect", {
            x: center.left - SAMPLE_SIZE / 2,
            y: center.top - SAMPLE_SIZE / 2,
            width: SAMPLE_SIZE,
            height: SAMPLE_SIZE,
          }),
          s(
            "text",
            { x: center.left + SAMPLE_SIZE / 2 + 2, y: center.top - SAMPLE_SIZE / 2 },
            mark.label,
          ),
        ),
      );
    }
    for (const mark of state.results) {
      const center = pixelCenter(mark.x, mark.y, rect, size);
      const highlighted =
        state.highlight !== null &&
        state.highlight.mode === mark.mode &&
        state.highlight.rank === mark.rank;
      marks.push(
        s(
          "g",
          { class: `result ${mark.mode}${highlighted ? " highlight" : ""}` },
          s("circle", { cx: center.left, cy: center.top, r: RING_RADIUS }),
          s("text", { x: center.left, y: center.top + 4, "text-anchor": "middle" }, mark.rank),
        ),
      );
    }
    replaceChildren(overlay, ...marks);
  }

  function pixelAt(event: MouseEvent): { x: number; y: number } | null {
    const size = imageSize();
    if (size === null) return null;
    return clientToPixel(event.clientX, event.clientY, canvas.getBoundingClientRect(), size);
  }

  canvas.addEventListener("mousemove", (event) => {
    const pixel = pixelAt(event);
    if (pixel === null) magnifier.hide();
    else magnifier.show(canvas, pixel.x, pixel.y, event.clientX, event.clientY);
  });
  canvas.addEventListener("mouseleave", () => magnifier.hide());
  canvas.addEventListener("click", (event) => {
    if (current === null || !current.picking) return;
    const pixel = pixelAt(event);
    if (pixel !== null) callbacks.onPick(pixel.x, pixel.y);
  });
  new ResizeObserver(() => {
    if (current?.zoom === "fit") layout();
  }).observe(stage);

  return {
    element,
    update(state) {
      current = state;
      if (state.bitmap !== drawn) {
        drawn = state.bitmap;
        magnifier.hide();
        if (drawn !== null) {
          canvas.width = drawn.width;
          canvas.height = drawn.height;
          context.clearRect(0, 0, drawn.width, drawn.height);
          context.drawImage(drawn, 0, 0);
        }
      }
      message.textContent = state.message;
      message.hidden = state.message === null;
      stage.classList.toggle("picking", state.picking);
      zoomButtons.forEach((button, index) => {
        button.setAttribute("aria-pressed", String(ZOOMS[index] === state.zoom));
      });
      replaceChildren(
        pickStatus,
        state.picking
          ? `Picking a sample for ${state.pickTarget ?? "the active color"}: click the image. `
          : null,
        state.picking
          ? h(
              "button",
              { attrs: { type: "button" }, on: { click: () => callbacks.onStopPicking() } },
              "Done (Esc)",
            )
          : null,
      );
      layout();
    },
  };
}
