import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AdminUsers from "@/components/admin-users";
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-work");
  return <AdminUsers user={user} />;
}
