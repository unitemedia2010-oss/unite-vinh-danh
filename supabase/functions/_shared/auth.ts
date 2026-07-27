import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export function serviceClient(): SupabaseClient {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Operator = {
  userId: string | null;
  role: string;
  scheduled: boolean;
};

export async function requireOperator(
  request: Request,
  allowedRoles: string[],
  options: { allowScheduleSecret?: boolean } = {},
): Promise<Operator> {
  if (options.allowScheduleSecret) {
    const configuredSecret = Deno.env.get("SYNC_SHARED_SECRET");
    const providedSecret = request.headers.get("x-sync-secret");
    if (configuredSecret && providedSecret && providedSecret === configuredSecret) {
      return { userId: null, role: "scheduler", scheduled: true };
    }
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("UNAUTHORIZED");

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser(token);
  if (userError || !userData.user) throw new Error("UNAUTHORIZED");

  const admin = serviceClient();
  const { data: profile, error: profileError } = await admin
    .from("vinhdanh_profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile || !allowedRoles.includes(profile.role)) {
    throw new Error("FORBIDDEN");
  }

  return { userId: userData.user.id, role: profile.role, scheduled: false };
}
