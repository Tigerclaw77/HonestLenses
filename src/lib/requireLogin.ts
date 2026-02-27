// lib/requireLogin.ts
export function requireLogin(router: { replace: (url: string) => void }) {
  const next =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/";

  router.replace(`/login?next=${encodeURIComponent(next)}`);
}