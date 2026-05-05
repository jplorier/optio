"use client";

import { usePageTitle } from "@/hooks/use-page-title";
import { PageHeader } from "@/components/page-header";
import { IssuesBrowser } from "@/components/issues-browser";
import { CircleDot } from "lucide-react";

export default function IssuesPage() {
  usePageTitle("Issues");
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        icon={CircleDot}
        title="Issues"
        description="GitHub issues across your connected repos. Assign one or many to Optio to spawn Repo Tasks."
      />
      <IssuesBrowser />
    </div>
  );
}
