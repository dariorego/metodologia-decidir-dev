import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResidentHeader } from "@/components/resident-header";

export default async function ResidentLayout({
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
  if (profile.role === "admin") redirect("/admin/agora");

  return (
    <div className="flex min-h-screen flex-col">
      <ResidentHeader name={profile.full_name} />
      {children}
    </div>
  );
}
