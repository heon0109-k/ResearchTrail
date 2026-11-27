import { handleResearchTrail } from "./handler.mjs";

const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
const key = keys.default || Deno.env.get("SUPABASE_ANON_KEY");
const storageKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const storageKey = storageKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const url = Deno.env.get("SUPABASE_URL");
// Server-only settings for the question feature. The key never reaches the browser.
const openaiKey = Deno.env.get("OPENAI_API_KEY");
const embeddingModel = Deno.env.get("RAG_EMBEDDING_MODEL");
Deno.serve(request => handleResearchTrail(request, { url, key, storageKey, openaiKey, embeddingModel, fetch }));
