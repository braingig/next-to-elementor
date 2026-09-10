"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { ConversionResult, ReportNodeEntry } from "@/lib/converter";
import {
  downloadElementorJson,
  requestConvert,
} from "@/app/lib/convert-client";
import {
  readFolderSelection,
  type FolderSelection,
} from "@/app/lib/folder-files";
import { ProjectZipPanel } from "@/app/components/project-zip-panel";

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

type InputMode = "file" | "folder" | "project";
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
  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [source, setSource] = useState(SAMPLE_SOURCE);
  const [css, setCss] = useState("");
  const [title, setTitle] = useState("converted-section");
  const [loading, setLoading] = useState(false);
  const [uiError, setUiError] = useState<UiError>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);

  const [folderSelection, setFolderSelection] = useState<FolderSelection | null>(
    null,
  );
  const [entryPath, setEntryPath] = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

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

  const onModeChange = useCallback((mode: InputMode) => {
    setInputMode(mode);
    setUiError(null);
    setResult(null);
  }, []);

  const onFolderPicked = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const list = event.target.files;
      setUiError(null);
      setResult(null);
      if (!list || list.length === 0) {
        setFolderSelection(null);
        setEntryPath("");
        return;
      }
      try {
        const selection = await readFolderSelection(list);
        setFolderSelection(selection);
        const entry =
          selection.suggestedEntryPath ??
          selection.entryCandidates?.[0] ??
          selection.componentPaths[0] ??
          "";
        setEntryPath(entry);
        if (selection.css) {
          setCss(selection.css);
        }
        if (selection.sectionName) {
          setTitle(selection.sectionName);
        }
        if (selection.entryError && !selection.suggestedEntryPath) {
          setUiError(
            `${selection.entryError} Select an entry file below, then Convert.`,
          );
        }
      } catch (error) {
        setFolderSelection(null);
        setEntryPath("");
        setUiError(
          error instanceof Error
            ? error.message
            : "Failed to read the selected folder.",
        );
      }
      // Allow re-selecting the same folder.
      event.target.value = "";
    },
    [],
  );

  const onConvert = useCallback(async () => {
    setUiError(null);
    setLoading(true);
    try {
      if (inputMode === "file") {
        if (!source.trim()) {
          setUiError("Source TSX/JSX is required.");
          setResult(null);
          return;
        }
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
        return;
      }

      if (!folderSelection || folderSelection.componentPaths.length === 0) {
        setUiError("Select a section folder that contains TSX/JSX files.");
        setResult(null);
        return;
      }
      if (!entryPath.trim()) {
        setUiError("Choose an entry component file.");
        setResult(null);
        return;
      }

      const response = await requestConvert({
        mode: "folder",
        files: folderSelection.files,
        entryPath: entryPath.trim(),
        sectionName: folderSelection.sectionName,
        css,
        language: "auto",
        title: title.trim() || folderSelection.sectionName || "converted-section",
      });
      if (!response.ok) {
        setResult(null);
        const extra =
          response.candidates && response.candidates.length > 0
            ? ` Candidates: ${response.candidates.join(", ")}`
            : "";
        setUiError(`${response.error}${extra}`);
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
  }, [inputMode, source, css, title, folderSelection, entryPath]);

  const onClear = useCallback(() => {
    setSource(inputMode === "file" ? "" : SAMPLE_SOURCE);
    setCss("");
    setTitle("converted-section");
    setResult(null);
    setUiError(null);
    setLoading(false);
    setFolderSelection(null);
    setEntryPath("");
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  }, [inputMode]);

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
          Convert a single TSX/JSX file, a section folder with local imports, or a
          full React/Next project ZIP into Elementor Free 4.2.4 classic JSON.
          Static analysis only — uploaded source is never executed.
        </p>
      </header>

      <div
        className="inline-flex rounded-lg border border-zinc-300 bg-zinc-50 p-1"
        role="group"
        aria-label="Input mode"
      >
        <ModeButton
          active={inputMode === "file"}
          disabled={loading}
          onClick={() => onModeChange("file")}
        >
          Single File
        </ModeButton>
        <ModeButton
          active={inputMode === "folder"}
          disabled={loading}
          onClick={() => onModeChange("folder")}
        >
          Section Folder
        </ModeButton>
        <ModeButton
          active={inputMode === "project"}
          disabled={loading}
          onClick={() => onModeChange("project")}
        >
          Project ZIP
        </ModeButton>
      </div>

      {inputMode === "project" ? (
        <ProjectZipPanel />
      ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-800">Input</span>
          </div>

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

          {inputMode === "file" ? (
            <>
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
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-zinc-800">
                  Section folder
                </span>
                <input
                  ref={folderInputRef}
                  id="convert-folder"
                  type="file"
                  multiple
                  disabled={loading}
                  onChange={onFolderPicked}
                  className="block w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-800 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-900"
                  {...({
                    webkitdirectory: "",
                    directory: "",
                  } as Record<string, string>)}
                />
                <p className="text-xs text-zinc-500">
                  Selects a folder in the browser and builds a relative virtual file
                  map (.tsx/.ts/.jsx/.js/.css). Absolute paths are never uploaded.
                </p>
              </div>

              {folderSelection ? (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-zinc-800">
                      Selected: {folderSelection.sectionName}/
                    </span>
                    <ul className="max-h-40 overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-xs text-zinc-800">
                      {folderSelection.textPaths.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                      {folderSelection.assetPaths.map((p) => (
                        <li key={`asset-${p}`} className="text-zinc-500">
                          {p}{" "}
                          <span className="italic">(asset — not uploaded)</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="convert-entry"
                      className="text-sm font-medium text-zinc-800"
                    >
                      Entry
                    </label>
                    <select
                      id="convert-entry"
                      value={entryPath}
                      onChange={(e) => setEntryPath(e.target.value)}
                      disabled={loading}
                      className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-200"
                    >
                      {folderSelection.componentPaths.length === 0 ? (
                        <option value="">No component files found</option>
                      ) : (
                        folderSelection.componentPaths.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {folderSelection.assetPaths.length > 0 ? (
                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                      Image/font assets were detected but are not uploaded to
                      WordPress. Elementor will keep URL strings (for example{" "}
                      <code className="font-mono text-xs">/assets/hero.png</code>
                      ) — they will not resolve unless that URL exists on the
                      target site.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  No folder selected yet.
                </p>
              )}
            </div>
          )}

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
            {inputMode === "folder" ? (
              <p className="text-xs text-zinc-500">
                Folder <code className="font-mono">.css</code> files are concatenated
                here automatically. CSS <code className="font-mono">import</code>{" "}
                resolution is not implemented yet.
              </p>
            ) : null}
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
      )}
    </div>
  );
}

function ModeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded-md px-3 py-1.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "bg-white text-teal-900 shadow-sm"
          : "text-zinc-600 hover:text-zinc-900"
      }`}
    >
      {children}
    </button>
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
