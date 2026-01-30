'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CheckoutPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function append(msg: string) {
    setLog((l) => [...l, msg]);
  }

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace('/login');
        return;
      }

      setLoading(false);
    }

    checkAuth();
  }, [router]);

  async function authFetch(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) throw new Error('Not logged in');

    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  }

  async function createOrder() {
    setError(null);
    append('→ Creating order');

    try {
      const res = await authFetch('/api/orders', { method: 'POST' });
      const body: { orderId?: string; error?: string } = await res.json();

      if (!res.ok) throw new Error(body.error || 'Create failed');
      if (!body.orderId) throw new Error('Missing orderId');

      setOrderId(body.orderId);
      append(`✓ Order created: ${body.orderId}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function setPrice() {
    if (!orderId) return;
    append('→ Setting price');

    try {
      const res = await authFetch(`/api/orders/${orderId}/price`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_amount_cents: 2499,
          currency: 'USD',
        }),
      });

      const body: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok) throw new Error(body.error || 'Price failed');

      append('✓ Price set ($24.99)');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Price failed');
    }
  }

  async function attachRx() {
    if (!orderId) return;
    append('→ Attaching Rx');

    try {
      const res = await authFetch(`/api/orders/${orderId}/rx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          right: { sphere: -2.25, cyl: -0.75, axis: 180 },
          left: { sphere: -2.0, cyl: -0.5, axis: 170 },
          expires: '2026-05-01',
        }),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || 'Rx failed');

      append('✓ Rx attached (verification required)');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Rx failed');
    }
  }

  async function authorizePayment() {
    if (!orderId) return;
    append('→ Authorizing payment (hold only)');

    try {
      const res = await authFetch(`/api/orders/${orderId}/pay`, {
        method: 'POST',
      });

      const body: { clientSecret?: string; error?: string } = await res.json();
      if (!res.ok) throw new Error(body.error || 'Authorize failed');

      append('✓ Payment authorized (Stripe hold)');
      if (body.clientSecret) {
        append(`  clientSecret: ${body.clientSecret.slice(0, 16)}…`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Authorize failed');
    }
  }

  async function verifyRx() {
    if (!orderId) return;
    append('→ Verifying Rx (manual/admin)');

    try {
      const res = await authFetch(`/api/orders/${orderId}/verify`, {
        method: 'POST',
      });

      const body: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok) throw new Error(body.error || 'Verify failed');

      append('✓ Rx verified (verification cleared)');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verify failed');
    }
  }

  async function capture() {
    if (!orderId) return;
    append('→ Capturing payment');

    try {
      const res = await authFetch(`/api/orders/${orderId}/capture`, {
        method: 'POST',
      });

      const body: { ok?: boolean; error?: string } = await res.json();
      if (!res.ok) throw new Error(body.error || 'Capture failed');

      append('✓ Payment captured');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Capture failed');
    }
  }

  if (loading) return <div>Loading…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <h1>Dumb Checkout (MVP)</h1>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={createOrder}>1. Create Order</button>
        <button onClick={setPrice} disabled={!orderId}>
          2. Set Price
        </button>
        <button onClick={attachRx} disabled={!orderId}>
          3. Attach Rx
        </button>
        <button onClick={authorizePayment} disabled={!orderId}>
          4. Authorize Payment (hold only)
        </button>
        <button onClick={verifyRx} disabled={!orderId}>
          5. Verify Rx
        </button>
        <button onClick={capture} disabled={!orderId}>
          6. Capture
        </button>
      </div>

      {orderId && (
        <div style={{ marginTop: 16 }}>
          <strong>Order ID</strong>
          <pre>{orderId}</pre>
        </div>
      )}

      {error && (
        <div style={{ color: 'red', marginTop: 16 }}>
          {error}
        </div>
      )}

      <pre
        style={{
          marginTop: 24,
          padding: 12,
          background: '#111',
          color: '#0f0',
          minHeight: 220,
        }}
      >
        {log.join('\n')}
      </pre>
    </div>
  );
}
