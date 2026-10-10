/// <reference lib="dom" />
import type { ExtractedColor } from "@/core/types.js";
import type { LabAnalysis } from "../api.js";
import { MAX_COUNT, MIN_COUNT } from "../api.js";
import type { Draft } from "./draft.js";
import {
  THRESHOLD_MAX,
  THRESHOLD_MIN,
  THRESHOLD_STEP,
  liveRows,
  liveSummary,
} from "./distances.js";
import { h, replaceChildren } from "./dom.js";
import {
  formatDistance,
  formatMilliseconds,
  formatPercent,
  formatScore,
  formatThreshold,
} from "./format.js";

export type ResultMode = "perceptual" | "population";
export interface ResultKey {
  readonly mode: ResultMode;
  readonly rank: number;
}

/** What the results area shows. Test images only ever get `blind`. */
export type ResultsView =
  | { readonly kind: "hidden" }
  | { readonly kind: "blind" }
  | { readonly kind: "collapsed" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "ready";
      readonly analysis: LabAnalysis;
      readonly draft: Draft;
      readonly threshold: number;
    };

export interface ResultsState {
  readonly view: ResultsView;
  readonly count: number;
}
export interface ResultsCallbacks {
  onShow(): void;
  onCount(count: number): void;
  onThreshold(threshold: number): void;
  onHover(key: ResultKey | null): void;
}
export interface ResultsPanel {
  readonly element: HTMLElement;
  update(state: ResultsState): void;
}

export const BLIND_NOTICE = "Test image: results are hidden (blind annotation)";

export function createResultsPanel(callbacks: ResultsCallbacks): ResultsPanel {
  const countSelect = h("select", {
    attrs: { id: "result-count" },
    on: { change: () => callbacks.onCount(Number(countSelect.value)) },
  });
  for (let count = MIN_COUNT; count <= MAX_COUNT; count++) {
    countSelect.append(h("option", { attrs: { value: count } }, count));
  }
  const readout = h("output", { className: "threshold-readout" });
  const slider = h("input", {
    attrs: {
      type: "range",
      id: "result-threshold",
      min: THRESHOLD_MIN,
      max: THRESHOLD_MAX,
      step: THRESHOLD_STEP,
    },
    on: { input: () => callbacks.onThreshold(Number(slider.value)) },
  });
  const controls = h(
    "div",
    { className: "results-controls" },
    h("label", { attrs: { for: "result-count" } }, "Colors"),
    countSelect,
    h("label", { attrs: { for: "result-threshold" } }, "Threshold"),
    slider,
    readout,
  );
  const summary = h("p", { className: "results-summary" });
  const tables = h("div", { className: "results-tables" });
  const notice = h("div", { className: "results-notice" });
  const ready = h("div", { className: "results-ready" }, controls, summary, tables);
  const element = h(
    "section",
    { className: "results", attrs: { "aria-label": "Results" } },
    h("h2", null, "Results"),
    notice,
    ready,
  );

  function table(
    mode: ResultMode,
    colors: readonly ExtractedColor[],
    draft: Draft,
    threshold: number,
  ): HTMLElement {
    const rows = liveRows(colors, draft, threshold).map((row) =>
      h(
        "tr",
        {
          className: row.rank <= 3 ? "top3" : "",
          on: {
            mouseenter: () => callbacks.onHover({ mode, rank: row.rank }),
            mouseleave: () => callbacks.onHover(null),
          },
        },
        h("td", null, row.rank),
        h(
          "td",
          null,
          h("span", { className: "swatch", attrs: { style: `background:${row.hex}` } }),
        ),
        h("td", { className: "mono" }, row.hex),
        h("td", null, formatPercent(row.coverage)),
        h("td", null, formatScore(row.score)),
        h(
          "td",
          { className: "mono" },
          row.distance === null ? "—" : `${formatDistance(row.distance)} (${row.nearest})`,
        ),
        h(
          "td",
          {
            className: row.hit === null ? "" : row.hit ? "hit" : "miss",
            attrs: { "aria-label": row.hit === null ? "no samples" : row.hit ? "hit" : "miss" },
          },
          row.hit === null ? "" : row.hit ? "✓" : "✗",
        ),
      ),
    );
    return h(
      "div",
      { className: "results-table" },
      h("h3", null, mode === "perceptual" ? "Perceptual" : "Population"),
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...["#", "", "Hex", "Coverage", "Score", "Distance", "Hit"].map((name) =>
              h("th", null, name),
            ),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    );
  }

  return {
    element,
    update(state) {
      const view = state.view;
      element.hidden = view.kind === "hidden";
      ready.hidden = view.kind !== "ready";
      if (view.kind !== "ready") {
        // Nothing from the previous image may linger in the hidden DOM (blind mode for test images).
        summary.textContent = "";
        replaceChildren(tables);
      }
      countSelect.value = String(state.count);
      if (view.kind === "ready") {
        if (Number(slider.value) !== view.threshold) slider.value = String(view.threshold);
        readout.textContent = formatThreshold(view.threshold);
      }
      switch (view.kind) {
        case "hidden":
          replaceChildren(notice);
          return;
        case "blind":
          replaceChildren(notice, h("p", { className: "blind" }, BLIND_NOTICE));
          return;
        case "collapsed":
          replaceChildren(
            notice,
            h(
              "button",
              { attrs: { type: "button" }, on: { click: () => callbacks.onShow() } },
              "Show results",
            ),
          );
          return;
        case "loading":
          replaceChildren(notice, h("p", { className: "muted" }, "Analyzing..."));
          return;
        case "error":
          replaceChildren(
            notice,
            h("p", { className: "error", attrs: { role: "alert" } }, view.message),
          );
          return;
        case "ready": {
          replaceChildren(notice);
          const { analysis, draft, threshold } = view;
          const labels = [
            ["Perceptual", analysis.perceptual.colors],
            ["Population", analysis.population.colors],
          ] as const;
          const parts = labels.map(([name, colors]) => {
            const outcome = liveSummary(colors, draft, threshold);
            if (outcome === null) return `${name}: add samples to see hits`;
            return `${name}: first ${outcome.firstHit ? "hit" : "miss"}, top 3 ${outcome.top3Hit ? "hit" : "miss"}`;
          });
          summary.textContent = `At ${formatThreshold(threshold)}. ${parts.join(" · ")}. Algorithm ${analysis.algorithmVersion} · decode ${formatMilliseconds(analysis.milliseconds.decode)} · perceptual ${formatMilliseconds(analysis.milliseconds.perceptual)} · population ${formatMilliseconds(analysis.milliseconds.population)}`;
          replaceChildren(
            tables,
            table("perceptual", analysis.perceptual.colors, draft, threshold),
            table("population", analysis.population.colors, draft, threshold),
          );
          return;
        }
      }
    },
  };
}
