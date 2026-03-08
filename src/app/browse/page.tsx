/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
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

import ComingSoonOverlay from "@/components/overlays/ComingSoonOverlay";

type LensSelection = {
  right?: string;
  left?: string;
};

function LensImage({ coreId }: { coreId: string }) {
  const sources = [
    `/lens-images/${coreId}.webp`,
    `/lens-images/${coreId}.png`,
    `/lens-images/placeholder.png`,
  ];

  const [index, setIndex] = useState(0);

  function handleError() {
    setIndex((prev) => (prev < sources.length - 1 ? prev + 1 : prev));
  }

  return (
    <img
      src={sources[index]}
      onError={handleError}
      alt=""
      loading="lazy"
      decoding="async"
      fetchPriority="low"
      width={140}
      height={90}
      style={{
        maxWidth: "100%",
        maxHeight: "100%",
        objectFit: "contain",
      }}
    />
  );
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

  const [comingSoonBrand, setComingSoonBrand] = useState<string | null>(null);

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
            Compare contact lens pricing before ordering. When you’re ready,
            we’ll collect or upload your prescription during checkout.
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
                    if (lens.manufacturer === "COOPERVISION") {
                      setComingSoonBrand("CooperVision");
                    } else {
                      setSelectedLens(lens);
                    }
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
                      width: 140,
                      height: 90,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <LensImage coreId={lens.coreId} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div style={{ fontWeight: 600 }}>{lens.displayName}</div>

                    <div style={{ fontSize: ".9rem", opacity: 0.75 }}>
                      {lowest ? `from $${(lowest / 100).toFixed(2)} / box` : ""}
                    </div>
                    {lens.manufacturer === "COOPERVISION" && (
                      <>
                        <div className="cv-ribbon">Coming Soon</div>
                        <div className="cv-ribbon cv-ribbon-2">Notify me</div>
                      </>
                    )}
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

        {comingSoonBrand && (
          <ComingSoonOverlay
            brand={comingSoonBrand}
            onClose={() => setComingSoonBrand(null)}
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

  const isCooperVision = lens.manufacturer === "COOPERVISION";

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
        {isCooperVision && (
          <ComingSoonOverlay brand="CooperVision" inline onClose={onClose} />
        )}
        {/* IMAGE */}
        <div
          style={{
            height: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          <LensImage coreId={lens.coreId} />
        </div>

        {/* TITLE */}
        <h2 style={{ marginBottom: ".5rem" }}>{lens.displayName}</h2>

        <p style={{ opacity: 0.7, marginBottom: "1rem" }}>
          {lens.manufacturer}
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
          disabled={isCooperVision}
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
            disabled={isCooperVision}
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
            disabled={isCooperVision}
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
