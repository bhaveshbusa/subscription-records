import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

export default async function InboxLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return children;
}
