export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}
export interface Size {
  readonly width: number;
  readonly height: number;
}
export type Zoom = "fit" | 1 | 2 | 4;

export const ZOOMS: readonly Zoom[] = ["fit", 1, 2, 4];
/** The magnifier shows 11 x 11 source pixels... */
export const MAGNIFIER_PIXELS: number = 11;
/** ...at 12 x. */
export const MAGNIFIER_SCALE: number = 12;

/**
 * Maps a client position to the image pixel under it, given the bounding rectangle of the displayed
 * canvas and the image size. Null outside the rectangle.
 */
export function clientToPixel(
  clientX: number,
  clientY: number,
  rect: Rect,
  size: Size,
): { readonly x: number; readonly y: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || size.width <= 0 || size.height <= 0) return null;
  const fx = (clientX - rect.left) / rect.width;
  const fy = (clientY - rect.top) / rect.height;
  if (!(fx >= 0 && fx < 1 && fy >= 0 && fy < 1)) return null;
  return {
    x: Math.min(size.width - 1, Math.floor(fx * size.width)),
    y: Math.min(size.height - 1, Math.floor(fy * size.height)),
  };
}

/** The center of a pixel in the same coordinates as `rect` (client coordinates for a client rect). */
export function pixelCenter(
  x: number,
  y: number,
  rect: Rect,
  size: Size,
): { readonly left: number; readonly top: number } {
  return {
    left: rect.left + ((x + 0.5) * rect.width) / size.width,
    top: rect.top + ((y + 0.5) * rect.height) / size.height,
  };
}

/** Source window of the magnifier around a pixel; it may extend beyond the image. */
export function magnifierWindow(
  x: number,
  y: number,
): { readonly sx: number; readonly sy: number; readonly size: number } {
  const half = (MAGNIFIER_PIXELS - 1) / 2;
  return { sx: x - half, sy: y - half, size: MAGNIFIER_PIXELS };
}

/** Display scale of the image: a fixed zoom, or the scale that fits the container. */
export function displayScale(zoom: Zoom, container: Size, image: Size): number {
  if (zoom !== "fit") return zoom;
  if (container.width <= 0 || container.height <= 0 || image.width <= 0 || image.height <= 0) {
    return 1;
  }
  return Math.min(container.width / image.width, container.height / image.height);
}

/**
 * Position of the magnifier box next to the cursor, flipped to the other side of the cursor when it
 * would leave the viewport.
 */
export function floatingPosition(
  clientX: number,
  clientY: number,
  box: Size,
  viewport: Size,
  offset: number = 20,
): { readonly left: number; readonly top: number } {
  let left = clientX + offset;
  let top = clientY + offset;
  if (left + box.width > viewport.width) left = clientX - offset - box.width;
  if (top + box.height > viewport.height) top = clientY - offset - box.height;
  return { left: Math.max(0, left), top: Math.max(0, top) };
}
