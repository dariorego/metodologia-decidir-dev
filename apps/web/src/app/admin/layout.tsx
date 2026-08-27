import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminSidebar } from "@/components/admin-sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("ponto_profiles")
    .select("id, full_name, role")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");
  if (profile.role !== "admin") redirect("/ponto");

  return (
    <div className="grid min-h-screen md:grid-cols-[236px_1fr]">
      <AdminSidebar name={profile.full_name} />
      <div className="flex min-w-0 flex-col gap-5 px-5 pt-6 pb-16 md:px-8">
        {children}
      </div>
    </div>
  );
}
