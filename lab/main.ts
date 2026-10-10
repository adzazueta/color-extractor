/// <reference lib="dom" />
import type { ImageAnnotation } from "../eval/lib/annotation-schema.js";
import { CATEGORY_LABELS } from "../eval/lib/categories.js";
import type { LabAnalysis, LabAnnotation, LabImage, LabInventory } from "./api.js";
import { MAX_COUNT, MIN_COUNT } from "./api.js";
import { createAnnotatePanel } from "./ui/annotate.js";
import {
  BlindModeError,
  LabRequestError,
  fetchAnalysis,
  fetchAnnotation,
  fetchImageBlob,
  fetchInventory,
  fetchPixel,
  removeAnnotation,
  saveAnnotation,
} from "./ui/api.js";
import {
  addColor,
  addSample,
  draftFrom,
  draftProblems,
  isDirty,
  removeColor,
  removeSample,
  selectColor,
  setCategory,
  toRequestBody,
  type Draft,
} from "./ui/draft.js";
import { clampThreshold, defaultThreshold } from "./ui/distances.js";
import { h, replaceChildren } from "./ui/dom.js";
import { colorLetter, sampleLabel } from "./ui/format.js";
import type { Zoom } from "./ui/geometry.js";
import {
  countsOf,
  neighbor,
  nextPending,
  parseRoute,
  routeFor,
  visibleImages,
} from "./ui/inventory.js";
import { keyAction } from "./ui/keys.js";
import { createList } from "./ui/list.js";
import { createResultsPanel, type ResultKey, type ResultsView } from "./ui/results.js";
import { createViewer, type ResultMarker, type SampleMarker } from "./ui/viewer.js";

type AnalysisState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly analysis: LabAnalysis };

interface State {
  inventory: LabInventory | null;
  inventoryError: string | null;
  selected: LabImage | null;
  /** Invalidates the answers of requests started for a previous selection. */
  token: number;
  /** Same idea for the analysis request, which count changes can restart. */
  analysisToken: number;
  bitmap: ImageBitmap | null;
  loading: boolean;
  imageError: string | null;
  annotationError: string | null;
  saved: LabAnnotation | null;
  draft: Draft;
  picking: boolean;
  zoom: Zoom;
  pendingOnly: boolean;
  resultsShown: boolean;
  analysis: AnalysisState;
  count: number;
  threshold: number;
  hover: ResultKey | null;
  saving: boolean;
  serverProblems: readonly string[];
  notice: string | null;
}

const state: State = {
  inventory: null,
  inventoryError: null,
  selected: null,
  token: 0,
  analysisToken: 0,
  bitmap: null,
  loading: false,
  imageError: null,
  annotationError: null,
  saved: null,
  draft: draftFrom(null),
  picking: false,
  zoom: "fit",
  pendingOnly: false,
  resultsShown: false,
  analysis: { kind: "idle" },
  count: 5,
  threshold: defaultThreshold(),
  hover: null,
  saving: false,
  serverProblems: [],
  notice: null,
};

function byId(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`lab/index.html is missing #${id}.`);
  return element;
}

const header = byId("header");
const listHost = byId("list");
const centerHost = byId("center");
const sideHost = byId("side");

function message(error: unknown): string {
  if (error instanceof LabRequestError) return error.error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

function isLocked(): boolean {
  return state.saved?.locked ?? state.selected?.locked ?? false;
}

function storedAnnotation(): ImageAnnotation | null {
  return state.saved?.annotation ?? null;
}

function editable(): boolean {
  return (
    state.selected !== null &&
    !state.loading &&
    state.saved !== null &&
    state.annotationError === null &&
    !isLocked()
  );
}

function hasUnsavedChanges(): boolean {
  return editable() && isDirty(state.draft, storedAnnotation());
}

function canSave(): boolean {
  return editable() && !state.saving && draftProblems(state.draft).length === 0;
}

// Components.

const list = createList({
  onFilter(pendingOnly) {
    state.pendingOnly = pendingOnly;
    render();
  },
});
const viewer = createViewer({
  onZoom(zoom) {
    state.zoom = zoom;
    render();
  },
  onPick: (x, y) => void pick(x, y),
  onStopPicking() {
    state.picking = false;
    render();
  },
});
const results = createResultsPanel({
  onShow() {
    state.resultsShown = true;
    void loadAnalysis();
  },
  onCount(count) {
    state.count = Math.min(MAX_COUNT, Math.max(MIN_COUNT, count));
    void loadAnalysis();
  },
  onThreshold(threshold) {
    state.threshold = clampThreshold(threshold);
    render();
  },
  onHover(key) {
    // Only the markers change: re-rendering the table under the cursor would restart the hover.
    state.hover = key;
    renderViewer();
  },
});
const annotate = createAnnotatePanel({
  onCategory(category) {
    state.draft = setCategory(state.draft, category);
    render();
  },
  onAddColor() {
    state.draft = addColor(state.draft);
    render();
  },
  onSelectColor(index) {
    state.draft = selectColor(state.draft, index);
    render();
  },
  onAddSample(color) {
    state.draft = selectColor(state.draft, color);
    state.picking = true;
    state.notice = null;
    render();
  },
  onRemoveSample(color, index) {
    state.draft = removeSample(state.draft, color, index);
    render();
  },
  onRemoveColor(index) {
    state.draft = removeColor(state.draft, index);
    if (state.draft.active === null) state.picking = false;
    render();
  },
  onSave: () => void save(),
  onDelete: () => void remove(),
});

listHost.append(list.element);
centerHost.append(viewer.element, results.element);
sideHost.append(annotate.element);

// Rendering.

function renderHeader(): void {
  const inventory = state.inventory;
  if (inventory === null) {
    replaceChildren(
      header,
      h("h1", null, "Color extractor lab"),
      state.inventoryError === null ? h("span", { className: "muted" }, "Loading...") : null,
      state.inventoryError === null
        ? null
        : h("div", { className: "banner", attrs: { role: "alert" } }, state.inventoryError),
    );
    return;
  }
  const summary = (["dev", "test"] as const).map((set) => {
    const counts = countsOf(inventory, set);
    return h(
      "span",
      { className: "count" },
      `${set}: ${counts.annotated} annotated · ${counts.pending} pending · ${counts.orphaned} orphaned`,
    );
  });
  replaceChildren(
    header,
    h("h1", null, "Color extractor lab"),
    h(
      "span",
      { className: "muted mono", attrs: { title: "Evaluation folder" } },
      inventory.evalDir,
    ),
    ...summary,
    h(
      "span",
      { className: "count" },
      `${inventory.skipped} skipped · ${inventory.duplicates} duplicates`,
    ),
    inventory.problems.length === 0
      ? null
      : h(
          "div",
          { className: "banner", attrs: { role: "alert" } },
          h("strong", null, "Problems"),
          h("ul", null, ...inventory.problems.map((problem) => h("li", null, problem))),
        ),
  );
}

function resultsView(): ResultsView {
  const image = state.selected;
  if (image === null) return { kind: "hidden" };
  if (image.set !== "dev") return { kind: "blind" };
  if (state.imageError !== null || state.annotationError !== null) return { kind: "hidden" };
  if (!state.resultsShown) return { kind: "collapsed" };
  switch (state.analysis.kind) {
    case "ready":
      return {
        kind: "ready",
        analysis: state.analysis.analysis,
        draft: state.draft,
        threshold: state.threshold,
      };
    case "error":
      return { kind: "error", message: state.analysis.message };
    default:
      return { kind: "loading" };
  }
}

function sampleMarkers(): SampleMarker[] {
  return state.draft.colors.flatMap((samples, color) =>
    samples.map((sample, index) => ({
      x: sample.x,
      y: sample.y,
      label: sampleLabel(color, index),
      active: state.draft.active === color,
    })),
  );
}

function resultMarkers(): ResultMarker[] {
  // Hidden while picking, so a sample is never taken by clicking a returned position (37g).
  if (state.picking || state.selected?.set !== "dev" || state.analysis.kind !== "ready") return [];
  if (!state.resultsShown) return [];
  const { perceptual, population } = state.analysis.analysis;
  return [
    ...perceptual.colors.map((color) => ({
      mode: "perceptual" as const,
      rank: color.rank,
      ...color.position,
    })),
    ...population.colors.map((color) => ({
      mode: "population" as const,
      rank: color.rank,
      ...color.position,
    })),
  ];
}

function viewerMessage(): string | null {
  if (state.selected === null)
    return state.inventory === null ? null : "Choose an image from the list.";
  if (state.imageError !== null) return state.imageError;
  if (state.loading) return "Loading...";
  return null;
}

function renderViewer(): void {
  const active = state.draft.active;
  viewer.update({
    bitmap: state.bitmap,
    message: state.notice ?? viewerMessage(),
    zoom: state.zoom,
    picking: state.picking,
    pickTarget: active === null ? null : `color ${colorLetter(active)}`,
    samples: sampleMarkers(),
    results: resultMarkers(),
    highlight: state.hover,
  });
}

function render(): void {
  renderHeader();
  list.update({
    inventory: state.inventory,
    selected: state.selected?.sha256 ?? null,
    pendingOnly: state.pendingOnly,
  });
  renderViewer();
  results.update({ view: resultsView(), count: state.count });
  annotate.update({
    image:
      state.selected === null
        ? null
        : { id: state.saved?.annotation?.id ?? state.selected.annotation?.id ?? null },
    locked: isLocked(),
    stored: storedAnnotation() !== null && !isLocked(),
    editable: editable(),
    draft: state.draft,
    picking: state.picking,
    saving: state.saving,
    serverProblems: state.serverProblems,
    dirty: hasUnsavedChanges(),
  });
}

// Actions.

async function loadBitmap(sha256: string): Promise<ImageBitmap> {
  const blob = await fetchImageBlob(sha256);
  // No color management or premultiplication: the pixels are shown as the server decoded them.
  return createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
}

async function select(sha256: string | null): Promise<void> {
  const token = ++state.token;
  state.analysisToken++;
  state.bitmap?.close();
  Object.assign(state, {
    bitmap: null,
    saved: null,
    draft: draftFrom(null),
    picking: false,
    resultsShown: false,
    analysis: { kind: "idle" },
    hover: null,
    saving: false,
    serverProblems: [],
    notice: null,
    imageError: null,
    annotationError: null,
    selected: state.inventory?.images.find((image) => image.sha256 === sha256) ?? null,
    loading: false,
  });
  const image = state.selected;
  if (image === null) {
    render();
    return;
  }
  state.loading = true;
  render();

  const [annotation, bitmap] = await Promise.allSettled([
    fetchAnnotation(image.sha256),
    loadBitmap(image.sha256),
  ]);
  if (token !== state.token) {
    if (bitmap.status === "fulfilled") bitmap.value.close();
    return;
  }
  state.loading = false;
  if (bitmap.status === "fulfilled") state.bitmap = bitmap.value;
  else state.imageError = message(bitmap.reason);
  if (annotation.status === "fulfilled") {
    state.saved = annotation.value;
    state.draft = draftFrom(annotation.value.annotation);
    // Dev images with an annotation start with results open; without one they stay collapsed (32d).
    state.resultsShown = image.set === "dev" && annotation.value.annotation !== null;
  } else {
    state.annotationError = message(annotation.reason);
    state.notice = `Cannot load the annotation: ${state.annotationError}`;
  }
  render();
  if (state.resultsShown && state.imageError === null) void loadAnalysis();
}

async function loadAnalysis(): Promise<void> {
  const image = state.selected;
  // Blind mode: the analysis route is never called for a test image (fetchAnalysis also refuses).
  if (image === null || image.set !== "dev") return;
  const token = ++state.analysisToken;
  const selection = state.token;
  state.analysis = { kind: "loading" };
  render();
  try {
    const analysis = await fetchAnalysis(image, state.count);
    if (token !== state.analysisToken || selection !== state.token) return;
    state.analysis = { kind: "ready", analysis };
  } catch (error) {
    if (token !== state.analysisToken || selection !== state.token) return;
    if (error instanceof BlindModeError) return;
    state.analysis = { kind: "error", message: message(error) };
  }
  render();
}

async function pick(x: number, y: number): Promise<void> {
  const image = state.selected;
  if (image === null || !state.picking || !editable()) return;
  const token = state.token;
  try {
    // The value comes from the server's exact pixel; the canvas is only for display (32e).
    const pixel = await fetchPixel(image.sha256, x, y);
    if (token !== state.token || !state.picking) return;
    if (pixel.alpha === 0) {
      state.notice = "That pixel is fully transparent; transparent pixels are not analyzed.";
    } else {
      const next = addSample(state.draft, {
        x: pixel.x,
        y: pixel.y,
        hex: pixel.hex,
        alpha: pixel.alpha,
      });
      state.notice =
        next === state.draft ? "That position is already a sample, or the color is full." : null;
      state.draft = next;
    }
  } catch (error) {
    if (token !== state.token) return;
    state.notice = `Cannot read the pixel: ${message(error)}`;
  }
  render();
}

async function refreshInventory(): Promise<void> {
  try {
    const inventory = await fetchInventory();
    state.inventory = inventory;
    state.inventoryError = null;
    if (state.selected !== null) {
      const sha256 = state.selected.sha256;
      state.selected = inventory.images.find((image) => image.sha256 === sha256) ?? state.selected;
    }
  } catch (error) {
    state.inventoryError = `Cannot load the inventory: ${message(error)}`;
  }
  render();
}

async function save(): Promise<void> {
  const image = state.selected;
  if (image === null || !canSave()) return;
  const token = state.token;
  state.saving = true;
  state.serverProblems = [];
  state.notice = null;
  render();
  try {
    const annotation = await saveAnnotation(image.sha256, toRequestBody(state.draft));
    if (token !== state.token) return;
    state.saved = {
      set: image.set,
      width: annotation.width,
      height: annotation.height,
      annotation,
      locked: false,
    };
    state.draft = draftFrom(annotation);
    state.picking = false;
    state.notice = "Saved.";
  } catch (error) {
    if (token !== state.token) return;
    if (error instanceof LabRequestError) {
      state.serverProblems = error.problems.length > 0 ? error.problems : [error.error];
    } else {
      state.serverProblems = [message(error)];
    }
  }
  state.saving = false;
  render();
  await refreshInventory();
}

async function remove(): Promise<void> {
  const image = state.selected;
  const stored = storedAnnotation();
  if (image === null || stored === null || isLocked() || state.saving) return;
  const label = `${stored.id} (${CATEGORY_LABELS[stored.category]})`;
  if (!window.confirm(`Delete the annotation ${label}? This cannot be undone.`)) return;
  const token = state.token;
  state.saving = true;
  state.serverProblems = [];
  render();
  try {
    await removeAnnotation(image.sha256);
    if (token !== state.token) return;
    state.saved = state.saved === null ? null : { ...state.saved, annotation: null };
    state.draft = draftFrom(null);
    state.picking = false;
    state.notice = "Annotation deleted.";
  } catch (error) {
    if (token !== state.token) return;
    state.serverProblems = [message(error)];
  }
  state.saving = false;
  render();
  await refreshInventory();
}

// Navigation, keyboard, and unsaved changes.

const LEAVE_MESSAGE = "This image has unsaved changes. Leave and discard them?";

function go(image: LabImage | null): void {
  if (image !== null) window.location.hash = routeFor(image.sha256);
}

function currentRoute(): string | null {
  return state.selected === null ? null : routeFor(state.selected.sha256);
}

window.addEventListener("hashchange", () => {
  const next = parseRoute(window.location.hash);
  if (next === (state.selected?.sha256 ?? null)) return;
  if (hasUnsavedChanges() && !window.confirm(LEAVE_MESSAGE)) {
    // Put the old address back without raising another hashchange.
    const route = currentRoute();
    window.history.replaceState(
      null,
      "",
      route ?? window.location.pathname + window.location.search,
    );
    return;
  }
  void select(next);
});

window.addEventListener("beforeunload", (event) => {
  if (!hasUnsavedChanges()) return;
  event.preventDefault();
  event.returnValue = "";
});

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

document.addEventListener("keydown", (event) => {
  const action = keyAction({
    key: event.key,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    altKey: event.altKey,
    typing: isTyping(event.target),
  });
  if (action === null || state.inventory === null) return;
  const current = state.selected?.sha256 ?? null;
  switch (action) {
    case "next":
    case "previous": {
      const images = visibleImages(state.inventory.images, state.pendingOnly);
      go(neighbor(images, current, action === "next" ? 1 : -1));
      break;
    }
    case "next-pending": {
      const image = nextPending(state.inventory.images, current);
      if (image === null) {
        state.notice = "No pending images.";
        render();
      } else go(image);
      break;
    }
    case "save":
      event.preventDefault();
      void save();
      break;
    case "escape":
      if (state.picking) {
        state.picking = false;
        render();
      }
      break;
  }
});

async function start(): Promise<void> {
  render();
  try {
    state.inventory = await fetchInventory();
  } catch (error) {
    state.inventoryError = `Cannot load the inventory: ${message(error)}`;
    render();
    return;
  }
  await select(parseRoute(window.location.hash));
}

void start();
