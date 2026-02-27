"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function AuthCallback() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function finish() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const next = searchParams.get("next");

      if (session) {
        router.replace(next ?? "/");
      } else {
        router.replace("/login");
      }
    }

    finish();
  }, [router, searchParams]);

  return <main className="content-shell">Signing you in…</main>;
}