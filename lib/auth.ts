import "server-only";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "kanakku_admin";

export async function isAdminRequest(): Promise<boolean> {
  const store = await cookies();
  return store.get(ADMIN_COOKIE)?.value === "1";
}
