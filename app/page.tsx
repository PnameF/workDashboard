import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
export default async function Page() {
  const user = await getSessionUser();
  redirect(user?.preferences?.homePage || "/my-work");
}
