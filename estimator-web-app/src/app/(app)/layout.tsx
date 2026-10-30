import { AppShell } from "@/components/layout/app-shell";
import { OrganisationGate } from "@/components/layout/organisation-gate";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <AppShell>
      <OrganisationGate>{children}</OrganisationGate>
    </AppShell>
  );
}
