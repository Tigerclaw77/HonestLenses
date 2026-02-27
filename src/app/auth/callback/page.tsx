import { Suspense } from "react";
import AuthCallbackClient from "./AuthCallbackClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main className="content-shell">Signing you in…</main>}>
      <AuthCallbackClient />
    </Suspense>
  );
}