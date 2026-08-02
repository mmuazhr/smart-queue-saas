// =============================================================================
// Dashboard Layout (server) — fresh-role gate + client shell
// =============================================================================
// The edge middleware gates on the JWT role, which can be stale until the
// token re-issues. This server check re-reads the session (fresh DB role via
// the Node session callback) on every dashboard page load.

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import DashboardShell from "./DashboardShell";
import PendingApproval from "./PendingApproval";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/dashboard");
  }
  const role = session.user.role;
  if (role !== "MERCHANT" && role !== "ADMIN") {
    redirect("/?error=unauthorized");
  }
  // Fresh DB read, mirroring the fresh-role pattern above: the JWT can't be
  // trusted to know the merchant was approved after login.
  if (role === "MERCHANT") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { isVerified: true },
    });
    if (user && !user.isVerified) {
      return <PendingApproval />;
    }
  }
  return <DashboardShell>{children}</DashboardShell>;
}
