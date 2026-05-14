/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";

import { lenses } from "../../LensCore/data/lenses";
import type { LensCore } from "../../LensCore/types";

import { getLensSkus } from "@/lib/pricing/getLensSkus";
import { getPackSizeFromSku } from "@/lib/pricing/getPackSize";
import { getPrice } from "@/lib/pricing/getPrice";
import { getLowestPrice } from "@/lib/pricing/getLowestPrice";
import { getPopularityRank } from "@/data/lensPopularityTiers";

import { POSTHOG_EVENTS, track } from "@/lib/posthog/client";

type LensSelection = {
  right?: string;
  left?: string;
};

type LensImageVariant = "card" | "modal";

const LENS_IMAGE_SIZES: Record<
  LensImageVariant,
  { width: number; height: number }
> = {
  card: { width: 176, height: 116 },
  modal: { width: 280, height: 176 },
};

function LensImage({
  coreId,
  variant = "card",
}: {
  coreId: string;
  variant?: LensImageVariant;
}) {
  const sources = [
    `/lens-images/${coreId}.webp`,
    `/lens-images/${coreId}.png`,
    `/lens-images/placeholder.png`,
  ];

  const [index, setIndex] = useState(0);
  const size = LENS_IMAGE_SIZES[variant];

  function handleError() {
    setIndex((prev) => (prev < sources.length - 1 ? prev + 1 : prev));
  }

  return (
    <img
      src={sources[index]}
      onError={handleError}
      alt=""
      loading={variant === "modal" ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={variant === "modal" ? "high" : "low"}
      width={size.width}
      height={size.height}
      style={{
        width: "100%",
        height: "100%",
        maxWidth: size.width,
        maxHeight: size.height,
        objectFit: "contain",
        objectPosition: "center",
        filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.24))",
      }}
    />
  );
}

function replacementLabel(code: string): string {
  if (code === "DD") return "Daily disposable";
  if (code === "1W") return "Weekly replacement";
  if (code === "2W") return "Two-week replacement";
  if (code === "1M") return "Monthly replacement";
  return `${code} replacement`;
}

export default function BrowsePage() {
  const router = useRouter();

  const [selectedLens, setSelectedLens] = useState<LensCore | null>(null);
  const lensMap = Object.fromEntries(
    lenses.map((l) => [l.coreId, l.displayName]),
  );
  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState("all");

  const [selection, setSelection] = useState<LensSelection>({});

  const manufacturerLabels = {
    VISTAKON: "Vistakon",
    ALCON: "Alcon",
    "BAUSCH + LOMB": "Bausch + Lomb",
    COOPERVISION: "CooperVision",
  };

  function assignLens(lensId: string, eye: "right" | "left" | "both") {
    if (eye === "both") {
      setSelection({ right: lensId, left: lensId });
    } else {
      setSelection((prev) => ({ ...prev, [eye]: lensId }));
    }

    setSelectedLens(null);
  }

  function goToPrescription() {
    const params = new URLSearchParams();

    if (selection.right) params.set("right", selection.right);
    if (selection.left) params.set("left", selection.left);

    router.push(`/upload-prescription?${params.toString()}`);
  }

  const filtered = lenses
    .filter((lens) => !lens.coreId.includes("_XR"))
    .filter((lens) => {
      const matchesSearch = lens.displayName
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesManufacturer =
        manufacturerFilter === "all" ||
        lens.manufacturer === manufacturerFilter;

      return matchesSearch && matchesManufacturer;
    })
    .sort((a, b) => {
      const diff = getPopularityRank(a.coreId) - getPopularityRank(b.coreId);

      if (diff !== 0) return diff;

      return a.displayName.localeCompare(b.displayName);
    });

  useEffect(() => {
    const query = search.trim();
    if (!query) return;

    const timeout = window.setTimeout(() => {
      track(POSTHOG_EVENTS.SEARCHED_LENS, {
        query,
        result_count: filtered.length,
        manufacturer_filter: manufacturerFilter,
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [search, filtered.length, manufacturerFilter]);

  useEffect(() => {
    if (manufacturerFilter === "all") return;

    track(POSTHOG_EVENTS.VIEWED_BRAND, {
      manufacturer: manufacturerFilter,
      source: "browse_filter",
      result_count: filtered.length,
    });
  }, [manufacturerFilter, filtered.length]);

  return (
    <>
      <Header variant="shop" />

      <main>
        <section
          style={{
            padding: "2rem",
            maxWidth: 1200,
            margin: "0 auto",
          }}
        >
          <h1 className="upper">Browse</h1>

          <p
            className="browse-helper"
            style={{ color: "rgba(255,255,255,0.85)", maxWidth: 720 }}
          >
            Compare contact lens pricing and pack sizes before ordering. When
            you are ready, we will collect or upload your valid prescription and
            verify it before fulfillment.
          </p>
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr",
            gap: "2rem",
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 2rem 4rem",
          }}
        >
          <aside
            style={{
              borderRight: "1px solid rgba(255,255,255,0.08)",
              paddingRight: "1rem",
            }}
          >
            <h3 className="upper">Search</h3>

            <input
              type="text"
              placeholder="Lens name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%",
                padding: ".5rem",
                marginBottom: "1.5rem",
                background: "#111",
                border: "1px solid #333",
                color: "#fff",
              }}
            />

            <h3 className="upper">Manufacturer</h3>

            {["all", "VISTAKON", "ALCON", "BAUSCH + LOMB", "COOPERVISION"].map(
              (mfr) => (
                <div key={mfr}>
                  <label>
                    <input
                      type="radio"
                      name="mfr"
                      value={mfr}
                      checked={manufacturerFilter === mfr}
                      onChange={(e) => setManufacturerFilter(e.target.value)}
                    />
                    {mfr === "all"
                      ? "All"
                      : manufacturerLabels[
                          mfr as keyof typeof manufacturerLabels
                        ]}
                  </label>
                </div>
              ),
            )}
          </aside>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                typeof window !== "undefined" && window.innerWidth < 768
                  ? "1fr"
                  : "repeat(2, minmax(0, 1fr))",
              gap: "1.5rem",
            }}
          >
            {filtered.map((lens) => {
              const skus = getLensSkus(lens);
              const lowest = getLowestPrice(skus);

              return (
                <div
                  key={lens.coreId}
                  onClick={() => {
                    track(POSTHOG_EVENTS.VIEWED_PRODUCT, {
                      core_id: lens.coreId,
                      manufacturer: lens.manufacturer,
                      lens_name: lens.displayName,
                      source: "browse_grid",
                      lowest_price_cents: lowest ?? null,
                    });

                    setSelectedLens(lens);
                  }}
                  style={{
                    position: "relative",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 10,
                    padding: "1rem",
                    cursor: "pointer",
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    alignItems: "center",
                    gap: "1rem",
                  }}
                >
                  <div
                    style={{
                      width: 172,
                      height: 116,
                      padding: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.06)",
                      background:
                        "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
                      overflow: "hidden",
                    }}
                  >
                    <LensImage coreId={lens.coreId} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontWeight: 600 }}>{lens.displayName}</div>

                    <div style={{ fontSize: ".9rem", opacity: 0.75 }}>
                      {lowest ? `from $${(lowest / 100).toFixed(2)} / box` : ""}
                    </div>

                    <div style={{ fontSize: ".82rem", opacity: 0.65 }}>
                      {replacementLabel(lens.replacement)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {selectedLens && (
          <LensModal
            lens={selectedLens}
            onClose={() => setSelectedLens(null)}
            onSelect={assignLens}
          />
        )}

        {(selection.right || selection.left) && (
          <div
            style={{
              position: "fixed",
              bottom: 24,
              right: 24,
              background: "rgba(70,55,120,0.45)", // lavender glass
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(180,160,255,0.25)",
              borderRadius: 12,
              padding: "14px 16px",
              fontSize: ".9rem",
              zIndex: 1000,
              minWidth: 260,
              boxShadow: "0 15px 40px rgba(0,0,0,0.55)",
            }}
          >
            <div>
              Right eye:{" "}
              {selection.right ? lensMap[selection.right] : "Select lens"}
            </div>
            <div>
              Left eye:{" "}
              {selection.left ? lensMap[selection.left] : "Select lens"}
            </div>

            <div style={{ marginTop: 10 }}>
              <button
                className="primary-btn"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "0.95rem",
                  letterSpacing: "0.02em",
                }}
                onClick={goToPrescription}
              >
                Enter prescription →
              </button>

              <button
                onClick={() => setSelection({})}
                style={{
                  marginTop: 8,
                  width: "100%",
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.65)",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  textDecoration: "underline",
                  textAlign: "left",
                }}
              >
                Remove selection
              </button>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </>
  );
}

function LensModal({
  lens,
  onClose,
  onSelect,
}: {
  lens: LensCore;
  onClose: () => void;
  onSelect: (lensId: string, eye: "right" | "left" | "both") => void;
}) {
  const skus = getLensSkus(lens);
  const [selectedSku, setSelectedSku] = useState(skus[0]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.65)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#111",
          position: "relative",
          padding: "2rem",
          borderRadius: 12,
          width: 420,
          maxWidth: "90%",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow:
            "0 25px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      >
        {/* IMAGE */}
        <div
          style={{
            height: 190,
            padding: "1rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.25rem",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.06)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.018))",
            overflow: "hidden",
          }}
        >
          <LensImage coreId={lens.coreId} variant="modal" />
        </div>

        {/* TITLE */}
        <h2 style={{ marginBottom: ".5rem" }}>{lens.displayName}</h2>

        <p style={{ opacity: 0.7, marginBottom: "1rem" }}>
          {lens.manufacturer} - {replacementLabel(lens.replacement)}
        </p>

        {/* PACK SIZE */}
        <div>
          {skus.length === 1 ? (
            (() => {
              const sku = skus[0];
              const size = getPackSizeFromSku(sku);

              const price = getPrice({
                sku,
                box_count: 1,
              }).price_per_box_cents;

              return (
                <div
                  style={{
                    marginTop: ".5rem",
                    padding: ".6rem .75rem",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {size} pack — ${(price / 100).toFixed(2)}
                </div>
              );
            })()
          ) : (
            <select
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              style={{
                width: "100%",
                marginTop: ".25rem",
              }}
            >
              {skus.map((sku) => {
                const size = getPackSizeFromSku(sku);

                const price = getPrice({
                  sku,
                  box_count: 1,
                }).price_per_box_cents;

                return (
                  <option key={sku} value={sku}>
                    {size} pack — ${(price / 100).toFixed(2)}
                  </option>
                );
              })}
            </select>
          )}
        </div>

        <p style={{ opacity: 0.72, fontSize: ".85rem", marginTop: ".75rem" }}>
          Pack size affects how long each box lasts. Your cart will calculate
          quantity and annual-supply options after your prescription expiration
          date is reviewed.
        </p>

        {/* DIVIDER */}
        <div
          style={{
            marginTop: "1.25rem",
            paddingTop: "1rem",
            borderTop: "1px solid rgba(255,255,255,.07)",
          }}
        />

        {/* PRIMARY CTA */}
        <button
          className="primary-btn"
          style={{
            width: "100%",
            marginBottom: ".45rem",
            fontSize: ".95rem",
            fontWeight: 500,
            letterSpacing: "normal",
            padding: ".6rem .75rem",
          }}
          onClick={() => onSelect(lens.coreId, "both")}
        >
          Use for Both Eyes
        </button>

        {/* SECONDARY CTAS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: ".4rem",
          }}
        >
          <button
            className="primary-btn"
            style={{
              padding: ".45rem .6rem",
              fontSize: ".95rem",
              fontWeight: 500,
              letterSpacing: "normal",
            }}
            onClick={() => onSelect(lens.coreId, "right")}
          >
            Right Only
          </button>

          <button
            className="primary-btn"
            style={{
              padding: ".45rem .6rem",
              fontSize: ".95rem",
              fontWeight: 500,
              letterSpacing: "normal",
            }}
            onClick={() => onSelect(lens.coreId, "left")}
          >
            Left Only
          </button>
        </div>
      </div>
    </div>
  );
}
