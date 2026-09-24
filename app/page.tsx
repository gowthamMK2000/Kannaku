import { headers } from "next/headers";
import { isAdminRequest } from "@/lib/auth";
import { getTripData } from "@/lib/data";
import FriendApp from "@/components/friend/FriendApp";
import AdminApp from "@/components/admin/AdminApp";

export default async function Page() {
  const [admin, data] = await Promise.all([isAdminRequest(), getTripData()]);

  if (!admin) {
    return <FriendApp data={data} />;
  }

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const friendUrl = `${proto}://${host}/`;

  return <AdminApp data={data} friendUrl={friendUrl} />;
}
