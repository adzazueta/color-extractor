/// <reference lib="dom" />
import { formatHex } from "../../eval/lib/color.js";
import { h } from "./dom.js";
import { formatCanvasReadout } from "./format.js";
import {
  MAGNIFIER_PIXELS,
  MAGNIFIER_SCALE,
  floatingPosition,
  magnifierWindow,
} from "./geometry.js";

export interface Magnifier {
  readonly element: HTMLElement;
  /** Shows the magnifier for pixel (x, y) of `source`, next to the cursor. */
  show(source: HTMLCanvasElement, x: number, y: number, clientX: number, clientY: number): void;
  hide(): void;
}

const SIDE = MAGNIFIER_PIXELS * MAGNIFIER_SCALE;

export function createMagnifier(): Magnifier {
  const canvas = h("canvas", {
    className: "magnifier-canvas",
    attrs: { width: SIDE, height: SIDE },
  });
  const readout = h("div", { className: "magnifier-readout" });
  const element = h(
    "div",
    { className: "magnifier", attrs: { hidden: true, "aria-hidden": "true" } },
    canvas,
    readout,
  );
  const context = canvas.getContext("2d");
  if (context === null) throw new Error("The 2D canvas is not available.");

  return {
    element,
    show(source, x, y, clientX, clientY) {
      const sourceContext = source.getContext("2d");
      if (sourceContext === null) return;
      const { sx, sy, size } = magnifierWindow(x, y);
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, SIDE, SIDE);
      context.drawImage(source, sx, sy, size, size, 0, 0, SIDE, SIDE);
      // The outlined center pixel: a dark ring and a light one, visible on any color.
      const start = ((MAGNIFIER_PIXELS - 1) / 2) * MAGNIFIER_SCALE;
      context.lineWidth = 2;
      context.strokeStyle = "#000";
      context.strokeRect(start - 1, start - 1, MAGNIFIER_SCALE + 2, MAGNIFIER_SCALE + 2);
      context.lineWidth = 1;
      context.strokeStyle = "#fff";
      context.strokeRect(start + 0.5, start + 0.5, MAGNIFIER_SCALE - 1, MAGNIFIER_SCALE - 1);

      const data = sourceContext.getImageData(x, y, 1, 1).data;
      const hex = formatHex(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);
      readout.textContent = `(${x}, ${y})  ${formatCanvasReadout(hex, data[3] ?? 255)}`;

      element.hidden = false;
      const box = { width: element.offsetWidth, height: element.offsetHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const position = floatingPosition(clientX, clientY, box, viewport);
      element.style.left = `${position.left}px`;
      element.style.top = `${position.top}px`;
    },
    hide() {
      element.hidden = true;
    },
  };
}
