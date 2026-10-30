import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import AccountSettings from "@/components/account-settings";
export default async function Page() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/settings");
  return <AccountSettings initialUser={user} />;
}
