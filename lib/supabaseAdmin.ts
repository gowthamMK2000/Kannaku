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
    // Naming exactly which one is missing matters here — this fires as a
    // generic "Missing Supabase configuration" in production with no other
    // detail, which is useless for debugging a fresh deploy where only one
    // of the two is actually absent.
    if (!url || !key) {
      const missing = [!url && "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean);
      throw new Error(`Missing Supabase configuration: set ${missing.join(" and ")}.`);
    }
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
