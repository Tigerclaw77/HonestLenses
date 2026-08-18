"use client";

import { useMemo, useState } from "react";
import type { LensCore } from "@/LensCore/types";
import type { ManagedCatalogFamily, ManagedCatalogFamilyInput, ManagedCatalogSku } from "@/lib/managedCatalog/types";
import { validateManagedCatalogFamily } from "@/lib/managedCatalog/validation";

const manufacturers = ["VISTAKON", "ALCON", "BAUSCH + LOMB", "COOPERVISION"] as const;
const replacements = ["DD", "1W", "2W", "1M"] as const;

function emptyFamily(): ManagedCatalogFamilyInput {
  return {
    coreId: "", displayName: "", manufacturer: "VISTAKON", replacement: "DD",
    type: { toric: false, multifocal: false }, active: true, browseVisible: false,
    vendorOrderIdentifier: "", skus: [{ sku: "", packSize: 30, pricePerBoxCents: 0, vendorSku: "", active: true }], images: [],
    parameters: { baseCurve: [8.6], diameter: [14.2], sphere: { segments: [{ min: -6, max: 6, step: 0.25 }] } },
  };
}

function inputFromFamily(family: ManagedCatalogFamily): ManagedCatalogFamilyInput {
  return {
    coreId: family.coreId, displayName: family.displayName, manufacturer: family.manufacturer,
    replacement: family.replacement, type: { ...family.type }, active: family.active,
    browseVisible: family.browseVisible, vendorOrderIdentifier: family.vendorOrderIdentifier,
    skus: family.skus.map((sku) => ({ ...sku })), images: family.images.map((image) => ({ ...image })),
    parameters: family.parameters,
  };
}

function parseParameters(value: string): { value: LensCore["parameters"] | null; error: string | null } {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { value: null, error: "Parameters must be a JSON object." };
    return { value: parsed as LensCore["parameters"], error: null };
  } catch (error) { return { value: null, error: error instanceof Error ? error.message : "Invalid JSON." }; }
}

export default function ManagedCatalogWorkflow({ initialFamilies, storageAvailable, startInCreateMode = false }: { initialFamilies: ManagedCatalogFamily[]; storageAvailable: boolean; startInCreateMode?: boolean }) {
  const [families, setFamilies] = useState(initialFamilies);
  const [selectedId, setSelectedId] = useState<string | null>(startInCreateMode ? null : initialFamilies[0]?.coreId ?? null);
  const [draft, setDraft] = useState<ManagedCatalogFamilyInput>(() => startInCreateMode || !initialFamilies[0] ? emptyFamily() : inputFromFamily(initialFamilies[0]));
  const [parametersText, setParametersText] = useState(() => JSON.stringify(startInCreateMode || !initialFamilies[0] ? emptyFamily().parameters : initialFamilies[0].parameters, null, 2));
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const parsed = useMemo(() => parseParameters(parametersText), [parametersText]);
  const effective = useMemo(() => ({ ...draft, parameters: parsed.value ?? {} }), [draft, parsed.value]);
  const issues = useMemo(() => parsed.error ? [{ field: "parameters", message: parsed.error }] : validateManagedCatalogFamily(effective, { existingManagedCoreIds: families.filter((item) => item.coreId !== selectedId).map((item) => item.coreId) }), [effective, families, parsed.error, selectedId]);

  function select(family: ManagedCatalogFamily) {
    setSelectedId(family.coreId); setDraft(inputFromFamily(family)); setParametersText(JSON.stringify(family.parameters, null, 2)); setStatus(null);
  }
  function add() { const next = emptyFamily(); setSelectedId(null); setDraft(next); setParametersText(JSON.stringify(next.parameters, null, 2)); setStatus(null); }
  function updateSku(index: number, key: keyof ManagedCatalogSku, value: string | number | boolean) { setDraft((current) => ({ ...current, skus: current.skus.map((sku, i) => i === index ? { ...sku, [key]: value } : sku) })); }
  async function upload(file: File | null) {
    if (!file) return;
    if (!/^[A-Z0-9_]+$/.test(draft.coreId)) { setStatus("Enter a stable uppercase core ID before uploading an image."); return; }
    const form = new FormData(); form.set("coreId", draft.coreId); form.set("file", file);
    setStatus("Uploading image…");
    const response = await fetch("/api/admin/catalog/images", { method: "POST", body: form });
    const body = await response.json() as { storagePath?: string; error?: string };
    const storagePath = body.storagePath;
    if (!response.ok || !storagePath) { setStatus(body.error ?? "Image upload failed."); return; }
    setDraft((current) => ({ ...current, images: [{ storagePath, altText: `${current.displayName || current.coreId} product image`, isPrimary: true, position: 0 }] }));
    setStatus("Image uploaded. Publish the family to attach it to an immutable version.");
  }
  async function save() {
    if (issues.length) { setStatus("Resolve the blocking validation items before publishing."); return; }
    setSaving(true); setStatus(null);
    const method = selectedId ? "PUT" : "POST";
    const path = selectedId ? `/api/admin/catalog/families/${encodeURIComponent(selectedId)}` : "/api/admin/catalog/families";
    const response = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(effective) });
    const body = await response.json() as { error?: string; issues?: { field: string; message: string }[] };
    setSaving(false);
    if (!response.ok) { setStatus(body.issues?.map((item) => `${item.field}: ${item.message}`).join(" ") ?? body.error ?? "Publish failed."); return; }
    const refreshed = await fetch("/api/admin/catalog/families");
    const refreshedBody = await refreshed.json() as { families?: ManagedCatalogFamily[] };
    if (refreshed.ok && refreshedBody.families) { setFamilies(refreshedBody.families); const saved = refreshedBody.families.find((family) => family.coreId === effective.coreId); if (saved) select(saved); }
    setStatus("Published as a new immutable family version.");
  }

  return <section id="managed-catalog" className="managedCatalog" tabIndex={-1}>
    <div className="managedHeading"><div><p>Persistent catalog administration</p><h2>Managed Lens Families</h2><span>Source-managed LensCore families above remain read-only. Each publish here creates a new version and only changes this managed family.</span></div><button type="button" onClick={add}>Add managed family</button></div>
    {!storageAvailable ? <p className="managedError">Managed catalog storage is not available until the local migration is applied. No production database has been changed.</p> : <div className="managedGrid">
      <aside>{families.length ? families.map((family) => <button type="button" className={selectedId === family.coreId ? "selected" : ""} key={family.coreId} onClick={() => select(family)}><strong>{family.displayName}</strong><span>{family.coreId} · v{family.version}</span></button>) : <p>No managed families published yet.</p>}</aside>
      <div className="managedForm">
        <div className="two"><label>Stable core ID<input value={draft.coreId} disabled={Boolean(selectedId)} onChange={(event) => setDraft({ ...draft, coreId: event.target.value.toUpperCase() })} /></label><label>Display/family name<input value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></label><label>Manufacturer<select value={draft.manufacturer} onChange={(event) => setDraft({ ...draft, manufacturer: event.target.value as ManagedCatalogFamilyInput["manufacturer"] })}>{manufacturers.map((manufacturer) => <option key={manufacturer}>{manufacturer}</option>)}</select></label><label>Replacement<select value={draft.replacement} onChange={(event) => setDraft({ ...draft, replacement: event.target.value as ManagedCatalogFamilyInput["replacement"] })}>{replacements.map((replacement) => <option key={replacement}>{replacement}</option>)}</select></label><label>Family vendor order ID<input value={draft.vendorOrderIdentifier ?? ""} onChange={(event) => setDraft({ ...draft, vendorOrderIdentifier: event.target.value })} /></label><label>Primary product image<input type="file" accept="image/jpeg,image/png" onChange={(event) => void upload(event.target.files?.[0] ?? null)} /></label></div>
        <div className="flags"><label><input type="checkbox" checked={draft.type.toric} onChange={(event) => setDraft({ ...draft, type: { ...draft.type, toric: event.target.checked } })} />Toric</label><label><input type="checkbox" checked={draft.type.multifocal} onChange={(event) => setDraft({ ...draft, type: { ...draft.type, multifocal: event.target.checked } })} />Multifocal</label><label><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />Active</label><label><input type="checkbox" checked={draft.browseVisible} onChange={(event) => setDraft({ ...draft, browseVisible: event.target.checked })} />Browse visible</label></div>
        {draft.images[0] && <p className="imageOk">Primary image attached: {draft.images[0].storagePath}</p>}
        <h3>Pack-size SKUs and retail pricing</h3>{draft.skus.map((sku, index) => <div className="sku" key={index}><input aria-label="SKU" placeholder="SKU" value={sku.sku} onChange={(event) => updateSku(index, "sku", event.target.value)} /><input aria-label="Pack size" type="number" value={sku.packSize} onChange={(event) => updateSku(index, "packSize", Number(event.target.value))} /><input aria-label="Price cents" type="number" value={sku.pricePerBoxCents} onChange={(event) => updateSku(index, "pricePerBoxCents", Number(event.target.value))} /><input aria-label="Vendor SKU" placeholder="Vendor SKU / order ID" value={sku.vendorSku ?? ""} onChange={(event) => updateSku(index, "vendorSku", event.target.value)} /><button type="button" onClick={() => setDraft({ ...draft, skus: draft.skus.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>)}<button type="button" onClick={() => setDraft({ ...draft, skus: [...draft.skus, { sku: "", packSize: 30, pricePerBoxCents: 0, vendorSku: "", active: true }] })}>Add SKU</button>
        <h3>Prescription availability model</h3><p>Use the existing LensCore PowerSpec, exclusions, toric groups, sphereAxisRules, BC-dependent ranges, and multifocal groups. This defines ranges and exceptions, not individual Rx permutations.</p><textarea value={parametersText} onChange={(event) => setParametersText(event.target.value)} spellCheck={false} />
        {issues.length > 0 && <ul className="issues">{issues.map((issue, index) => <li key={`${issue.field}-${index}`}><strong>{issue.field}</strong>: {issue.message}</li>)}</ul>}
        {status && <p className={issues.length ? "managedError" : "status"}>{status}</p>}
        <button className="publish" disabled={saving || !storageAvailable} type="button" onClick={() => void save()}>{saving ? "Publishing…" : selectedId ? "Publish edited version" : "Publish new family"}</button>
      </div>
    </div>}
    <style jsx>{`
      .managedCatalog{max-width:1480px;margin:0 auto 32px;padding:18px;border:1px solid #d7e1e8;border-radius:12px;background:#fff;color:#15212b}.managedHeading{display:flex;justify-content:space-between;gap:16px}.managedHeading p{margin:0;color:#476270;font-size:12px;font-weight:700;text-transform:uppercase}.managedHeading h2{margin:4px 0}.managedHeading span{color:#526570;font-size:14px}.managedGrid{display:grid;grid-template-columns:250px 1fr;gap:18px;margin-top:18px}.managedGrid aside{display:grid;align-content:start;gap:8px}.managedGrid aside button{background:#f6f9fb;border:1px solid #d7e1e8;border-radius:8px;padding:10px;text-align:left}.managedGrid aside button.selected{border-color:#1677b9;background:#edf7fd}.managedGrid aside span{display:block;color:#526570;font-size:12px;margin-top:3px}.managedForm{display:grid;gap:12px}.two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.managedForm label{display:grid;gap:4px;font-size:13px;font-weight:600}.managedForm input,.managedForm select,.managedForm textarea{border:1px solid #bdcad2;border-radius:6px;padding:8px;font:inherit}.flags{display:flex;gap:14px;flex-wrap:wrap}.flags label{display:flex;align-items:center;gap:6px}.sku{display:grid;grid-template-columns:1.3fr .55fr .8fr 1fr auto;gap:8px}.managedForm textarea{min-height:270px;font:12px Consolas,monospace}.managedForm h3{margin:8px 0 0}.managedForm p{margin:0;color:#526570;font-size:13px}.issues,.managedError{color:#9e2525;background:#fff2f2;border:1px solid #edc2c2;padding:10px;border-radius:6px}.status,.imageOk{color:#19623a}.publish{justify-self:start;background:#126da5;border:0;border-radius:6px;color:#fff;font-weight:700;padding:10px 14px}.publish:disabled{opacity:.5}@media(max-width:800px){.managedGrid,.two,.sku{grid-template-columns:1fr}.managedHeading{display:grid}}
    `}</style>
  </section>;
}
