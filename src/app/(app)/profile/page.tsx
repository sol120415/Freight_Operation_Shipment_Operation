import { Mail, ShieldCheck } from "lucide-react";
import { requireProfile, roleTier } from "@/lib/auth";
import PageHeader from "@/components/ui/PageHeader";
import PasswordCard from "./PasswordCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Profile — Airship Express" };

export default async function ProfilePage() {
  const profile = await requireProfile();
  const tier = roleTier(profile.role);

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <PageHeader
        eyebrow="Account"
        title="My Profile"
        description="Your account information and security settings."
      />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white font-black text-lg flex items-center justify-center border-2 border-pink-500">
            {(profile.full_name ?? profile.email ?? "U")
              .split(" ")
              .map((s) => s[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
              {profile.full_name ?? "Unnamed User"}
            </h3>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <Mail className="w-3 h-3" />
              {profile.email ?? "—"}
            </p>
            <span className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300 px-2 py-0.5 rounded-full">
              <ShieldCheck className="w-3 h-3" />
              {tier} · {profile.role}
            </span>
          </div>
        </div>
      </div>

      <PasswordCard />
    </div>
  );
}
