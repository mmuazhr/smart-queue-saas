// =============================================================================
// Admin Layout (server) — fresh-role gate + client shell
// =============================================================================
// The edge middleware gates on the JWT role, which can be stale until the
// token re-issues. This server check re-reads the session (fresh DB role via
// the Node session callback) on every admin page load.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminShell from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/admin");
  }
  if (session.user.role !== "ADMIN") {
    redirect("/?error=unauthorized");
  }
  return <AdminShell>{children}</AdminShell>;
}
