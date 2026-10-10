/// <reference lib="dom" />
import type { LabInventory } from "../api.js";
import type { SetName } from "../../eval/lib/annotation-schema.js";
import { h, replaceChildren } from "./dom.js";
import { imagesOf, orphansOf, routeFor, statusOf, visibleImages } from "./inventory.js";

export interface ListState {
  readonly inventory: LabInventory | null;
  readonly selected: string | null;
  readonly pendingOnly: boolean;
}
export interface ListCallbacks {
  onFilter(pendingOnly: boolean): void;
}
export interface ImageList {
  readonly element: HTMLElement;
  update(state: ListState): void;
}

const SETS: readonly SetName[] = ["dev", "test"];

export function createList(callbacks: ListCallbacks): ImageList {
  const filter = h("input", {
    attrs: { type: "checkbox", id: "filter-pending" },
    on: { change: () => callbacks.onFilter(filter.checked) },
  });
  const body = h("div", { className: "list-body" });
  const element = h(
    "nav",
    { className: "list", attrs: { "aria-label": "Images" } },
    h(
      "label",
      { className: "list-filter", attrs: { for: "filter-pending" } },
      filter,
      " Pending only",
    ),
    body,
  );
  let lastSelected: string | null = null;

  return {
    element,
    update(state) {
      filter.checked = state.pendingOnly;
      const inventory = state.inventory;
      if (inventory === null) {
        replaceChildren(body, h("p", { className: "muted" }, "Loading..."));
        return;
      }
      const groups = SETS.map((set) => {
        const images = visibleImages(imagesOf(inventory, set), state.pendingOnly);
        const rows = images.map((image) => {
          const status = statusOf(image);
          const name = image.relativePath.split("/").pop() ?? image.relativePath;
          return h(
            "a",
            {
              className: `row ${status}`,
              attrs: {
                href: routeFor(image.sha256),
                title: image.relativePath,
                "aria-current": image.sha256 === state.selected ? "true" : undefined,
              },
            },
            h("span", { className: "row-name" }, name),
            h(
              "span",
              { className: "row-meta" },
              image.annotation === null
                ? null
                : `${image.annotation.id} · ${image.annotation.category}`,
            ),
            h("span", { className: "row-status" }, status),
          );
        });
        const orphans = orphansOf(inventory, set).map((orphan) =>
          h("div", { className: "row orphan" }, `orphaned ${orphan.id} (${orphan.category})`),
        );
        return h(
          "section",
          { className: "list-group" },
          h("h2", null, set),
          rows.length + orphans.length === 0 ? h("p", { className: "muted" }, "No images.") : null,
          ...rows,
          ...orphans,
        );
      });
      replaceChildren(body, ...groups);
      if (state.selected !== null && state.selected !== lastSelected) {
        body.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest" });
      }
      lastSelected = state.selected;
    },
  };
}
