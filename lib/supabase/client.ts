import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    // During build time or if env vars are missing, return a dummy client to prevent crash
    // if it's strictly required by the environment, throw only in production
    if (process.env.NODE_ENV === "production") {
      console.warn("Supabase environment variables are missing!");
    }
    return createBrowserClient(
      url || "https://placeholder.supabase.co",
      key || "placeholder-key"
    );
  }

  browserClient = createBrowserClient(url, key);
  return browserClient;
}
