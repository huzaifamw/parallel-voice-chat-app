export function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}
function dictionaryValue(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) return undefined;
  try {
    const values = JSON.parse(raw) as Record<string, string>;
    return values.default ?? Object.values(values)[0];
  } catch {
    return undefined;
  }
}

export function supabasePublishableKey() {
  return Deno.env.get('SUPABASE_ANON_KEY') ?? dictionaryValue('SUPABASE_PUBLISHABLE_KEYS') ?? requiredEnv('APP_SUPABASE_PUBLISHABLE_KEY');
}

export function supabaseSecretKey() {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? dictionaryValue('SUPABASE_SECRET_KEYS') ?? requiredEnv('APP_SUPABASE_SECRET_KEY');
}
