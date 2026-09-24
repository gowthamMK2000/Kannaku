import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Service-role Supabase client for server components, server actions and route
 * handlers. Bypasses RLS — never import this from client code.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        "Missing Supabase configuration: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
      );
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
