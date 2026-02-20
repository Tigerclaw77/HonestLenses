"use client";

import { useSearchParams } from "next/navigation";

export default function SuccessClient() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");

  return (
    <div>
      <h1>Payment Successful</h1>
      <p>Session ID: {sessionId}</p>
    </div>
  );
}