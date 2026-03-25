"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { GlobalWebSocketProvider } from "./ws-provider";
import { SetupCheck } from "./setup-check";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isSetup = pathname === "/setup";
  const isLogin = pathname === "/login";

  return (
    <>
      {!isLogin && <SetupCheck />}
      {!isLogin && <GlobalWebSocketProvider />}
      {isSetup || isLogin ? (
        <main className="min-h-screen">{children}</main>
      ) : (
        <div className="flex h-screen">
          <Sidebar />
          <main className="flex-1 overflow-auto">{children}</main>
        </div>
      )}
    </>
  );
}
