import { handleResearchTrail } from "./handler.mjs";

const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const key = keys.default || Deno.env.get("SUPABASE_ANON_KEY");
const url = Deno.env.get("SUPABASE_URL");
Deno.serve(request => handleResearchTrail(request, { url, key, fetch }));
