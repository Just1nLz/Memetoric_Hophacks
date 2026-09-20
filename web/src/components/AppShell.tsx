import type { ReactNode } from "react";

type Props = {
  sidebarCollapsed: boolean;
  navOpen: boolean;
  drawerOpen: boolean;
  sidebar: ReactNode;
  workspace: ReactNode;
  drawer: ReactNode;
  overlays?: ReactNode;
};

export function AppShell({
  sidebarCollapsed,
  navOpen,
  drawerOpen,
  sidebar,
  workspace,
  drawer,
  overlays,
}: Props) {
  return (
    <div
      className={[
        "app-shell",
        sidebarCollapsed ? "rail-collapsed" : "",
        navOpen ? "nav-open" : "",
        drawerOpen ? "drawer-open" : "",
      ].join(" ")}
    >
      {sidebar}
      <div className="workspace">
        <div className="workspace-main">{workspace}</div>
        {drawer}
      </div>
      {overlays}
    </div>
  );
}
