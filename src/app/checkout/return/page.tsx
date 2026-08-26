import { Suspense } from "react";

import ReturnClient from "./ReturnClient";

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={<main><section className="content-shell"><p>Finishing checkout…</p></section></main>}>
      <ReturnClient />
    </Suspense>
  );
}
