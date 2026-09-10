import { redirect } from "next/navigation";

import { WORKSPACE_PATH } from "@/lib/workspace/view";

export default function HomePage() {
  redirect(WORKSPACE_PATH);
}
