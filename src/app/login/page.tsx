'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/checkout`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: '4rem auto' }}>
      <h1>Continue</h1>

      {sent ? (
        <p>
          We’ve emailed you a secure login link.  
          Check your inbox to continue checkout.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: '100%', padding: '0.75rem', marginBottom: '1rem' }}
          />

          <button type="submit">
            Continue with email
          </button>

          {error && (
            <p style={{ color: 'red', marginTop: '1rem' }}>
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
