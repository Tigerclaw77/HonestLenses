"use client";

import { useEffect } from "react";
import { getLensById, toPowerList } from "@/LensCore";

export default function TestLensPage() {
  useEffect(() => {
    const lens = getLensById("OASYS_2W");

    if (!lens) {
      console.warn("Lens not found");
      return;
    }

    if (!lens.parameters.sphere) {
      console.warn("Lens has no spherical spec");
      return;
    }

    const sphereSpec = lens.parameters.sphere;
    const sphereValues = toPowerList(sphereSpec);

    console.log("=== TEST LENS DEBUG ===");
    console.log("Lens:", lens.displayName);
    console.log("Segments:", sphereSpec.segments);
    console.log("Exclude:", sphereSpec.exclude ?? "none");
    console.log("Sphere count:", sphereValues.length);
    console.log("First 10:", sphereValues.slice(0, 10));
    console.log("Last 10:", sphereValues.slice(-10));
  }, []);

  return <div>Check console</div>;
}