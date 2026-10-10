/// <reference lib="dom" />
import {
  CATEGORIES,
  CATEGORY_LABELS,
  isCategory,
  type Category,
} from "../../eval/lib/categories.js";
import { draftProblems, type Draft } from "./draft.js";
import { h, replaceChildren } from "./dom.js";
import { colorLetter, sampleLabel } from "./format.js";

export interface AnnotateState {
  /** Null when no image is selected. */
  readonly image: { readonly id: string | null } | null;
  /** Read-only: a test image already in a stored test report. */
  readonly locked: boolean;
  /** The stored annotation exists (enables "Delete annotation"). */
  readonly stored: boolean;
  /** False while loading or when the image or its annotation could not be loaded. */
  readonly editable: boolean;
  readonly draft: Draft;
  readonly picking: boolean;
  readonly saving: boolean;
  /** Problems the server reported for the last save. */
  readonly serverProblems: readonly string[];
  readonly dirty: boolean;
}
export interface AnnotateCallbacks {
  onCategory(category: Category): void;
  onAddColor(): void;
  onSelectColor(index: number): void;
  /** Activates the card and enters pick mode. */
  onAddSample(color: number): void;
  onRemoveSample(color: number, index: number): void;
  onRemoveColor(index: number): void;
  onSave(): void;
  onDelete(): void;
}
export interface AnnotatePanel {
  readonly element: HTMLElement;
  update(state: AnnotateState): void;
}

export function createAnnotatePanel(callbacks: AnnotateCallbacks): AnnotatePanel {
  const select = h(
    "select",
    {
      attrs: { id: "category" },
      on: {
        change: () => {
          if (isCategory(select.value)) callbacks.onCategory(select.value);
        },
      },
    },
    h("option", { attrs: { value: "" } }, "Choose a category..."),
    ...CATEGORIES.map((category) =>
      h("option", { attrs: { value: category } }, CATEGORY_LABELS[category]),
    ),
  );
  const status = h("p", { className: "annotate-status" });
  const cards = h("div", { className: "cards" });
  const addColor = h(
    "button",
    { attrs: { type: "button" }, on: { click: () => callbacks.onAddColor() } },
    "Add acceptable color",
  );
  const problems = h("ul", { className: "problems", attrs: { role: "alert" } });
  const save = h(
    "button",
    { className: "primary", attrs: { type: "button" }, on: { click: () => callbacks.onSave() } },
    "Save",
  );
  const remove = h(
    "button",
    { className: "danger", attrs: { type: "button" }, on: { click: () => callbacks.onDelete() } },
    "Delete annotation",
  );
  const actions = h("div", { className: "actions" }, save, remove);
  const element = h(
    "section",
    { className: "annotate", attrs: { "aria-label": "Annotation" } },
    h("h2", null, "Annotation"),
    status,
    h("label", { attrs: { for: "category" } }, "Category"),
    select,
    cards,
    addColor,
    problems,
    actions,
  );

  return {
    element,
    update(state) {
      element.hidden = state.image === null;
      if (state.image === null) return;
      const { draft, locked } = state;
      const readOnly = locked || !state.editable;
      select.value = draft.category ?? "";
      select.disabled = readOnly;
      addColor.hidden = readOnly;
      addColor.disabled = draft.colors.length >= 8;
      status.textContent = locked
        ? `Already measured${state.image.id === null ? "" : ` (${state.image.id})`}: this annotation is read-only.`
        : state.image.id === null
          ? "No annotation yet."
          : `Annotation ${state.image.id}${state.dirty ? " · unsaved changes" : ""}`;

      replaceChildren(
        cards,
        ...draft.colors.map((samples, index) => {
          const letter = colorLetter(index);
          const chips = samples.map((sample, sampleIndex) =>
            h(
              "li",
              { className: "chip" },
              h("span", { className: "swatch", attrs: { style: `background:${sample.hex}` } }),
              h("span", { className: "mono" }, `${sampleLabel(index, sampleIndex)} ${sample.hex}`),
              h("span", { className: "muted" }, `(${sample.x}, ${sample.y})`),
              readOnly
                ? null
                : h(
                    "button",
                    {
                      className: "small",
                      attrs: {
                        type: "button",
                        "aria-label": `Remove sample ${sampleLabel(index, sampleIndex)}`,
                      },
                      on: { click: () => callbacks.onRemoveSample(index, sampleIndex) },
                    },
                    "×",
                  ),
            ),
          );
          const active = draft.active === index && !readOnly;
          return h(
            "div",
            {
              className: active ? "card active" : "card",
              on: { click: () => (readOnly ? undefined : callbacks.onSelectColor(index)) },
            },
            h("h3", null, `Color ${letter}`),
            h("ul", { className: "chips" }, ...chips),
            readOnly
              ? null
              : h(
                  "div",
                  { className: "card-actions" },
                  h(
                    "button",
                    {
                      attrs: { type: "button", "aria-pressed": String(active && state.picking) },
                      on: {
                        click: (event) => {
                          event.stopPropagation();
                          callbacks.onAddSample(index);
                        },
                      },
                    },
                    "Add sample",
                  ),
                  h(
                    "button",
                    {
                      attrs: { type: "button" },
                      on: {
                        click: (event) => {
                          event.stopPropagation();
                          callbacks.onRemoveColor(index);
                        },
                      },
                    },
                    "Remove color",
                  ),
                ),
          );
        }),
      );

      const blocking = draftProblems(draft);
      const shown =
        state.serverProblems.length > 0 ? state.serverProblems : state.dirty ? blocking : [];
      replaceChildren(problems, ...shown.map((problem) => h("li", null, problem)));
      actions.hidden = readOnly;
      save.disabled = blocking.length > 0 || state.saving;
      save.textContent = state.saving ? "Saving..." : "Save";
      remove.hidden = !state.stored;
      remove.disabled = state.saving;
    },
  };
}
