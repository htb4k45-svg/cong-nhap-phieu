import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Thiếu biến môi trường Supabase. Kiểm tra .env.local');
}

// Client dùng ở cả client-side và server-side
export const supabase = createClient(supabaseUrl, supabasePublishableKey);

// Admin client chỉ dùng trong API routes (server-side)
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error('Thiếu SUPABASE_SECRET_KEY');
  return createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
