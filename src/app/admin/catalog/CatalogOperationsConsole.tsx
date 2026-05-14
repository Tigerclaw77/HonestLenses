/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo, useState } from "react";
import type { LensCore } from "@/LensCore/types";
import type {
  CatalogDraft,
  CatalogIssue,
  CatalogLensSummary,
  CatalogSnapshot,
} from "@/lib/catalogOps/types";
import {
  buildParameterPreview,
  getCatalogAssetSummary,
  validateCatalogDraft,
} from "@/lib/catalogOps/validation";

type ConsoleMode = "view" | "add" | "edit" | "clone";
type VisibilityFilter = "all" | "visible" | "hidden" | "missing-image" | "issues";

function formatCents(cents: number | null): string {
  if (cents === null) return "Missing";
  return `$${(cents / 100).toFixed(2)}`;
}

function issueCounts(issues: readonly CatalogIssue[]) {
  return {
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
    info: issues.filter((issue) => issue.severity === "info").length,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseParametersJson(value: string): {
  parameters: LensCore["parameters"] | null;
  error: string | null;
} {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!isRecord(parsed)) {
      return {
        parameters: null,
        error: "Parameters JSON must be an object.",
      };
    }

    return {
      parameters: parsed as LensCore["parameters"],
      error: null,
    };
  } catch (error) {
    return {
      parameters: null,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

function splitSkuList(value: string): string[] {
  return value
    .split(",")
    .map((sku) => sku.trim())
    .filter(Boolean);
}

function draftFromLens(lens: CatalogLensSummary): CatalogDraft {
  return {
    originalCoreId: lens.coreId,
    coreId: lens.coreId,
    displayName: lens.displayName,
    manufacturer:
      lens.manufacturer === "VISTAKON" ||
      lens.manufacturer === "ALCON" ||
      lens.manufacturer === "BAUSCH + LOMB" ||
      lens.manufacturer === "COOPERVISION"
        ? lens.manufacturer
        : "",
    replacement:
      lens.replacement === "DD" ||
      lens.replacement === "1W" ||
      lens.replacement === "2W" ||
      lens.replacement === "1M"
        ? lens.replacement
        : "",
    toric: lens.type.toric,
    multifocal: lens.type.multifocal,
    browseVisible: lens.browseVisible,
    imageRef: lens.asset.imageRef,
    skus: lens.skus.map((sku) => sku.sku),
    parameters: lens.parameters,
    acknowledgeMissingImage: !lens.asset.exists,
  };
}

function emptyDraft(): CatalogDraft {
  return {
    coreId: "",
    displayName: "",
    manufacturer: "",
    replacement: "",
    toric: false,
    multifocal: false,
    browseVisible: true,
    imageRef: "",
    skus: [],
    parameters: {},
    acknowledgeMissingImage: false,
  };
}

function cloneDraft(lens: CatalogLensSummary): CatalogDraft {
  return {
    ...draftFromLens(lens),
    originalCoreId: undefined,
    coreId: `${lens.coreId}_COPY`,
    displayName: `${lens.displayName} Copy`,
    imageRef: `${lens.coreId}_COPY`,
    acknowledgeMissingImage: true,
  };
}

function buildLensSnippet(draft: CatalogDraft): string {
  return JSON.stringify(
    {
      coreId: draft.coreId.trim(),
      displayName: draft.displayName.trim(),
      manufacturer: draft.manufacturer,
      replacement: draft.replacement,
      type: {
        toric: draft.toric,
        multifocal: draft.multifocal,
      },
      parameters: draft.parameters ?? {},
    },
    null,
    2,
  );
}

function buildSkuMappingSnippet(draft: CatalogDraft): string {
  return `${draft.coreId.trim()}: ${JSON.stringify(draft.skus)},`;
}

function CatalogImage({
  imageRef,
  assetNames,
  compact = false,
}: {
  imageRef: string;
  assetNames: readonly string[];
  compact?: boolean;
}) {
  const asset = getCatalogAssetSummary(imageRef, assetNames);
  const sources = [
    asset.preferredPath ?? "/lens-images/placeholder.png",
    "/lens-images/placeholder.png",
  ];
  const [fallbackState, setFallbackState] = useState({
    imageRef,
    index: 0,
  });
  const index =
    fallbackState.imageRef === imageRef ? fallbackState.index : 0;

  return (
    <div className={compact ? "imageFrame compact" : "imageFrame"}>
      <img
        src={sources[index]}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() =>
          setFallbackState((current) => {
            const currentIndex =
              current.imageRef === imageRef ? current.index : 0;

            return {
              imageRef,
              index:
                currentIndex < sources.length - 1
                  ? currentIndex + 1
                  : currentIndex,
            };
          })
        }
      />
    </div>
  );
}

function IssueList({ issues }: { issues: readonly CatalogIssue[] }) {
  if (issues.length === 0) {
    return <p className="quiet">No validation issues.</p>;
  }

  return (
    <div className="issueList">
      {issues.map((issue, index) => (
        <div key={`${issue.code}-${index}`} className={`issue ${issue.severity}`}>
          <strong>{issue.severity.toUpperCase()}</strong>
          <span>{issue.message}</span>
          {issue.context && <small>{issue.context}</small>}
        </div>
      ))}
    </div>
  );
}

function ParameterPreview({ lens }: { lens: CatalogLensSummary }) {
  const preview = lens.parameterPreview;

  return (
    <div className="previewGrid">
      <div>
        <span>BC</span>
        <strong>{preview.baseCurves.join(", ") || "None"}</strong>
      </div>
      <div>
        <span>DIA</span>
        <strong>{preview.diameters.join(", ") || "None"}</strong>
      </div>
      <div>
        <span>Sphere</span>
        <strong>{preview.sphereSummary.slice(0, 2).join("; ") || "None"}</strong>
      </div>
      <div>
        <span>Cyl</span>
        <strong>{preview.cylinderValues.join(", ") || "None"}</strong>
      </div>
      <div>
        <span>Axis</span>
        <strong>{preview.axisValues.length || "None"}</strong>
      </div>
      <div>
        <span>Add</span>
        <strong>{preview.addValues.join(", ") || "None"}</strong>
      </div>
    </div>
  );
}

export default function CatalogOperationsConsole({
  snapshot,
}: {
  snapshot: CatalogSnapshot;
}) {
  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] =
    useState<VisibilityFilter>("all");
  const [selectedCoreId, setSelectedCoreId] = useState(
    snapshot.lenses[0]?.coreId ?? "",
  );
  const selectedLens =
    snapshot.lenses.find((lens) => lens.coreId === selectedCoreId) ??
    snapshot.lenses[0];
  const [mode, setMode] = useState<ConsoleMode>("view");
  const [draft, setDraft] = useState<CatalogDraft>(() =>
    selectedLens ? draftFromLens(selectedLens) : emptyDraft(),
  );
  const [parameterJson, setParameterJson] = useState(() =>
    selectedLens ? JSON.stringify(selectedLens.parameters, null, 2) : "{}",
  );

  const filteredLenses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return snapshot.lenses.filter((lens) => {
      const matchesSearch =
        !query ||
        lens.coreId.toLowerCase().includes(query) ||
        lens.displayName.toLowerCase().includes(query);
      const matchesManufacturer =
        manufacturerFilter === "all" ||
        lens.manufacturer === manufacturerFilter;
      const matchesVisibility =
        visibilityFilter === "all" ||
        (visibilityFilter === "visible" && lens.browseVisible) ||
        (visibilityFilter === "hidden" && !lens.browseVisible) ||
        (visibilityFilter === "missing-image" && !lens.asset.exists) ||
        (visibilityFilter === "issues" && lens.issues.length > 0);

      return matchesSearch && matchesManufacturer && matchesVisibility;
    });
  }, [manufacturerFilter, search, snapshot.lenses, visibilityFilter]);

  const parsedParameters = useMemo(
    () => parseParametersJson(parameterJson),
    [parameterJson],
  );

  const effectiveDraft = useMemo(
    () => ({
      ...draft,
      parameters: parsedParameters.parameters,
    }),
    [draft, parsedParameters.parameters],
  );

  const draftIssues = useMemo(() => {
    const issues = validateCatalogDraft({
      draft: effectiveDraft,
      existingCoreIds: snapshot.lenses.map((lens) => lens.coreId),
      assetNames: snapshot.assetNames,
      pricingIndex: snapshot.pricingIndex,
    });

    if (parsedParameters.error) {
      return [
        {
          severity: "error" as const,
          code: "parameters_json_parse_error",
          message: `Parameters JSON parse error: ${parsedParameters.error}`,
        },
        ...issues,
      ];
    }

    return issues;
  }, [
    effectiveDraft,
    parsedParameters.error,
    snapshot.assetNames,
    snapshot.lenses,
    snapshot.pricingIndex,
  ]);

  const draftCounts = issueCounts(draftIssues);
  const globalCounts = issueCounts(snapshot.globalIssues);
  const draftAsset = getCatalogAssetSummary(
    effectiveDraft.imageRef || effectiveDraft.coreId,
    snapshot.assetNames,
  );
  const draftParameterPreview = buildParameterPreview(
    effectiveDraft.parameters,
  );

  function updateDraft<K extends keyof CatalogDraft>(
    key: K,
    value: CatalogDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function startEdit(lens: CatalogLensSummary) {
    const nextDraft = draftFromLens(lens);
    setMode("edit");
    setDraft(nextDraft);
    setParameterJson(JSON.stringify(nextDraft.parameters, null, 2));
  }

  function startClone(lens: CatalogLensSummary) {
    const nextDraft = cloneDraft(lens);
    setMode("clone");
    setDraft(nextDraft);
    setParameterJson(JSON.stringify(nextDraft.parameters, null, 2));
  }

  function startAdd() {
    const nextDraft = emptyDraft();
    setMode("add");
    setDraft(nextDraft);
    setParameterJson("{}");
  }

  return (
    <main className="catalogConsole">
      <section className="topbar">
        <div>
          <p className="eyebrow">Internal Operations</p>
          <h1>Lens Catalog Console</h1>
          <p className="intro">
            Controlled catalog drafting and validation for LensCore, SKU
            mappings, pricing linkage, and product image references.
          </p>
        </div>

        <div className="statusStrip">
          <div>
            <span>Lenses</span>
            <strong>{snapshot.lenses.length}</strong>
          </div>
          <div>
            <span>Global errors</span>
            <strong>{globalCounts.errors}</strong>
          </div>
          <div>
            <span>Warnings</span>
            <strong>{globalCounts.warnings}</strong>
          </div>
        </div>
      </section>

      <section className="layout">
        <aside className="lensList">
          <div className="toolbar">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search coreId or name"
            />
            <select
              value={manufacturerFilter}
              onChange={(event) => setManufacturerFilter(event.target.value)}
            >
              <option value="all">All manufacturers</option>
              {snapshot.manufacturers.map((manufacturer) => (
                <option key={manufacturer} value={manufacturer}>
                  {manufacturer}
                </option>
              ))}
            </select>
            <select
              value={visibilityFilter}
              onChange={(event) =>
                setVisibilityFilter(event.target.value as VisibilityFilter)
              }
            >
              <option value="all">All visibility</option>
              <option value="visible">Browse visible</option>
              <option value="hidden">Browse hidden</option>
              <option value="missing-image">Missing image</option>
              <option value="issues">Has issues</option>
            </select>
          </div>

          <div className="actions">
            <button onClick={startAdd}>Add Lens</button>
            {selectedLens && (
              <>
                <button onClick={() => startEdit(selectedLens)}>
                  Edit Selected
                </button>
                <button onClick={() => startClone(selectedLens)}>
                  Clone Selected
                </button>
              </>
            )}
          </div>

          <div className="resultsCount">
            {filteredLenses.length} of {snapshot.lenses.length} lenses
          </div>

          <div className="lensRows">
            {filteredLenses.map((lens) => {
              const counts = issueCounts(lens.issues);

              return (
                <button
                  key={lens.coreId}
                  className={
                    lens.coreId === selectedCoreId ? "lensRow active" : "lensRow"
                  }
                  onClick={() => {
                    setSelectedCoreId(lens.coreId);
                    if (mode === "view") {
                      setDraft(draftFromLens(lens));
                      setParameterJson(
                        JSON.stringify(lens.parameters, null, 2),
                      );
                    }
                  }}
                >
                  <CatalogImage
                    imageRef={lens.asset.imageRef}
                    assetNames={snapshot.assetNames}
                    compact
                  />
                  <span>
                    <strong>{lens.displayName}</strong>
                    <small>{lens.coreId}</small>
                    <small>
                      {lens.manufacturer} / {lens.replacement}
                    </small>
                  </span>
                  <span className="rowMeta">
                    <em className={lens.browseVisible ? "good" : "muted"}>
                      {lens.browseVisible ? "Visible" : "Hidden"}
                    </em>
                    {(counts.errors > 0 || counts.warnings > 0) && (
                      <em className={counts.errors > 0 ? "bad" : "warn"}>
                        {counts.errors}E / {counts.warnings}W
                      </em>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <section className="detailPane">
          {selectedLens && (
            <div className="readPane">
              <div className="paneHeader">
                <div>
                  <p className="eyebrow">Selected Lens</p>
                  <h2>{selectedLens.displayName}</h2>
                  <p>
                    {selectedLens.coreId} / {selectedLens.manufacturer} /{" "}
                    {selectedLens.replacement}
                  </p>
                </div>
                <CatalogImage
                  imageRef={selectedLens.asset.imageRef}
                  assetNames={snapshot.assetNames}
                />
              </div>

              <div className="summaryGrid">
                <div>
                  <span>Browse status</span>
                  <strong>
                    {selectedLens.browseVisible ? "Visible" : "Hidden"}
                  </strong>
                </div>
                <div>
                  <span>Image</span>
                  <strong>
                    {selectedLens.asset.exists
                      ? selectedLens.asset.preferredPath
                      : "Missing"}
                  </strong>
                </div>
                <div>
                  <span>Modality</span>
                  <strong>
                    {selectedLens.type.toric ? "Toric" : "Sphere"}
                    {selectedLens.type.multifocal ? " + Multifocal" : ""}
                  </strong>
                </div>
                <div>
                  <span>SKUs</span>
                  <strong>{selectedLens.skus.length}</strong>
                </div>
              </div>

              <h3>Pack / Pricing Linkage</h3>
              <div className="skuTable">
                {selectedLens.skus.map((sku) => (
                  <div key={sku.sku}>
                    <strong>{sku.sku}</strong>
                    <span>{sku.packSize ?? "?"}-pack</span>
                    <span>{sku.durationMonths ?? "?"} mo / box</span>
                    <span>{formatCents(sku.pricePerBoxCents)}</span>
                    <span>{sku.pricingManufacturer ?? "Missing"}</span>
                  </div>
                ))}
              </div>

              <h3>Generated Parameter Preview</h3>
              <ParameterPreview lens={selectedLens} />

              <h3>Selected Lens Validation</h3>
              <IssueList issues={selectedLens.issues} />
            </div>
          )}

          <div className="editorPane">
            <div className="paneHeader">
              <div>
                <p className="eyebrow">Draft Workflow</p>
                <h2>
                  {mode === "add" && "Add Lens"}
                  {mode === "edit" && "Edit Lens"}
                  {mode === "clone" && "Clone Lens"}
                  {mode === "view" && "Draft Preview"}
                </h2>
                <p>
                  Drafts validate against current LensCore, CORE_TO_SKUS,
                  pricing tables, duration logic, and image assets.
                </p>
              </div>
              <div
                className={
                  draftCounts.errors > 0 ? "draftStatus blocked" : "draftStatus"
                }
              >
                {draftCounts.errors > 0
                  ? `${draftCounts.errors} blocking`
                  : "Source-ready"}
              </div>
            </div>

            <div className="formGrid">
              <label>
                coreId
                <input
                  value={draft.coreId}
                  onChange={(event) =>
                    updateDraft("coreId", event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                Display name
                <input
                  value={draft.displayName}
                  onChange={(event) =>
                    updateDraft("displayName", event.target.value)
                  }
                />
              </label>
              <label>
                Manufacturer
                <select
                  value={draft.manufacturer}
                  onChange={(event) =>
                    updateDraft(
                      "manufacturer",
                      event.target.value as CatalogDraft["manufacturer"],
                    )
                  }
                >
                  <option value="">Select manufacturer</option>
                  {snapshot.manufacturers.map((manufacturer) => (
                    <option key={manufacturer} value={manufacturer}>
                      {manufacturer}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Replacement
                <select
                  value={draft.replacement}
                  onChange={(event) =>
                    updateDraft(
                      "replacement",
                      event.target.value as CatalogDraft["replacement"],
                    )
                  }
                >
                  <option value="">Select schedule</option>
                  {snapshot.replacements.map((replacement) => (
                    <option key={replacement} value={replacement}>
                      {replacement}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SKU mappings
                <input
                  value={draft.skus.join(", ")}
                  onChange={(event) =>
                    updateDraft("skus", splitSkuList(event.target.value))
                  }
                  placeholder="CORE_30, CORE_90"
                />
              </label>
              <label>
                Image reference
                <input
                  value={draft.imageRef}
                  onChange={(event) =>
                    updateDraft("imageRef", event.target.value.toUpperCase())
                  }
                  placeholder="Usually matches coreId"
                />
              </label>
            </div>

            <div className="checks">
              <label>
                <input
                  type="checkbox"
                  checked={draft.toric}
                  onChange={(event) => updateDraft("toric", event.target.checked)}
                />
                Toric
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.multifocal}
                  onChange={(event) =>
                    updateDraft("multifocal", event.target.checked)
                  }
                />
                Multifocal
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.browseVisible}
                  onChange={(event) =>
                    updateDraft("browseVisible", event.target.checked)
                  }
                />
                Browse visible
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={draft.acknowledgeMissingImage}
                  onChange={(event) =>
                    updateDraft("acknowledgeMissingImage", event.target.checked)
                  }
                />
                Acknowledge missing image
              </label>
            </div>

            <label className="jsonEditor">
              Parameters JSON
              <textarea
                value={parameterJson}
                onChange={(event) => setParameterJson(event.target.value)}
                spellCheck={false}
              />
            </label>

            <div className="previewColumns">
              <div>
                <h3>Image Preview</h3>
                <CatalogImage
                  imageRef={draftAsset.imageRef || effectiveDraft.coreId}
                  assetNames={snapshot.assetNames}
                />
                <p className="quiet">
                  {draftAsset.exists
                    ? `Using ${draftAsset.preferredPath}`
                    : "No matching image asset found."}
                </p>
              </div>
              <div>
                <h3>Draft Parameter Preview</h3>
                <div className="previewGrid">
                  <div>
                    <span>BC</span>
                    <strong>
                      {draftParameterPreview.baseCurves.join(", ") || "None"}
                    </strong>
                  </div>
                  <div>
                    <span>DIA</span>
                    <strong>
                      {draftParameterPreview.diameters.join(", ") || "None"}
                    </strong>
                  </div>
                  <div>
                    <span>Sphere</span>
                    <strong>
                      {draftParameterPreview.sphereSummary
                        .slice(0, 2)
                        .join("; ") || "None"}
                    </strong>
                  </div>
                  <div>
                    <span>Cyl</span>
                    <strong>
                      {draftParameterPreview.cylinderValues.join(", ") ||
                        "None"}
                    </strong>
                  </div>
                  <div>
                    <span>Axis</span>
                    <strong>
                      {draftParameterPreview.axisValues.length || "None"}
                    </strong>
                  </div>
                  <div>
                    <span>Add</span>
                    <strong>
                      {draftParameterPreview.addValues.join(", ") || "None"}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <h3>Draft Validation</h3>
            <IssueList issues={draftIssues} />

            <div className="sourceExport">
              <h3>Source Export</h3>
              <p className="quiet">
                This console does not mutate production data. Apply these
                snippets to the canonical source files through code review.
              </p>
              <div>
                <span>LensCore entry</span>
                <pre>{buildLensSnippet(effectiveDraft)}</pre>
              </div>
              <div>
                <span>CORE_TO_SKUS entry</span>
                <pre>{buildSkuMappingSnippet(effectiveDraft)}</pre>
              </div>
            </div>
          </div>

          <div className="globalPane">
            <h2>Global Catalog Findings</h2>
            <IssueList issues={snapshot.globalIssues} />
          </div>
        </section>
      </section>

      <style jsx>{`
        .catalogConsole {
          min-height: 100vh;
          background: #0b0f14;
          color: #f4f7f8;
          padding: 28px;
        }

        .topbar {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          margin: 0 auto 24px;
          max-width: 1480px;
        }

        h1,
        h2,
        h3,
        p {
          margin: 0;
        }

        h1 {
          font-size: 2rem;
        }

        h2 {
          font-size: 1.1rem;
        }

        h3 {
          font-size: 0.92rem;
          margin-top: 20px;
          margin-bottom: 10px;
        }

        .eyebrow {
          color: #8fb7c7;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .intro,
        .quiet,
        .paneHeader p {
          color: rgba(244, 247, 248, 0.72);
          font-size: 0.9rem;
          line-height: 1.5;
          margin-top: 6px;
        }

        .statusStrip,
        .summaryGrid,
        .previewGrid {
          display: grid;
          gap: 10px;
        }

        .statusStrip {
          grid-template-columns: repeat(3, minmax(100px, 1fr));
          min-width: 360px;
        }

        .statusStrip div,
        .summaryGrid div,
        .previewGrid div {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.035);
          padding: 12px;
        }

        .statusStrip span,
        .summaryGrid span,
        .previewGrid span,
        .sourceExport span {
          color: rgba(244, 247, 248, 0.62);
          display: block;
          font-size: 0.76rem;
          margin-bottom: 4px;
        }

        .statusStrip strong,
        .summaryGrid strong,
        .previewGrid strong {
          font-size: 0.9rem;
          line-height: 1.35;
        }

        .layout {
          display: grid;
          grid-template-columns: minmax(300px, 360px) minmax(0, 1fr);
          gap: 18px;
          margin: 0 auto;
          max-width: 1480px;
        }

        .lensList,
        .readPane,
        .editorPane,
        .globalPane {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
        }

        .lensList {
          align-self: start;
          max-height: calc(100vh - 120px);
          overflow: hidden;
          padding: 14px;
          position: sticky;
          top: 16px;
        }

        .toolbar,
        .actions {
          display: grid;
          gap: 8px;
        }

        .actions {
          grid-template-columns: repeat(3, 1fr);
          margin-top: 10px;
        }

        input,
        select,
        textarea,
        button {
          font: inherit;
        }

        input,
        select,
        textarea {
          width: 100%;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.28);
          color: #f4f7f8;
          padding: 10px;
        }

        button {
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.07);
          color: #f4f7f8;
          cursor: pointer;
          padding: 9px 10px;
        }

        button:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        .resultsCount {
          color: rgba(244, 247, 248, 0.68);
          font-size: 0.8rem;
          margin: 12px 0;
        }

        .lensRows {
          display: grid;
          gap: 8px;
          max-height: calc(100vh - 310px);
          overflow: auto;
          padding-right: 4px;
        }

        .lensRow {
          align-items: center;
          display: grid;
          gap: 10px;
          grid-template-columns: 64px 1fr auto;
          text-align: left;
        }

        .lensRow.active {
          border-color: rgba(143, 183, 199, 0.65);
          background: rgba(143, 183, 199, 0.13);
        }

        .lensRow strong,
        .lensRow small {
          display: block;
        }

        .lensRow small {
          color: rgba(244, 247, 248, 0.62);
          font-size: 0.72rem;
          margin-top: 2px;
        }

        .rowMeta {
          display: grid;
          gap: 4px;
          justify-items: end;
        }

        .rowMeta em {
          border-radius: 999px;
          font-size: 0.68rem;
          font-style: normal;
          padding: 3px 7px;
        }

        .good {
          background: rgba(88, 176, 118, 0.16);
          color: #8de3a8;
        }

        .warn {
          background: rgba(234, 181, 76, 0.16);
          color: #ffd37a;
        }

        .bad {
          background: rgba(233, 92, 92, 0.16);
          color: #ff9b9b;
        }

        .muted {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(244, 247, 248, 0.72);
        }

        .detailPane {
          display: grid;
          gap: 18px;
        }

        .readPane,
        .editorPane,
        .globalPane {
          padding: 18px;
        }

        .paneHeader {
          align-items: start;
          display: flex;
          justify-content: space-between;
          gap: 18px;
        }

        .summaryGrid,
        .previewGrid {
          grid-template-columns: repeat(4, minmax(0, 1fr));
          margin-top: 16px;
        }

        .previewGrid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }

        .skuTable {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          overflow: hidden;
        }

        .skuTable div {
          display: grid;
          gap: 10px;
          grid-template-columns: 1.4fr 0.7fr 0.7fr 0.7fr 1fr;
          padding: 10px 12px;
        }

        .skuTable div + div {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .skuTable span {
          color: rgba(244, 247, 248, 0.72);
        }

        .formGrid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          margin-top: 16px;
        }

        label {
          color: rgba(244, 247, 248, 0.74);
          display: grid;
          font-size: 0.78rem;
          gap: 6px;
        }

        .checks {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          margin: 16px 0;
        }

        .checks label {
          align-items: center;
          display: flex;
          gap: 8px;
        }

        .checks input {
          width: auto;
        }

        .jsonEditor textarea {
          font-family: Consolas, Monaco, monospace;
          min-height: 220px;
          resize: vertical;
        }

        .previewColumns {
          display: grid;
          gap: 16px;
          grid-template-columns: 280px 1fr;
          margin-top: 18px;
        }

        .imageFrame {
          align-items: center;
          background: linear-gradient(
            180deg,
            rgba(255, 255, 255, 0.055),
            rgba(255, 255, 255, 0.018)
          );
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          display: flex;
          height: 160px;
          justify-content: center;
          overflow: hidden;
          padding: 14px;
          width: 240px;
        }

        .imageFrame.compact {
          height: 52px;
          padding: 6px;
          width: 64px;
        }

        .imageFrame img {
          height: 100%;
          max-height: 100%;
          max-width: 100%;
          object-fit: contain;
          width: 100%;
        }

        .issueList {
          display: grid;
          gap: 8px;
        }

        .issue {
          border-radius: 8px;
          display: grid;
          gap: 4px;
          padding: 10px 12px;
        }

        .issue strong {
          font-size: 0.68rem;
        }

        .issue span,
        .issue small {
          font-size: 0.86rem;
          line-height: 1.4;
        }

        .issue small {
          color: rgba(244, 247, 248, 0.66);
        }

        .issue.error {
          background: rgba(233, 92, 92, 0.14);
          border: 1px solid rgba(233, 92, 92, 0.22);
        }

        .issue.warning {
          background: rgba(234, 181, 76, 0.14);
          border: 1px solid rgba(234, 181, 76, 0.22);
        }

        .issue.info {
          background: rgba(143, 183, 199, 0.12);
          border: 1px solid rgba(143, 183, 199, 0.22);
        }

        .draftStatus {
          border-radius: 999px;
          background: rgba(88, 176, 118, 0.16);
          color: #8de3a8;
          font-size: 0.78rem;
          padding: 7px 10px;
          white-space: nowrap;
        }

        .draftStatus.blocked {
          background: rgba(233, 92, 92, 0.16);
          color: #ff9b9b;
        }

        .sourceExport {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
          margin-top: 18px;
          padding-top: 18px;
        }

        pre {
          background: rgba(0, 0, 0, 0.34);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 8px;
          color: #d7edf5;
          font-size: 0.78rem;
          line-height: 1.45;
          overflow: auto;
          padding: 12px;
        }

        @media (max-width: 1100px) {
          .topbar,
          .layout,
          .previewColumns {
            grid-template-columns: 1fr;
          }

          .topbar {
            display: grid;
          }

          .lensList {
            max-height: none;
            position: static;
          }

          .summaryGrid,
          .previewGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
  );
}
