"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { downloadElementorJson } from "@/app/lib/convert-client";
import {
  requestProjectAnalyze,
  requestProjectConvert,
  routeDownloadFilename,
  type ProjectAnalyzeClientResult,
  type ProjectConvertClientResult,
} from "@/app/lib/project-client";
import type { ProjectConvertSuccess } from "@/app/lib/project-api-types";

type AnalyzeOk = Extract<ProjectAnalyzeClientResult, { ok: true }>;
type ConvertOk = Extract<ProjectConvertClientResult, { ok: true }>;
type RouteResult = ProjectConvertSuccess["result"]["routes"][number];

function outcomeLabel(outcome: string): string {
  if (outcome === "complete") return "Complete";
  if (outcome === "partial") return "Partial";
  return "Failed";
}

function outcomeTone(outcome: string): string {
  if (outcome === "complete") {
    return "bg-emerald-100 text-emerald-900 border-emerald-300";
  }
  if (outcome === "partial") {
    return "bg-amber-100 text-amber-950 border-amber-300";
  }
  return "bg-rose-100 text-rose-950 border-rose-300";
}

export function ProjectZipPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"analyze" | "convert" | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeOk | null>(null);
  const [convertResult, setConvertResult] = useState<ConvertOk | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string>("");

  const selectedRoute: RouteResult | null = useMemo(() => {
    if (!convertResult) return null;
    const routes = convertResult.result.routes;
    return (
      routes.find((r) => r.route.id === selectedRouteId) ?? routes[0] ?? null
    );
  }, [convertResult, selectedRouteId]);

  const onZipPicked = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setZipFile(file);
    setUiError(null);
    setAnalysis(null);
    setConvertResult(null);
    setSelectedRouteId("");
    event.target.value = "";
  }, []);

  const onAnalyze = useCallback(async () => {
    if (!zipFile) {
      setUiError("Select a project ZIP first.");
      return;
    }
    setBusy("analyze");
    setUiError(null);
    setConvertResult(null);
    try {
      const response = await requestProjectAnalyze(zipFile);
      if (!response.ok) {
        setAnalysis(null);
        setUiError(response.error);
        return;
      }
      setAnalysis(response);
    } catch (error) {
      setAnalysis(null);
      setUiError(
        error instanceof Error ? error.message : "Project analyze failed.",
      );
    } finally {
      setBusy(null);
    }
  }, [zipFile]);

  const onConvert = useCallback(async () => {
    if (!zipFile) {
      setUiError("Select a project ZIP first.");
      return;
    }
    setBusy("convert");
    setUiError(null);
    try {
      const response = await requestProjectConvert(zipFile);
      if (!response.ok) {
        setConvertResult(null);
        setUiError(response.error);
        return;
      }
      setConvertResult(response);
      setSelectedRouteId(response.result.routes[0]?.route.id ?? "");
      // Keep / refresh analysis snapshot from convert result when present.
      if (!analysis) {
        setAnalysis({
          ok: true,
          analysis: {
            manifest: response.result.manifest,
            routes: response.result.routes.map((r) => r.route),
            diagnostics: response.result.diagnostics,
          },
          vfsStats: {
            zipBytes: 0,
            uncompressedBytes: 0,
            archiveEntryCount: 0,
            fileCount: 0,
            textFileCount: 0,
            binaryFileCount: 0,
            ignoredCount: 0,
          },
        });
      }
    } catch (error) {
      setConvertResult(null);
      setUiError(
        error instanceof Error ? error.message : "Project convert failed.",
      );
    } finally {
      setBusy(null);
    }
  }, [zipFile, analysis]);

  const onClear = useCallback(() => {
    setZipFile(null);
    setUiError(null);
    setAnalysis(null);
    setConvertResult(null);
    setSelectedRouteId("");
    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const onDownloadSelected = useCallback(() => {
    if (!selectedRoute?.conversion.elementorJson) return;
    downloadElementorJson(
      selectedRoute.conversion.elementorJson,
      routeDownloadFilename(selectedRoute.route.path),
    );
  }, [selectedRoute]);

  const onCopySelected = useCallback(async () => {
    if (!selectedRoute?.conversion.elementorJson) return;
    const text = JSON.stringify(selectedRoute.conversion.elementorJson, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setUiError("Unable to copy JSON to the clipboard.");
    }
  }, [selectedRoute]);

  const loading = busy !== null;
  const discoveredRoutes = analysis?.analysis.routes ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-800">
            Project ZIP
          </span>
          <input
            ref={inputRef}
            id="project-zip"
            type="file"
            accept=".zip,application/zip"
            disabled={loading}
            onChange={onZipPicked}
            className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-900"
          />
          <p className="text-xs text-zinc-500">
            Upload a React/Next project archive. Source is never executed;{" "}
            <code className="font-mono">node_modules</code> is ignored.
          </p>
          {zipFile ? (
            <p className="text-sm text-zinc-700">
              Selected:{" "}
              <span className="font-mono text-xs">{zipFile.name}</span> (
              {Math.round(zipFile.size / 1024)} KiB)
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            onClick={onAnalyze}
            disabled={loading || !zipFile}
            className="inline-flex items-center justify-center rounded-lg border border-teal-700 bg-teal-50 px-4 py-2.5 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "analyze" ? "Analyzing…" : "Analyze project"}
          </button>
          <button
            type="button"
            onClick={onConvert}
            disabled={loading || !zipFile}
            className="inline-flex items-center justify-center rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy === "convert" ? "Converting…" : "Convert project"}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear
          </button>
        </div>

        {busy ? (
          <p
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900"
            role="status"
            aria-live="polite"
          >
            {busy === "analyze"
              ? "Inspecting ZIP, detecting framework, discovering routes…"
              : "Converting each visual route to Elementor Free JSON…"}
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

        {analysis ? (
          <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <h2 className="text-sm font-semibold text-zinc-900">
              Project analysis
            </h2>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-zinc-500">Framework</dt>
                <dd className="font-medium text-zinc-900">
                  {analysis.analysis.manifest.framework}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Confidence</dt>
                <dd className="font-medium text-zinc-900">
                  {analysis.analysis.manifest.frameworkConfidence}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Routes</dt>
                <dd className="font-medium text-zinc-900">
                  {discoveredRoutes.length}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">TypeScript</dt>
                <dd className="font-medium text-zinc-900">
                  {analysis.analysis.manifest.typescript ? "yes" : "no"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-zinc-700 uppercase">
                Discovered routes
              </h3>
              {discoveredRoutes.length === 0 ? (
                <p className="text-sm text-zinc-600">No visual routes found.</p>
              ) : (
                <ul className="max-h-56 overflow-auto rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-800">
                  {discoveredRoutes.map((route) => (
                    <li
                      key={route.id}
                      className="border-b border-zinc-100 px-2 py-2 last:border-0"
                    >
                      <div className="font-mono font-semibold">{route.path}</div>
                      <div className="text-zinc-500">
                        {route.entryFile}
                        {route.isDynamic ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-950 uppercase">
                            dynamic pattern
                          </span>
                        ) : null}
                      </div>
                      {route.layoutChain.length > 0 ? (
                        <div className="mt-1 text-zinc-500">
                          layouts: {route.layoutChain.join(" → ")}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {discoveredRoutes.some((r) => r.isDynamic) ? (
                <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  Dynamic routes keep pattern paths like{" "}
                  <code className="font-mono">/blog/[slug]</code>. Concrete URLs
                  are not invented — a real parameter is required before
                  publishing.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
        {!convertResult ? (
          <div className="flex min-h-[280px] flex-col items-start justify-center gap-2 text-zinc-500 sm:min-h-[360px]">
            <p className="text-base font-medium text-zinc-700">
              No project conversion yet
            </p>
            <p className="text-sm leading-relaxed">
              Analyze to preview routes, then Convert to generate one Elementor
              Free document per visual route.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase ${outcomeTone(convertResult.result.outcome)}`}
              >
                {outcomeLabel(convertResult.result.outcome)}
              </span>
              <span className="text-sm text-zinc-600">
                {convertResult.result.projectReport.message}
              </span>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat
                label="Complete"
                value={convertResult.result.projectReport.completeRoutes}
              />
              <Stat
                label="Partial"
                value={convertResult.result.projectReport.partialRoutes}
              />
              <Stat
                label="Failed"
                value={convertResult.result.projectReport.failedRoutes}
              />
              <Stat
                label="Documents"
                value={convertResult.result.projectReport.usableDocuments}
              />
            </dl>

            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">
                Per-route results
              </h2>
              <ul className="flex max-h-48 flex-col gap-2 overflow-auto">
                {convertResult.result.routes.map((r) => (
                  <li key={r.route.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRouteId(r.route.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${
                        selectedRoute?.route.id === r.route.id
                          ? "border-teal-600 bg-teal-50"
                          : "border-zinc-200 bg-zinc-50 hover:bg-white"
                      }`}
                    >
                      <span className="font-mono text-xs font-semibold text-zinc-900">
                        {r.route.path}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${outcomeTone(r.outcome)}`}
                      >
                        {outcomeLabel(r.outcome)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {selectedRoute ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    Selected:{" "}
                    <span className="font-mono">{selectedRoute.route.path}</span>
                  </h2>
                  {selectedRoute.route.isDynamic ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-amber-950 uppercase">
                      dynamic pattern
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-zinc-600">
                  {selectedRoute.route.entryFile}
                  {selectedRoute.unit
                    ? ` · layout ${selectedRoute.unit.layoutMode} · ${selectedRoute.unit.moduleCount} modules`
                    : null}
                </p>
                <p className="text-sm text-zinc-700">
                  {selectedRoute.conversion.report.summary.message}
                </p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={onDownloadSelected}
                    disabled={!selectedRoute.conversion.elementorJson}
                    className="inline-flex items-center justify-center rounded-lg border border-teal-700 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Download route JSON
                  </button>
                  <button
                    type="button"
                    onClick={onCopySelected}
                    disabled={!selectedRoute.conversion.elementorJson}
                    className="inline-flex items-center justify-center rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Copy JSON
                  </button>
                </div>

                {selectedRoute.conversion.elementorJson ? (
                  <pre className="max-h-[320px] overflow-auto rounded-lg border border-zinc-200 bg-zinc-950 p-3 font-mono text-[11px] leading-4 text-zinc-100 sm:text-xs">
                    {JSON.stringify(
                      selectedRoute.conversion.elementorJson,
                      null,
                      2,
                    )}
                  </pre>
                ) : (
                  <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                    No JSON for this failed route.
                  </p>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
