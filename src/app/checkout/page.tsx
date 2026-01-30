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

  useEffect(() => {
    async function checkAuth() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // 🔒 Not logged in → send to login
        router.replace('/login');
        return;
      }

      setLoading(false);
    }

    checkAuth();
  }, [router]);

  if (loading) {
    return <div>Loading…</div>;
  }

  return (
    <div>
      {/* EXISTING CHECKOUT UI GOES HERE */}
      <h1>Checkout</h1>
    </div>
  );
}
