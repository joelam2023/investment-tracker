import { setIcon } from "obsidian";
import type { Currency, DatedAmount } from "../types";
import { getIntlLocale, t } from "../i18n";
import { currencyFractionDigits } from "../domain/money";
import { buildChartScale } from "./chart-scale";

export function formatMoney(value: number, currency: Currency): string {
  if (!Number.isFinite(value)) return "—";
  const fractionDigits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(getIntlLocale(), {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(getIntlLocale(), {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const formatted = formatRate(Math.abs(value));
  return `${value >= 0 ? "+" : "−"}${formatted}`;
}

export function formatDate(date: string | null): string {
  if (!date) return "—";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(getIntlLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function todayLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addIconButton(
  parent: HTMLElement,
  icon: string,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = parent.createEl("button", {
    cls: "investment-tracker-icon-button clickable-icon",
    attr: { "aria-label": label },
  });
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

export function renderMetricCard(
  parent: HTMLElement,
  label: string,
  value: string,
  tone: "neutral" | "positive" | "negative" = "neutral",
  hint?: string,
): HTMLElement {
  const card = parent.createDiv({ cls: `investment-tracker-metric is-${tone}` });
  card.createDiv({ cls: "investment-tracker-metric-label", text: label });
  card.createDiv({ cls: "investment-tracker-metric-value", text: value });
  if (hint) card.createDiv({ cls: "investment-tracker-metric-hint", text: hint });
  return card;
}

export function renderLineChart(
  parent: HTMLElement,
  series: Array<{ label: string; values: DatedAmount[]; className: string }>,
): void {
  const available = series.filter((item) => item.values.length > 0);
  if (available.length === 0) {
    parent.createDiv({ cls: "investment-tracker-empty-chart", text: t("Record two valuations to display the return chart") });
    return;
  }

  const allPoints = available.flatMap((item) => item.values);
  const dates = allPoints.map((point) => new Date(`${point.date}T00:00:00`).getTime());
  const values = allPoints.map((point) => point.amount);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, 1);
  const width = 800;
  const height = 260;
  const padX = 28;
  const padY = 22;
  const xSpan = Math.max(maxDate - minDate, 1);
  const ySpan = Math.max(maxValue - minValue, 1);

  const wrap = parent.createDiv({ cls: "investment-tracker-chart-wrap" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", t("Asset and benchmark trends"));
  svg.classList.add("investment-tracker-chart");
  wrap.appendChild(svg);

  for (let row = 0; row <= 4; row += 1) {
    const y = padY + ((height - padY * 2) * row) / 4;
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padX));
    line.setAttribute("x2", String(width - padX));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "investment-tracker-chart-grid");
    svg.appendChild(line);
  }

  for (const item of available) {
    const sorted = [...item.values].sort((a, b) => a.date.localeCompare(b.date));
    const pathData = sorted
      .map((point, index) => {
        const timestamp = new Date(`${point.date}T00:00:00`).getTime();
        const x = padX + ((timestamp - minDate) / xSpan) * (width - padX * 2);
        const y = height - padY - ((point.amount - minValue) / ySpan) * (height - padY * 2);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("class", `investment-tracker-chart-line ${item.className}`);
    svg.appendChild(path);
  }

  const legend = wrap.createDiv({ cls: "investment-tracker-chart-legend" });
  for (const item of available) {
    const entry = legend.createDiv({ cls: "investment-tracker-chart-legend-item" });
    entry.createSpan({ cls: `investment-tracker-chart-dot ${item.className}` });
    entry.createSpan({ text: item.label });
  }
}

export interface PerformanceChartSeries {
  label: string;
  values: DatedAmount[];
  className: string;
}

export interface PerformanceChartOptions {
  kind: "rate" | "money";
  currency: Currency;
  flowMarkers?: Array<{ date: string; amount: number }>;
}

function chartValue(value: number, options: PerformanceChartOptions): string {
  return options.kind === "rate" ? formatSignedRate(value) : formatMoney(value, options.currency);
}

function chartAxisValue(value: number, options: PerformanceChartOptions): string {
  if (options.kind === "rate") {
    const percentagePoints = Math.round(value * 100);
    return `${percentagePoints < 0 ? "−" : ""}${Math.abs(percentagePoints)}%`;
  }
  return new Intl.NumberFormat(getIntlLocale(), {
    style: "currency",
    currency: options.currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function renderPerformanceChart(
  parent: HTMLElement,
  inputSeries: PerformanceChartSeries[],
  options: PerformanceChartOptions,
): void {
  const available = inputSeries
    .map((series) => ({
      ...series,
      values: [...series.values]
        .filter((point) => Number.isFinite(point.amount))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .filter((series) => series.values.length > 0);
  if (available.length === 0) {
    parent.createDiv({ cls: "investment-tracker-empty-chart", text: t("There is not enough monthly data to chart this range") });
    return;
  }

  const allPoints = available.flatMap((series) => series.values);
  const timestamps = allPoints.map((point) => new Date(`${point.date}T00:00:00Z`).getTime());
  const values = allPoints.map((point) => point.amount);
  const minDate = Math.min(...timestamps);
  const maxDate = Math.max(...timestamps);
  const scale = buildChartScale(values, options.kind);
  const minValue = scale.min;
  const maxValue = scale.max;
  const width = 900;
  const height = 320;
  const padLeft = 76;
  const padRight = 22;
  const padTop = 22;
  const padBottom = 48;
  const xSpan = Math.max(maxDate - minDate, 1);
  const ySpan = Math.max(maxValue - minValue, 1e-12);
  const xForDate = (date: string) =>
    padLeft + ((new Date(`${date}T00:00:00Z`).getTime() - minDate) / xSpan) * (width - padLeft - padRight);
  const yForValue = (value: number) =>
    height - padBottom - ((value - minValue) / ySpan) * (height - padTop - padBottom);

  const wrap = parent.createDiv({ cls: "investment-tracker-performance-chart-wrap" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", options.kind === "rate" ? t("Cumulative monthly return trend") : t("Monthly asset value trend"));
  svg.classList.add("investment-tracker-chart", "investment-tracker-performance-chart");
  wrap.appendChild(svg);

  for (const value of [...scale.ticks].reverse()) {
    const y = yForValue(value);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", String(padLeft));
    line.setAttribute("x2", String(width - padRight));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", `investment-tracker-chart-grid${Math.abs(value) < 1e-12 ? " is-zero" : ""}`);
    svg.appendChild(line);
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(padLeft - 10));
    label.setAttribute("y", String(y + 4));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "investment-tracker-chart-axis-label");
    label.textContent = chartAxisValue(value, options);
    svg.appendChild(label);
  }

  const uniqueDates = [...new Set(allPoints.map((point) => point.date))].sort();
  const tickStep = Math.max(1, Math.ceil(uniqueDates.length / 6));
  uniqueDates.forEach((date, index) => {
    if (index % tickStep !== 0 && index !== uniqueDates.length - 1) return;
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", String(xForDate(date)));
    label.setAttribute("y", String(height - 16));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "investment-tracker-chart-axis-label");
    label.textContent = date.slice(0, 7);
    svg.appendChild(label);
  });

  const seriesElements = new Map<string, SVGElement[]>();
  for (const series of available) {
    const pathData = series.values
      .map((point, index) => `${index === 0 ? "M" : "L"}${xForDate(point.date).toFixed(2)},${yForValue(point.amount).toFixed(2)}`)
      .join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    path.setAttribute("class", `investment-tracker-chart-line ${series.className}`);
    svg.appendChild(path);
    const elements: SVGElement[] = [path];
    for (const point of series.values) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(xForDate(point.date)));
      circle.setAttribute("cy", String(yForValue(point.amount)));
      circle.setAttribute("r", "4");
      circle.setAttribute("class", `investment-tracker-chart-point ${series.className}`);
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${series.label} · ${point.date.slice(0, 7)} · ${chartValue(point.amount, options)}`;
      circle.appendChild(title);
      svg.appendChild(circle);
      elements.push(circle);
    }
    seriesElements.set(series.label, elements);
  }

  const displayedFlowMarkers = (options.flowMarkers ?? []).filter(
    (marker) => marker.date >= uniqueDates[0]! && marker.date <= uniqueDates.at(-1)!,
  );
  const markerGroups: Array<{ group: SVGGElement; marker: { date: string; amount: number } }> = [];
  displayedFlowMarkers.forEach((marker, index) => {
    const x = xForDate(marker.date);
    const y = height - padBottom + 11;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.dataset.flowMarkerIndex = String(index);
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "img");
    group.setAttribute(
      "aria-label",
      t("{month}, {flow}, {amount}", {
        month: marker.date.slice(0, 7),
        flow: marker.amount >= 0 ? t("Net contribution this month") : t("Net withdrawal this month"),
        amount: formatMoney(Math.abs(marker.amount), options.currency),
      }),
    );
    const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    hitArea.setAttribute("cx", String(x));
    hitArea.setAttribute("cy", String(y));
    hitArea.setAttribute("r", "12");
    hitArea.setAttribute("class", "investment-tracker-flow-marker-hit");
    group.appendChild(hitArea);
    const symbol = document.createElementNS("http://www.w3.org/2000/svg", "path");
    symbol.setAttribute(
      "d",
      marker.amount >= 0
        ? `M ${x} ${y - 6} L ${x - 6} ${y + 5} L ${x + 6} ${y + 5} Z`
        : `M ${x - 6} ${y - 5} L ${x + 6} ${y - 5} L ${x} ${y + 6} Z`,
    );
    symbol.setAttribute("class", marker.amount >= 0 ? "investment-tracker-flow-marker is-in" : "investment-tracker-flow-marker is-out");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = t("{month} · {flow} {amount}", {
      month: marker.date.slice(0, 7),
      flow: marker.amount >= 0 ? t("Net contribution this month") : t("Net withdrawal this month"),
      amount: formatMoney(Math.abs(marker.amount), options.currency),
    });
    group.appendChild(symbol);
    group.appendChild(title);
    svg.appendChild(group);
    markerGroups.push({ group, marker });
  });

  const crosshair = document.createElementNS("http://www.w3.org/2000/svg", "line");
  crosshair.setAttribute("y1", String(padTop));
  crosshair.setAttribute("y2", String(height - padBottom));
  crosshair.setAttribute("class", "investment-tracker-chart-crosshair");
  svg.appendChild(crosshair);
  const tooltip = wrap.createDiv({ cls: "investment-tracker-chart-tooltip" });
  const positionTooltip = (date: string) => {
    const rect = svg.getBoundingClientRect();
    const x = xForDate(date);
    crosshair.setAttribute("x1", String(x));
    crosshair.setAttribute("x2", String(x));
    crosshair.classList.add("is-visible");
    tooltip.classList.add("is-visible");
    const pixelX = (x / width) * rect.width;
    tooltip.style.left = `${Math.min(Math.max(pixelX, 90), Math.max(rect.width - 120, 90))}px`;
  };
  const addSeriesTooltipRows = (date: string) => {
    for (const series of available) {
      const point = series.values.find((candidate) => candidate.date === date);
      if (point) tooltip.createDiv({ text: t("{label}: {value}", { label: series.label, value: chartValue(point.amount, options) }) });
    }
  };
  const addFlowTooltipRow = (marker: { date: string; amount: number }) => {
    tooltip.createDiv({
      cls: `investment-tracker-chart-tooltip-flow ${marker.amount >= 0 ? "is-in" : "is-out"}`,
      text: t("{flow}: {amount}", {
        flow: marker.amount >= 0 ? t("▲ Net contribution this month") : t("▼ Net withdrawal this month"),
        amount: formatMoney(Math.abs(marker.amount), options.currency),
      }),
    });
  };
  const showFlowTooltip = (marker: { date: string; amount: number }) => {
    tooltip.empty();
    tooltip.createDiv({ cls: "investment-tracker-chart-tooltip-date", text: marker.date.slice(0, 7) });
    addSeriesTooltipRows(marker.date);
    addFlowTooltipRow(marker);
    positionTooltip(marker.date);
  };
  svg.addEventListener("pointermove", (event) => {
    const markerGroup = event.target instanceof SVGElement
      ? event.target.closest<SVGGElement>("[data-flow-marker-index]")
      : null;
    if (markerGroup) {
      const marker = displayedFlowMarkers[Number(markerGroup.dataset.flowMarkerIndex)];
      if (marker) showFlowTooltip(marker);
      return;
    }
    const rect = svg.getBoundingClientRect();
    const viewX = ((event.clientX - rect.left) / Math.max(rect.width, 1)) * width;
    const nearest = uniqueDates.reduce((best, date) =>
      Math.abs(xForDate(date) - viewX) < Math.abs(xForDate(best) - viewX) ? date : best,
    );
    tooltip.empty();
    tooltip.createDiv({ cls: "investment-tracker-chart-tooltip-date", text: nearest.slice(0, 7) });
    addSeriesTooltipRows(nearest);
    for (const marker of displayedFlowMarkers.filter((candidate) => candidate.date === nearest)) {
      addFlowTooltipRow(marker);
    }
    positionTooltip(nearest);
  });
  svg.addEventListener("pointerleave", () => {
    crosshair.classList.remove("is-visible");
    tooltip.classList.remove("is-visible");
  });
  for (const { group, marker } of markerGroups) {
    group.addEventListener("focus", () => showFlowTooltip(marker));
    group.addEventListener("blur", () => {
      crosshair.classList.remove("is-visible");
      tooltip.classList.remove("is-visible");
    });
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      showFlowTooltip(marker);
    });
  }

  const legend = wrap.createDiv({ cls: "investment-tracker-chart-legend" });
  for (const series of available) {
    const button = legend.createEl("button", {
      cls: "investment-tracker-chart-legend-button",
      attr: { "aria-pressed": "true" },
    });
    button.createSpan({ cls: `investment-tracker-chart-dot ${series.className}` });
    button.createSpan({ text: series.label });
    button.addEventListener("click", () => {
      const visible = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", visible ? "false" : "true");
      for (const element of seriesElements.get(series.label) ?? []) element.classList.toggle("is-hidden", visible);
    });
  }
  if (displayedFlowMarkers.length > 0) {
    const inEntry = legend.createDiv({ cls: "investment-tracker-chart-legend-item" });
    inEntry.createSpan({ cls: "investment-tracker-flow-legend-symbol is-in" });
    inEntry.createSpan({ text: t("Net contribution this month") });
    const outEntry = legend.createDiv({ cls: "investment-tracker-chart-legend-item" });
    outEntry.createSpan({ cls: "investment-tracker-flow-legend-symbol is-out" });
    outEntry.createSpan({ text: t("Net withdrawal this month") });
  }
}
