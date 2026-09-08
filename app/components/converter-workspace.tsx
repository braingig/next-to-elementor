"use client";

import { useCallback, useMemo, useState } from "react";
import type { ConversionResult, ReportNodeEntry } from "@/lib/converter";
import {
  downloadElementorJson,
  requestConvert,
} from "@/app/lib/convert-client";

const SAMPLE_SOURCE = `export function HeroSection() {
  return (
    <section className="flex flex-col items-center gap-6 px-6 py-16 md:flex-row">
      <div className="flex flex-col gap-4 max-w-xl">
        <h1 className="text-4xl font-bold text-slate-900 md:text-5xl">
          Build pages faster
        </h1>
        <p className="text-lg text-slate-600">
          Convert carefully structured React sections into Elementor Free layouts.
        </p>
        <a
          role="button"
          href="/start"
          className="bg-teal-700 text-white px-5 py-3 rounded-lg font-semibold"
        >
          Get started
        </a>
      </div>
    </section>
  );
}
`;

type UiError = string | null;

function outcomeLabel(outcome: ConversionResult["outcome"]): string {
  switch (outcome) {
    case "complete":
      return "Complete";
    case "partial":
      return "Partial";
    case "failed":
      return "Failed";
  }
}

function outcomeTone(outcome: ConversionResult["outcome"]): string {
  switch (outcome) {
    case "complete":
      return "bg-emerald-100 text-emerald-900 border-emerald-300";
    case "partial":
      return "bg-amber-100 text-amber-950 border-amber-300";
    case "failed":
      return "bg-rose-100 text-rose-950 border-rose-300";
  }
}

export function ConverterWorkspace() {
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [css, setCss] = useState("");
  const [title, setTitle] = useState("converted-section");
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState<UiError>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const unsupportedNodes = useMemo(
    () =>
      result?.report.nodes.filter((n) => n.decision === "unsupported") ?? [],
    [result],
  );
  const customNodes = useMemo(
    () => result?.report.nodes.filter((n) => n.decision === "custom") ?? [],
    [result],
  );

  const canDownload = Boolean(result?.elementorJson);

  const onConvert = useCallback(async () => {
    setUiError(null);
    if (!source.trim()) {
      setUiError("Source TSX/JSX is required.");
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const response = await requestConvert({
        source,
        css,
        language: "auto",
        title: title.trim() || "converted-section",
      });
      if (!response.ok) {
        setResult(null);
        setUiError(response.error);
        return;
      }
      setResult(response.result);
    } catch (error) {
      setResult(null);
      setUiError(
        error instanceof Error ? error.message : "Convert request failed.",
      );
    } finally {
      setLoading(false);
    }
  }, [source, css, title]);

  const onClear = useCallback(() => {
    setSource("");
    setCss("");
    setTitle("converted-section");
    setResult(null);
    setUiError(null);
    setLoading(false);
  }, []);

  const onDownload = useCallback(() => {
    if (!result?.elementorJson) return;
    const safe =
      (title.trim() || "converted-section")
        .replace(/[^a-zA-Z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "converted-section";
    downloadElementorJson(result.elementorJson, `${safe}.json`);
  }, [result, title]);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-2 border-b border-zinc-200 pb-6">
        <p className="text-sm font-medium tracking-wide text-teal-800 uppercase">
          next-to-elementor
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          React → Elementor Free converter
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-zinc-600">
          Paste a TSX/JSX section, optionally add CSS, convert with the Free 4.2.4
          engine, preview the classic Elementor JSON, and download it. Conversion
          is static analysis only — your source is never executed.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="convert-title"
              className="text-sm font-medium text-zinc-800"
            >
              Document title
            </label>
            <input
              id="convert-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="convert-source"
              className="text-sm font-medium text-zinc-800"
            >
              Source (TSX / JSX)
            </label>
            <textarea
              id="convert-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              spellCheck={false}
              disabled={loading}
              className="min-h-[280px] resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200 sm:min-h-[360px] sm:text-sm"
              placeholder="export function Section() { return <h1>Hello</h1>; }"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="convert-css"
              className="text-sm font-medium text-zinc-800"
            >
              Optional CSS
            </label>
            <textarea
              id="convert-css"
              value={css}
              onChange={(e) => setCss(e.target.value)}
              spellCheck={false}
              disabled={loading}
              className="min-h-[120px] resize-y rounded-lg border border-zinc-300 bg-zinc-50 p-3 font-mono text-xs leading-5 text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200 sm:text-sm"
              placeholder=".hero { display: flex; }"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onConvert}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Converting…" : "Convert"}
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={loading || !canDownload}
              className="inline-flex items-center justify-center rounded-lg border border-teal-700 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Download JSON
            </button>
          </div>

          {loading ? (
            <p
              className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
              role="status"
              aria-live="polite"
            >
              Running static conversion against Elementor Free 4.2.4…
            </p>
          ) : null}

          {uiError ? (
            <p
              className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-950"
              role="alert"
            >
              {uiError}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          {!result ? (
            <div className="flex min-h-[280px] flex-col items-start justify-center gap-2 text-zinc-500 sm:min-h-[360px]">
              <p className="text-base font-medium text-zinc-700">
                No conversion yet
              </p>
              <p className="text-sm leading-relaxed">
                Click Convert to see outcome, unsupported/custom report,
                diagnostics, and Elementor JSON preview.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase ${outcomeTone(result.outcome)}`}
                >
                  {outcomeLabel(result.outcome)}
                </span>
                <span className="text-sm text-zinc-600">
                  Target Elementor Free {result.elementorTarget}
                </span>
              </div>

              <p className="text-sm leading-relaxed text-zinc-700">
                {result.report.summary.message}
              </p>

              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Stat label="Nodes" value={result.report.summary.totalNodes} />
                <Stat label="Native" value={result.report.summary.nativeCount} />
                <Stat label="Custom" value={result.report.summary.customCount} />
                <Stat
                  label="Unsupported"
                  value={result.report.summary.unsupportedCount}
                />
                <Stat
                  label="Warnings"
                  value={result.report.summary.warningCount}
                />
                <Stat label="Errors" value={result.report.summary.errorCount} />
              </dl>

              <ReportList
                title="Unsupported nodes"
                empty="No unsupported nodes."
                nodes={unsupportedNodes}
              />
              <ReportList
                title="Custom HTML fallbacks"
                empty="No custom fallbacks."
                nodes={customNodes}
              />

              {result.report.diagnostics.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Diagnostics
                  </h2>
                  <ul className="flex max-h-40 flex-col gap-2 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
                    {result.report.diagnostics.map((d, i) => (
                      <li key={`${d.code}-${i}`}>
                        <span className="font-semibold uppercase">
                          {d.severity}
                        </span>
                        {": "}
                        <span className="font-mono">{d.code}</span> — {d.message}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Elementor JSON preview
                </h2>
                {result.elementorJson ? (
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px] leading-4 text-zinc-100 sm:text-xs">
                    {JSON.stringify(result.elementorJson, null, 2)}
                  </pre>
                ) : (
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                    No JSON emitted for this failed conversion.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="text-lg font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}

function ReportList({
  title,
  empty,
  nodes,
}: {
  title: string;
  empty: string;
  nodes: ReportNodeEntry[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {nodes.length === 0 ? (
        <p className="text-sm text-zinc-500">{empty}</p>
      ) : (
        <ul className="flex max-h-40 flex-col gap-2 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
          {nodes.map((n) => (
            <li key={n.nodeId}>
              <span className="font-mono">{n.irKind}</span>
              {n.widgetType ? (
                <>
                  {" → "}
                  <span className="font-mono">{n.widgetType}</span>
                </>
              ) : null}
              {n.reasonCode ? (
                <>
                  {" "}
                  <span className="font-mono text-rose-800">({n.reasonCode})</span>
                </>
              ) : null}
              <div className="text-zinc-600">{n.message}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
