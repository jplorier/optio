"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function SetupCheck() {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Don't redirect if already on setup or login page
    if (pathname === "/setup" || pathname === "/login") {
      setChecked(true);
      return;
    }

    api
      .getSetupStatus()
      .then(async (res) => {
        if (!res.isSetUp) {
          // Not set up — require login before showing the wizard
          try {
            await api.getCurrentUser();
            // Logged in but not set up → go to setup
            router.replace("/setup");
          } catch {
            // Not logged in → go to login first
            router.replace("/login");
          }
        }
      })
      .catch(() => {
        // API not reachable — don't redirect, let user see the dashboard
      })
      .finally(() => setChecked(true));
  }, [pathname, router]);

  return null;
}
