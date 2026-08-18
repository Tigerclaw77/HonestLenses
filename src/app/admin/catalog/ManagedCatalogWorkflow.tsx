/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LensCore, MultifocalGroup, SphereAxisRule, ToricGroup } from "@/LensCore/types";
import {
  addMultifocalGroup, addToricGroup, catalogProductType, copyManagedCatalogInput,
  emptyManagedCatalogFamily, emptyManagedCatalogSku, formatCentsAsPrice,
  formatNumberList, formatPowerSegments, getSupplyDurationLabel,
  guidedInputEditorKey, hasAdvancedOnlySphereRules, hasAdvancedToricRules,
  lensTypeFromCatalogProductType, parametersFromAdvancedJson, parseCommaSeparatedText,
  parseNumberList, parsePriceToCents, shouldShowCatalogValidationIssue,
  suggestedCatalogCoreId, type CatalogProductType,
} from "@/lib/managedCatalog/adminForm";
import type { ManagedCatalogFamily, ManagedCatalogFamilyInput, ManagedCatalogSku } from "@/lib/managedCatalog/types";
import { validateManagedCatalogFamily } from "@/lib/managedCatalog/validation";

const manufacturers = ["VISTAKON", "ALCON", "BAUSCH + LOMB", "COOPERVISION"] as const;
const replacements = [["DD", "Daily"], ["1W", "Weekly"], ["2W", "Every two weeks"], ["1M", "Monthly"]] as const;
const productTypes: readonly [CatalogProductType, string, string][] = [
  ["spherical", "Spherical", "Sphere power only"],
  ["toric", "Toric", "Sphere, cylinder, and axis"],
  ["multifocal", "Multifocal", "Sphere and ADD"],
  ["toric-multifocal", "Toric multifocal", "Sphere, cylinder, axis, and ADD"],
];

function asInput(family: ManagedCatalogFamily): ManagedCatalogFamilyInput {
  return copyManagedCatalogInput({
    coreId: family.coreId, displayName: family.displayName, manufacturer: family.manufacturer,
    replacement: family.replacement, type: family.type, active: family.active,
    browseVisible: family.browseVisible, vendorOrderIdentifier: family.vendorOrderIdentifier,
    skus: family.skus, images: family.images, parameters: family.parameters,
  });
}

function firstIssue(field: string, issues: readonly { field: string; message: string }[]) {
  return issues.find((issue) => issue.field === field || issue.field.startsWith(field + "."))?.message ?? null;
}

function NumberListField({ label, value, onChange, help, error, placeholder }: {
  label: string; value: readonly number[] | undefined; onChange: (values: number[]) => void;
  help?: string; error?: string | null; placeholder: string;
}) {
  const [text, setText] = useState(() => formatNumberList(value));
  return <label className={error ? "fieldError" : ""}>{label}
    <input value={text} onChange={(event) => {
      setText(event.target.value);
      if (!event.target.value.trim()) { onChange([]); return; }
      const parsed = parseNumberList(event.target.value);
      if (!parsed.error) onChange(parsed.values);
    }} placeholder={placeholder} />
    {help && <small>{help}</small>}{error && <small className="errorText">{error}</small>}
  </label>;
}

function CommaSeparatedTextField({ label, value, onChange, placeholder, help }: {
  label: string; value: readonly string[]; onChange: (value: string[]) => void; placeholder: string; help?: string;
}) {
  const [text, setText] = useState(() => value.join(", "));
  return <label>{label}<input value={text} onChange={(event) => {
    setText(event.target.value);
    onChange(parseCommaSeparatedText(event.target.value));
  }} placeholder={placeholder} />{help && <small>{help}</small>}</label>;
}

function SphereEditor({ parameters, onChange, error, editorSession }: {
  parameters: LensCore["parameters"]; onChange: (parameters: LensCore["parameters"]) => void; error?: string | null; editorSession: number;
}) {
  if (hasAdvancedOnlySphereRules(parameters)) {
    return <div className="advancedNotice"><strong>Base-curve-specific sphere rules are in use.</strong><span>They are retained exactly. Edit them only in Advanced prescription rules.</span></div>;
  }
  const sphere = parameters.sphere;
  const segments = sphere?.segments ?? [];
  const changeSegment = (index: number, update: Partial<(typeof segments)[number]>) => {
    const next = [...segments]; next[index] = { ...segments[index]!, ...update };
    onChange({ ...parameters, sphere: { ...(sphere ?? {}), segments: next } });
  };
  return <div className="ruleBlock"><div className="sectionLead"><div><h3>Sphere availability</h3><p>Add every manufacturer range. Each range can use its own increment.</p></div><button type="button" onClick={() => onChange({ ...parameters, sphere: { ...(sphere ?? {}), segments: [...segments, { min: -6, max: 6, step: 0.25 }] } })}>Add sphere range</button></div>
    {segments.map((segment, index) => <div className="powerRange" key={index}><label>Minimum<input type="number" step="0.25" value={segment.min} onChange={(event) => changeSegment(index, { min: Number(event.target.value) })} /></label><label>Maximum<input type="number" step="0.25" value={segment.max} onChange={(event) => changeSegment(index, { max: Number(event.target.value) })} /></label><label>Increment<select value={segment.step} onChange={(event) => changeSegment(index, { step: Number(event.target.value) as 0.25 | 0.5 | 1 })}><option value={0.25}>0.25 D</option><option value={0.5}>0.50 D</option><option value={1}>1.00 D</option></select></label><button type="button" className="quietButton" disabled={segments.length === 1} onClick={() => onChange({ ...parameters, sphere: { ...(sphere ?? {}), segments: segments.filter((_, itemIndex) => itemIndex !== index) } })}>Remove</button></div>)}
    <NumberListField key={guidedInputEditorKey(editorSession, "sphere-exclude")} label="Excluded sphere powers (optional)" value={sphere?.exclude} onChange={(exclude) => onChange({ ...parameters, sphere: { ...(sphere ?? {}), segments, ...(exclude.length ? { exclude } : {}) } })} placeholder="Example: -6.25, +4.25" help="Comma-separated powers that are not manufacturable within these ranges." error={error} />
  </div>;
}

function ToricEditor({ parameters, onChange, error, editorSession }: {
  parameters: LensCore["parameters"]; onChange: (parameters: LensCore["parameters"]) => void; error?: string | null; editorSession: number;
}) {
  const groups = parameters.toric?.groups ?? [];
  const changeGroup = (index: number, update: (group: ToricGroup) => ToricGroup) => onChange({ ...parameters, toric: { groups: groups.map((group, itemIndex) => itemIndex === index ? update(group) : group) } });
  const changeRule = (groupIndex: number, ruleIndex: number, update: (rule: SphereAxisRule) => SphereAxisRule) => changeGroup(groupIndex, (group) => hasAdvancedToricRules(group) ? { ...group, sphereAxisRules: group.sphereAxisRules.map((rule, index) => index === ruleIndex ? update(rule) : rule) } : group);
  const withoutOverride = (rule: SphereAxisRule) => { const copy = { ...rule }; delete copy.sphereStepOverride; return copy; };
  return <div className="ruleBlock"><div className="sectionLead"><div><h3>Toric availability</h3><p>Use another cylinder group when manufacturer availability differs.</p></div><button type="button" onClick={() => onChange(addToricGroup(parameters))}>Add cylinder group</button></div>
    {groups.map((group, index) => <div className="toricGroup" key={index}><div className="sectionLead"><strong>Cylinder group {index + 1}</strong><button type="button" className="quietButton" disabled={groups.length === 1} onClick={() => onChange({ ...parameters, toric: { groups: groups.filter((_, itemIndex) => itemIndex !== index) } })}>Remove group</button></div>
      <NumberListField key={guidedInputEditorKey(editorSession, "cylinders-" + index)} label="Cylinder values" value={group.cylinders} onChange={(cylinders) => changeGroup(index, (current) => ({ ...current, cylinders } as ToricGroup))} placeholder="Example: -0.75, -1.25, -1.75" help="Comma-separated cylinder powers." />
      {hasAdvancedToricRules(group) ? <div className="ruleList"><p>Axis availability is restricted by sphere power for this group.</p>{group.sphereAxisRules.map((rule, ruleIndex) => <div className="sphereAxisRule" key={ruleIndex}><label>Sphere minimum<input type="number" step="0.25" value={rule.sphereRange.min} onChange={(event) => changeRule(index, ruleIndex, (current) => ({ ...current, sphereRange: { ...current.sphereRange, min: Number(event.target.value) } }))} /></label><label>Sphere maximum<input type="number" step="0.25" value={rule.sphereRange.max} onChange={(event) => changeRule(index, ruleIndex, (current) => ({ ...current, sphereRange: { ...current.sphereRange, max: Number(event.target.value) } }))} /></label><NumberListField key={guidedInputEditorKey(editorSession, "rule-axis-" + index + "-" + ruleIndex)} label="Available axes" value={rule.axis} onChange={(axis) => changeRule(index, ruleIndex, (current) => ({ ...current, axis }))} placeholder="Example: 10, 20, 30, 180" /><label>Sphere increment<select value={rule.sphereStepOverride ?? ""} onChange={(event) => changeRule(index, ruleIndex, (current) => event.target.value ? { ...current, sphereStepOverride: Number(event.target.value) as 0.25 | 0.5 | 1 } : withoutOverride(current))}><option value="">Use sphere increment</option><option value={0.25}>0.25 D</option><option value={0.5}>0.50 D</option><option value={1}>1.00 D</option></select></label><button type="button" className="quietButton" onClick={() => changeGroup(index, (current) => hasAdvancedToricRules(current) ? { ...current, sphereAxisRules: current.sphereAxisRules.filter((_, itemIndex) => itemIndex !== ruleIndex) } : current)}>Remove restriction</button></div>)}<button type="button" onClick={() => changeGroup(index, (current) => hasAdvancedToricRules(current) ? { ...current, sphereAxisRules: [...current.sphereAxisRules, { sphereRange: { min: -6, max: 6 }, axis: [] }] } : current)}>Add sphere/axis restriction</button></div> : <div className="axisCommon"><NumberListField key={guidedInputEditorKey(editorSession, "axis-" + index)} label="Axis values" value={group.axis} onChange={(axis) => changeGroup(index, (current) => ({ cylinders: current.cylinders, axis }))} placeholder="Example: 10, 20, 30, 180" help="Comma-separated axis values." /><button type="button" className="quietButton" onClick={() => changeGroup(index, (current) => ({ cylinders: current.cylinders, sphereAxisRules: [{ sphereRange: { min: -6, max: 6 }, axis: "axis" in current ? current.axis ?? [] : [] }] }))}>Add sphere/axis restrictions</button></div>}
    </div>)}
    {error && <small className="errorText">{error}</small>}
  </div>;
}

function MultifocalEditor({ parameters, onChange, error, editorSession }: {
  parameters: LensCore["parameters"]; onChange: (parameters: LensCore["parameters"]) => void; error?: string | null; editorSession: number;
}) {
  const multifocal = parameters.multifocal ?? { adds: [] };
  const groups = multifocal.groups ?? [];
  const changeGroup = (index: number, update: (group: MultifocalGroup) => MultifocalGroup) => onChange({ ...parameters, multifocal: { ...multifocal, groups: groups.map((group, itemIndex) => itemIndex === index ? update(group) : group) } });
  const withoutOverride = (group: MultifocalGroup) => { const copy = { ...group }; delete copy.sphereStepOverride; return copy; };
  return <div className="ruleBlock"><div className="sectionLead"><div><h3>Multifocal availability</h3><p>ADD labels can be manufacturer names such as LOW, MED, and HIGH.</p></div><button type="button" onClick={() => onChange(addMultifocalGroup(parameters))}>Add ADD-specific restriction</button></div>
    <CommaSeparatedTextField key={guidedInputEditorKey(editorSession, "multifocal-adds")} label="Available ADD values or categories" value={multifocal.adds} onChange={(adds) => onChange({ ...parameters, multifocal: { ...multifocal, adds } })} placeholder="Example: LOW, MID, HIGH" help="Comma-separated labels shown to customers exactly as entered." />
    {groups.map((group, index) => <div className="multifocalGroup" key={index}><div className="sectionLead"><strong>ADD-specific rule {index + 1}</strong><button type="button" className="quietButton" onClick={() => onChange({ ...parameters, multifocal: { ...multifocal, groups: groups.filter((_, itemIndex) => itemIndex !== index) } })}>Remove rule</button></div><CommaSeparatedTextField key={guidedInputEditorKey(editorSession, "multifocal-group-adds-" + index)} label="ADD values for this rule" value={group.adds} onChange={(adds) => changeGroup(index, (current) => ({ ...current, adds }))} placeholder="Example: LOW, MID, HIGH" /><div className="powerRange"><label>Sphere minimum<input type="number" step="0.25" value={group.sphereRange.min} onChange={(event) => changeGroup(index, (current) => ({ ...current, sphereRange: { ...current.sphereRange, min: Number(event.target.value) } }))} /></label><label>Sphere maximum<input type="number" step="0.25" value={group.sphereRange.max} onChange={(event) => changeGroup(index, (current) => ({ ...current, sphereRange: { ...current.sphereRange, max: Number(event.target.value) } }))} /></label><label>Sphere increment<select value={group.sphereStepOverride ?? ""} onChange={(event) => changeGroup(index, (current) => event.target.value ? { ...current, sphereStepOverride: Number(event.target.value) as 0.25 | 0.5 | 1 } : withoutOverride(current))}><option value="">Use sphere increment</option><option value={0.25}>0.25 D</option><option value={0.5}>0.50 D</option><option value={1}>1.00 D</option></select></label></div></div>)}
    {error && <small className="errorText">{error}</small>}
  </div>;
}

export default function ManagedCatalogWorkflow({ initialFamilies, storageAvailable, startInCreateMode = false }: { initialFamilies: ManagedCatalogFamily[]; storageAvailable: boolean; startInCreateMode?: boolean }) {
  const initialDraft = startInCreateMode || !initialFamilies[0] ? emptyManagedCatalogFamily() : asInput(initialFamilies[0]);
  const [families, setFamilies] = useState(initialFamilies);
  const [selectedId, setSelectedId] = useState<string | null>(startInCreateMode ? null : initialFamilies[0]?.coreId ?? null);
  const [draft, setDraft] = useState<ManagedCatalogFamilyInput>(initialDraft);
  const [coreIdOverride, setCoreIdOverride] = useState(Boolean(initialFamilies[0]) && !startInCreateMode);
  const [advancedText, setAdvancedText] = useState(() => JSON.stringify(initialDraft.parameters, null, 2));
  const [advancedError, setAdvancedError] = useState<string | null>(null);
  const [editorSession, setEditorSession] = useState(0);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [publishAttempted, setPublishAttempted] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const generatedCoreId = suggestedCatalogCoreId(draft.manufacturer, draft.displayName);
  const effectiveCoreId = coreIdOverride ? draft.coreId : generatedCoreId;
  const effective = useMemo(() => ({ ...draft, coreId: effectiveCoreId }), [draft, effectiveCoreId]);
  const issues = useMemo(() => [...validateManagedCatalogFamily(effective, { existingManagedCoreIds: families.filter((item) => item.coreId !== selectedId).map((item) => item.coreId) }), ...(advancedError ? [{ field: "parameters", message: advancedError }] : [])], [advancedError, effective, families, selectedId]);
  const visibleIssues = issues.filter((issue) => shouldShowCatalogValidationIssue(issue.field, touched, publishAttempted));
  const productType = catalogProductType(draft.type);
  const markTouched = (field: string) => setTouched((current) => new Set(current).add(field));
  const errorsFor = (field: string) => firstIssue(field, visibleIssues);
  useEffect(() => () => { if (imagePreviewUrl?.startsWith("blob:")) URL.revokeObjectURL(imagePreviewUrl); }, [imagePreviewUrl]);

  function updateParameters(update: (parameters: LensCore["parameters"]) => LensCore["parameters"]) {
    setDraft((current) => { const parameters = update(current.parameters); setAdvancedText(JSON.stringify(parameters, null, 2)); setAdvancedError(null); return { ...current, parameters }; });
    markTouched("parameters");
  }
  function add() {
    const next = emptyManagedCatalogFamily(); setSelectedId(null); setDraft(next); setCoreIdOverride(false); setAdvancedText(JSON.stringify(next.parameters, null, 2)); setAdvancedError(null); setEditorSession((current) => current + 1); setTouched(new Set()); setPublishAttempted(false); setStatus(null); setImagePreviewUrl(null);
  }
  function select(family: ManagedCatalogFamily) {
    const next = asInput(family); setSelectedId(family.coreId); setDraft(next); setCoreIdOverride(true); setAdvancedText(JSON.stringify(next.parameters, null, 2)); setAdvancedError(null); setEditorSession((current) => current + 1); setTouched(new Set()); setPublishAttempted(false); setStatus(null); setImagePreviewUrl(null);
  }
  function setProductType(nextType: CatalogProductType) {
    setDraft((current) => {
      const type = lensTypeFromCatalogProductType(nextType); const parameters = { ...current.parameters };
      if (type.toric && !parameters.toric) parameters.toric = { groups: [{ cylinders: [], axis: [] }] };
      if (!type.toric) delete parameters.toric;
      if (type.multifocal && !parameters.multifocal) parameters.multifocal = { adds: [] };
      if (!type.multifocal) delete parameters.multifocal;
      setAdvancedText(JSON.stringify(parameters, null, 2)); return { ...current, type, parameters };
    });
    markTouched("parameters");
  }
  function updateSku(index: number, key: keyof ManagedCatalogSku, value: string | number | boolean) {
    setDraft((current) => ({ ...current, skus: current.skus.map((sku, itemIndex) => itemIndex === index ? { ...sku, [key]: value } : sku) })); markTouched("skus");
  }
  function updateAdvanced(value: string) {
    setAdvancedText(value); markTouched("parameters"); const parsed = parametersFromAdvancedJson(value); setAdvancedError(parsed.error);
    if (parsed.parameters) setDraft((current) => ({ ...current, parameters: parsed.parameters! }));
  }
  async function upload(file: File | null) {
    if (!file) return; markTouched("images");
    if (!(file.type === "image/jpeg" || file.type === "image/png")) { setStatus("Use a JPEG or PNG image."); return; }
    if (file.size > 5 * 1024 * 1024) { setStatus("Image must be 5 MiB or smaller."); return; }
    const preview = URL.createObjectURL(file); setImagePreviewUrl(preview);
    const form = new FormData(); form.set("coreId", effectiveCoreId); form.set("file", file); setStatus("Uploading product artwork…");
    const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
    const body = await response.json() as { storagePath?: string; publicUrl?: string; error?: string };
    if (!response.ok || !body.storagePath) { setStatus(body.error ?? "Image upload failed."); return; }
    setDraft((current) => ({ ...current, images: [{ storagePath: body.storagePath!, altText: (current.displayName || effectiveCoreId) + " product image", isPrimary: true, position: 0 }] }));
    if (body.publicUrl) setImagePreviewUrl(body.publicUrl); setStatus("Artwork is ready. Publishing attaches it to this lens version.");
  }
  async function save() {
    setPublishAttempted(true);
    if (issues.length) { setStatus("Review the highlighted information before publishing."); requestAnimationFrame(() => { errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); errorSummaryRef.current?.focus(); }); return; }
    setSaving(true); setStatus(null);
    const response = await fetch(selectedId ? "/api/admin/catalog/families/" + encodeURIComponent(selectedId) : "/api/admin/catalog/families", { method: selectedId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(effective) });
    const body = await response.json() as { error?: string; issues?: { field: string; message: string }[] }; setSaving(false);
    if (!response.ok) { setStatus(body.issues?.map((item) => item.field + ": " + item.message).join(" ") ?? body.error ?? "Publish failed."); return; }
    const refreshed = await fetch("/api/admin/catalog/families"); const refreshedBody = await refreshed.json() as { families?: ManagedCatalogFamily[] };
    if (refreshed.ok && refreshedBody.families) { setFamilies(refreshedBody.families); const saved = refreshedBody.families.find((family) => family.coreId === effective.coreId); if (saved) select(saved); }
    setStatus("Published as a new immutable lens version.");
  }

  return <section id="managed-catalog" className="managedCatalog" tabIndex={-1}>
    <div className="managedHeading"><div><p>Lens catalog</p><h2>{selectedId ? "Edit lens" : "Add new lens"}</h2><span>New and edited lenses are versioned independently. The source-backed catalog above remains read-only.</span></div><button type="button" onClick={add}>Add new lens</button></div>
    {!storageAvailable ? <p className="managedError">Lens catalog storage is not available. Nothing can be published from this page.</p> : <div className="managedGrid">
      <aside aria-label="Published database-backed lenses">{families.length ? families.map((family) => <button type="button" className={selectedId === family.coreId ? "selected" : ""} key={family.coreId} onClick={() => select(family)}><strong>{family.displayName}</strong><span>Version {family.version}</span></button>) : <p>No new lenses have been published yet.</p>}</aside>
      <form className="managedForm" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <section><h3>1. Product</h3><div className="two"><label className={errorsFor("displayName") ? "fieldError" : ""}>Product or family name<input value={draft.displayName} onBlur={() => markTouched("displayName")} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} placeholder="Example: Acme Daily Toric" />{errorsFor("displayName") && <small className="errorText">{errorsFor("displayName")}</small>}</label><label>Manufacturer<select value={draft.manufacturer} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value as ManagedCatalogFamilyInput["manufacturer"] })}>{manufacturers.map((manufacturer) => <option key={manufacturer} value={manufacturer}>{manufacturer}</option>)}</select></label><label>Replacement schedule<select value={draft.replacement} onChange={(event) => setDraft({ ...draft, replacement: event.target.value as ManagedCatalogFamilyInput["replacement"] })}>{replacements.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><fieldset className="productType"><legend>Product type</legend>{productTypes.map(([value, title, description]) => <label key={value}><input type="radio" name="productType" checked={productType === value} onChange={() => setProductType(value)} /><span><strong>{title}</strong><small>{description}</small></span></label>)}</fieldset></div><div className="flags"><label><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Available for ordering</label><label><input type="checkbox" checked={draft.browseVisible} onChange={(event) => setDraft({ ...draft, browseVisible: event.target.checked })} />Show in store</label></div><details className="advanced"><summary>Internal identifier (advanced)</summary><p>Generated from the manufacturer and product name; fixed after publishing.</p><label className={errorsFor("coreId") ? "fieldError" : ""}>Internal product ID<input value={effectiveCoreId} readOnly={Boolean(selectedId)} onChange={(event) => { setCoreIdOverride(true); setDraft({ ...draft, coreId: event.target.value.toUpperCase() }); markTouched("coreId"); }} onFocus={() => { if (!selectedId && !coreIdOverride) { setCoreIdOverride(true); setDraft({ ...draft, coreId: generatedCoreId }); } }} />{errorsFor("coreId") && <small className="errorText">{errorsFor("coreId")}</small>}</label></details></section>
        <section><h3>2. Prescription parameters</h3><div className="two"><NumberListField key={guidedInputEditorKey(editorSession, "base-curve")} label="Base curve (BC)" value={draft.parameters.baseCurve} onChange={(baseCurve) => updateParameters((parameters) => ({ ...parameters, baseCurve }))} placeholder="Example: 8.4, 8.6" help="One or more discrete values, separated by commas." error={errorsFor("parameters.baseCurve")} /><NumberListField key={guidedInputEditorKey(editorSession, "diameter")} label="Diameter (DIA)" value={draft.parameters.diameter} onChange={(diameter) => updateParameters((parameters) => ({ ...parameters, diameter }))} placeholder="Example: 14.0, 14.2" help="One or more discrete values, separated by commas." error={errorsFor("parameters.diameter")} /></div><SphereEditor parameters={draft.parameters} onChange={(parameters) => updateParameters(() => parameters)} error={errorsFor("parameters.sphere")} editorSession={editorSession} />{draft.type.toric && <ToricEditor parameters={draft.parameters} onChange={(parameters) => updateParameters(() => parameters)} error={errorsFor("parameters.toric")} editorSession={editorSession} />}{draft.type.multifocal && <MultifocalEditor parameters={draft.parameters} onChange={(parameters) => updateParameters(() => parameters)} error={errorsFor("parameters.multifocal")} editorSession={editorSession} />}<details className="advanced"><summary>Advanced prescription rules</summary><p>For exceptional manufacturer rules such as BC-dependent sphere ranges, use the complete availability model. Existing advanced rules remain unchanged unless you edit them here.</p><textarea value={advancedText} onChange={(event) => updateAdvanced(event.target.value)} spellCheck={false} aria-label="Advanced prescription rules" />{errorsFor("parameters") && <small className="errorText">{errorsFor("parameters")}</small>}</details></section>
        <section><h3>3. Box sizes and pricing</h3><p className="sectionHelp">Each box size has its own customer price and vendor/distributor identifier. Supply duration uses the same model as cart and shipping.</p>{draft.skus.map((sku, index) => <div className="sku" key={index}><label>SKU<input value={sku.sku} onBlur={() => markTouched("skus")} onChange={(event) => updateSku(index, "sku", event.target.value)} placeholder="Your store SKU" /></label><label>Lenses per box<input type="number" min={1} step={1} value={sku.packSize} onChange={(event) => updateSku(index, "packSize", Number(event.target.value))} /><small>{getSupplyDurationLabel(draft.replacement, sku.packSize)}</small></label><label>Honest Lenses price per box<input inputMode="decimal" defaultValue={formatCentsAsPrice(sku.pricePerBoxCents)} key={String(index) + "-" + String(sku.pricePerBoxCents)} onBlur={(event) => { const parsed = parsePriceToCents(event.target.value); if (parsed.cents !== null) updateSku(index, "pricePerBoxCents", parsed.cents); }} placeholder="49.99" /><small>Enter dollars and cents.</small></label><label>Vendor/distributor SKU or pack order ID<input value={sku.vendorSku ?? ""} onBlur={() => markTouched("skus")} onChange={(event) => updateSku(index, "vendorSku", event.target.value)} placeholder="Pack-specific supplier code" /></label><label className="skuActive"><input type="checkbox" checked={sku.active !== false} onChange={(event) => updateSku(index, "active", event.target.checked)} />Available</label><button type="button" className="quietButton" disabled={draft.skus.length === 1} onClick={() => setDraft({ ...draft, skus: draft.skus.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>)}{errorsFor("skus") && <small className="errorText">{errorsFor("skus")}</small>}<button type="button" onClick={() => setDraft({ ...draft, skus: [...draft.skus, emptyManagedCatalogSku()] })}>Add box size</button></section>
        <section><h3>4. Vendor ordering</h3><label className={errorsFor("vendorOrderIdentifier") ? "fieldError" : ""}>Family vendor/distributor order ID<input value={draft.vendorOrderIdentifier ?? ""} onBlur={() => markTouched("vendorOrderIdentifier")} onChange={(event) => setDraft({ ...draft, vendorOrderIdentifier: event.target.value })} placeholder="Supplier’s family or product mapping" /><small>Required as the stable family-level supplier mapping. The box-size field above is the pack-specific supplier code.</small>{errorsFor("vendorOrderIdentifier") && <small className="errorText">{errorsFor("vendorOrderIdentifier")}</small>}</label></section>
        <section><h3>5. Product image</h3><div className="imageControls"><label className={errorsFor("images") ? "fieldError" : ""}>Primary product artwork<input type="file" accept="image/jpeg,image/png" onChange={(event) => void upload(event.target.files?.[0] ?? null)} /><small>JPEG or PNG only, up to 5 MiB. Artwork is stored under this lens’s secured catalog path.</small>{errorsFor("images") && <small className="errorText">{errorsFor("images")}</small>}</label>{imagePreviewUrl ? <img className="imagePreview" src={imagePreviewUrl} alt="Selected product artwork preview" /> : draft.images[0] ? <p className="imageOk">Artwork attached: {draft.images[0].storagePath}</p> : <p className="sectionHelp">Select artwork to preview it before publishing.</p>}</div></section>
        <section className="review"><h3>6. Review and publish</h3><div className="reviewGrid"><div><span>Product</span><strong>{draft.manufacturer} · {draft.displayName || "Name not entered"}</strong></div><div><span>Type and schedule</span><strong>{productTypes.find(([value]) => value === productType)?.[1]} · {replacements.find(([value]) => value === draft.replacement)?.[1]}</strong></div><div><span>BC / DIA</span><strong>{formatNumberList(draft.parameters.baseCurve) || "Not set"} / {formatNumberList(draft.parameters.diameter) || "Not set"}</strong></div><div><span>Sphere</span><strong>{formatPowerSegments(draft.parameters.sphere)}</strong></div>{draft.type.toric && <div><span>Cylinder / axis</span><strong>{draft.parameters.toric?.groups.map((group) => formatNumberList(group.cylinders) + ("axis" in group ? " · " + formatNumberList(group.axis) : " · restricted by sphere")).join("; ") || "Not set"}</strong></div>}{draft.type.multifocal && <div><span>ADD</span><strong>{draft.parameters.multifocal?.adds.join(", ") || "Not set"}</strong></div>}<div><span>Box sizes</span><strong>{draft.skus.map((sku) => String(sku.packSize) + " lenses · $" + formatCentsAsPrice(sku.pricePerBoxCents)).join("; ")}</strong></div><div><span>Store status</span><strong>{draft.active ? "Available for ordering" : "Inactive"} · {draft.browseVisible ? "Shown in store" : "Hidden from store"}</strong></div></div>{visibleIssues.length > 0 && <div className="issues" ref={errorSummaryRef} tabIndex={-1}><strong>Before publishing</strong><ul>{visibleIssues.map((issue, index) => <li key={issue.field + String(index)}>{issue.message}</li>)}</ul></div>}{status && <p className={issues.length ? "managedError" : "status"}>{status}</p>}<button className="publish" disabled={saving || !storageAvailable} type="submit">{saving ? "Publishing…" : selectedId ? "Publish updated lens version" : "Publish lens"}</button></section>
      </form>
    </div>}
    <style jsx>{'.managedCatalog{max-width:1480px;margin:0 auto 32px;padding:20px;border:1px solid #d7e1e8;border-radius:12px;background:#fff;color:#15212b}.managedHeading{display:flex;justify-content:space-between;gap:16px}.managedHeading p{margin:0;color:#476270;font-size:12px;font-weight:700;text-transform:uppercase}.managedHeading h2{margin:4px 0}.managedHeading span,.sectionHelp,.managedForm small{color:#526570;font-size:13px;line-height:1.4}.managedGrid{display:grid;grid-template-columns:240px 1fr;gap:18px;margin-top:18px}.managedGrid aside{display:grid;align-content:start;gap:8px}.managedGrid aside button{background:#f6f9fb;border:1px solid #d7e1e8;border-radius:8px;padding:10px;text-align:left}.managedGrid aside button.selected{border-color:#1677b9;background:#edf7fd}.managedGrid aside span{display:block;color:#526570;font-size:12px;margin-top:3px}.managedForm{display:grid;gap:18px}.managedForm section{border-top:1px solid #d7e1e8;padding-top:16px}.managedForm section:first-child{border-top:0;padding-top:0}.managedForm h3{margin:0 0 8px}.two{align-items:start;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.managedForm label{align-content:start;display:grid;gap:5px;font-size:13px;font-weight:600}.managedForm input,.managedForm select,.managedForm textarea{box-sizing:border-box;width:100%;border:1px solid #bdcad2;border-radius:6px;padding:9px;font:inherit}.managedForm select{height:39px;min-height:39px}.managedForm textarea{min-height:250px;font:12px Consolas,monospace}.productType{border:1px solid #d7e1e8;border-radius:8px;display:grid;gap:8px;padding:10px}.productType legend{font-size:13px;font-weight:600}.productType label{align-items:start;display:flex;gap:8px}.productType input,.flags input,.skuActive input{width:auto;margin-top:3px}.productType span{display:grid}.productType small{font-weight:400}.flags{display:flex;gap:14px;flex-wrap:wrap;margin-top:14px}.flags label{display:flex;align-items:center;gap:6px}.advanced{border:1px solid #d7e1e8;border-radius:8px;margin-top:14px;padding:10px}.advanced summary{cursor:pointer;font-weight:700}.advanced p{color:#526570;font-size:13px;line-height:1.4}.advanced label{margin-top:10px}.ruleBlock,.toricGroup,.multifocalGroup{border:1px solid #d7e1e8;border-radius:8px;margin-top:14px;padding:12px}.sectionLead{align-items:start;display:flex;gap:12px;justify-content:space-between}.sectionLead h3,.sectionLead p{margin:0}.sectionLead p{color:#526570;font-size:13px}.powerRange,.sphereAxisRule{align-items:end;display:grid;gap:8px;grid-template-columns:repeat(3,minmax(0,1fr)) auto;margin-top:10px}.toricGroup,.multifocalGroup{background:#f9fbfc}.axisCommon,.ruleList{display:grid;gap:10px}.quietButton{background:#fff;border:1px solid #aebec8;color:#314854}.managedForm button{border:1px solid #126da5;border-radius:6px;background:#fff;color:#126da5;font:inherit;font-weight:700;padding:9px 12px}.managedForm button:disabled{cursor:not-allowed;opacity:.5}.fieldError input,.fieldError select{border-color:#b42626}.errorText{color:#a82020!important}.advancedNotice{border-left:3px solid #b98017;display:grid;gap:4px;margin-top:14px;padding:10px;background:#fff8e7;font-size:13px}.sku{align-items:end;display:grid;gap:8px;grid-template-columns:1.1fr .7fr .9fr 1.15fr auto auto;margin:12px 0}.sku label{min-width:0}.skuActive{align-items:center;display:flex!important;gap:5px;margin-bottom:6px;white-space:nowrap}.imageControls{align-items:start;display:flex;gap:16px}.imageControls>label{max-width:450px}.imagePreview{border:1px solid #d7e1e8;border-radius:8px;max-height:160px;max-width:220px;object-fit:contain}.imageOk{color:#19623a}.review{background:#f7fafb;border:1px solid #d7e1e8;border-radius:8px;padding:16px!important}.reviewGrid{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}.reviewGrid div{background:#fff;border:1px solid #e0e8ec;border-radius:6px;padding:9px}.reviewGrid span{color:#526570;display:block;font-size:12px;margin-bottom:3px}.reviewGrid strong{font-size:13px}.issues,.managedError{color:#9e2525;background:#fff2f2;border:1px solid #edc2c2;padding:10px;border-radius:6px}.issues ul{margin:6px 0 0;padding-left:20px}.status{color:#19623a}.publish{background:#126da5!important;color:#fff!important;margin-top:10px}@media(max-width:1000px){.managedGrid,.sku{grid-template-columns:1fr}.managedHeading,.imageControls{display:grid}}@media(max-width:700px){.two,.powerRange,.sphereAxisRule,.reviewGrid{grid-template-columns:1fr}}'}</style>
  </section>;
}
