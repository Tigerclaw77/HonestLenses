"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase-client";

export default function AuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        const current =
          pathname +
          (searchParams?.toString()
            ? `?${searchParams.toString()}`
            : "");

        router.replace(
          `/login?next=${encodeURIComponent(current)}`
        );
        return;
      }

      setReady(true);
    }

    check();
  }, [router, pathname, searchParams]);

  if (!ready) return null;

  return <>{children}</>;
}