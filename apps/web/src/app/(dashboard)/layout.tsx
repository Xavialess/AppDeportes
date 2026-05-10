// Route-group layout — acts as a passthrough.
// Auth and shell UI is handled by app/dashboard/layout.tsx and app/admin/layout.tsx.
import type { ReactNode } from 'react';

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
