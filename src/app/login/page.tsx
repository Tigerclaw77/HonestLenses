"use client";

import { Suspense } from "react";
import LoginClient from "./LoginClient";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      router.replace("/cart");
    }
  }, [router]);

  return (
    <Suspense fallback={null}>
      <LoginClient />
    </Suspense>
  );
}
