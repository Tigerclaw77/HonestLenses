"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let alive = true;

    async function finish() {
      const next = searchParams.get("next");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!alive) return;

      if (session) {
        router.replace(next ?? "/");
      } else {
        // keep this as fallback, but ideally your flow always includes next
        router.replace("/login");
      }
    }

    void finish();
    return () => {
      alive = false;
    };
  }, [router, searchParams]);

  return <main className="content-shell">Signing you in…</main>;
}