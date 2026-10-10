import type { LabImage, LabInventory, LabOrphan } from "../api.js";
import type { SetName } from "../../eval/lib/annotation-schema.js";

export type ImageStatus = "pending" | "annotated" | "locked";

export function statusOf(image: LabImage): ImageStatus {
  if (image.locked) return "locked";
  return image.annotation === null ? "pending" : "annotated";
}

export function imagesOf(inventory: LabInventory, set: SetName): LabImage[] {
  return inventory.images.filter((image) => image.set === set);
}

export function orphansOf(inventory: LabInventory, set: SetName): LabOrphan[] {
  return inventory.orphans.filter((orphan) => orphan.set === set);
}

/** The images the list shows, in inventory order. */
export function visibleImages(images: readonly LabImage[], pendingOnly: boolean): LabImage[] {
  return pendingOnly ? images.filter((image) => image.annotation === null) : [...images];
}

export interface SetCounts {
  readonly annotated: number;
  readonly pending: number;
  readonly orphaned: number;
}

export function countsOf(inventory: LabInventory, set: SetName): SetCounts {
  const images = imagesOf(inventory, set);
  const pending = images.filter((image) => image.annotation === null).length;
  return {
    annotated: images.length - pending,
    pending,
    orphaned: orphansOf(inventory, set).length,
  };
}

/**
 * The next (step 1) or previous (step -1) image in the list, or null at the end. Without a current
 * image in the list, the first or the last one.
 */
export function neighbor(
  images: readonly LabImage[],
  current: string | null,
  step: 1 | -1,
): LabImage | null {
  if (images.length === 0) return null;
  const index = images.findIndex((image) => image.sha256 === current);
  if (index === -1) return (step === 1 ? images[0] : images[images.length - 1]) ?? null;
  return images[index + step] ?? null;
}

/** The next image without an annotation after the current one, wrapping around. */
export function nextPending(images: readonly LabImage[], current: string | null): LabImage | null {
  const start = images.findIndex((image) => image.sha256 === current);
  for (let offset = 1; offset <= images.length; offset++) {
    const image = images[(start + offset + images.length) % images.length];
    if (image !== undefined && image.annotation === null && image.sha256 !== current) return image;
  }
  return null;
}

const ROUTE = /^#\/([0-9a-f]{64})$/;

/** The sha256 in a `#/<sha256>` hash, or null. */
export function parseRoute(hash: string): string | null {
  return ROUTE.exec(hash)?.[1] ?? null;
}

export function routeFor(sha256: string): string {
  return `#/${sha256}`;
}
