import { IssueIcon } from "@/components/common/badges";
import { ISSUE_TITLES } from "@/domain/costing/issues";
import type { Issue } from "@/domain/costing/types";

export function IssuesList({ issues, empty }: { issues: Issue[]; empty: string }) {
  if (issues.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {issues.map((x, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          <IssueIcon severity={x.severity} />
          <span>
            <strong className="font-medium">{ISSUE_TITLES[x.code]}.</strong> {x.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
