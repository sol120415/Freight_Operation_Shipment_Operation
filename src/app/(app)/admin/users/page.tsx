import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/rbac";
import { parseAppRole, ALL_ROLES, ROLE_DESCRIPTIONS } from "@/lib/roles";
import { updateUserRole, toggleUserActive } from "./actions";
import type { Profile } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || !can(parseAppRole(me.role) ?? "Customer", "users.manage")) {
    redirect("/forbidden");
  }

  const sp = searchParams ? await searchParams : {};
  const q = (sp.q ?? "").trim().toLowerCase();

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = ((data ?? []) as Profile[]).filter((p) =>
    q
      ? `${p.full_name ?? ""} ${p.email ?? ""} ${p.role}`.toLowerCase().includes(q)
      : true,
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
            User management
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            SuperAdmin only — assign a role with a clear operational purpose and
            activate/deactivate accounts. {rows.length} shown.
          </p>
        </div>
        <form method="get" className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Search name, email, role…"
            className="rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 dark:bg-white px-4 py-2 text-xs font-bold text-white dark:text-slate-900 cursor-pointer"
          >
            Search
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full text-xs min-w-[820px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((p) => (
              <tr key={p.id} className="text-slate-700 dark:text-slate-300">
                <td className="px-4 py-2.5">
                  <p className="font-semibold text-slate-900 dark:text-white">
                    {p.full_name ?? "—"}
                  </p>
                  <p className="text-slate-500">{p.email ?? "—"}</p>
                </td>
                <td className="px-4 py-2.5">
                  <form action={updateUserRole} className="flex gap-1.5">
                    <input type="hidden" name="userId" value={p.id} />
                    <div>
                      <select
                        name="role"
                        defaultValue={p.role}
                        disabled={p.id === user.id}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent px-2 py-1.5 text-slate-900 dark:text-white [&>option]:text-slate-900 disabled:opacity-50"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 max-w-[18rem] text-[10px] text-slate-400">
                        {ROLE_DESCRIPTIONS[p.role]}
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={p.id === user.id}
                      className="rounded-lg bg-pink-600 hover:bg-pink-500 disabled:opacity-40 px-2.5 py-1.5 font-bold text-white cursor-pointer"
                    >
                      Save
                    </button>
                  </form>
                </td>
                <td className="px-4 py-2.5">
                  {p.is_active ? (
                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 font-bold text-emerald-700 dark:text-emerald-300">
                      Active
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 font-bold text-slate-600 dark:text-slate-300">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <form action={toggleUserActive} className="inline">
                    <input type="hidden" name="userId" value={p.id} />
                    <input
                      type="hidden"
                      name="isActive"
                      value={p.is_active ? "false" : "true"}
                    />
                    <button
                      type="submit"
                      disabled={p.id === user.id}
                      className="rounded-lg border border-slate-300 dark:border-slate-600 px-2.5 py-1.5 font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 cursor-pointer"
                    >
                      {p.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  No users match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
