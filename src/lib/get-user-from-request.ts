import { createClient } from '@supabase/supabase-js'

const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return null

  const token = authHeader.replace('Bearer ', '')

  const { data, error } = await supabaseAuth.auth.getUser(token)
  if (error) return null

  return data.user ?? null
}
