import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Dashboard from "./dashboard";
export default async function AuthenticatedDashboard({
  view = "my",
}: {
  view?: React.ComponentProps<typeof Dashboard>["view"];
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Dashboard view={view} user={user} />;
}
