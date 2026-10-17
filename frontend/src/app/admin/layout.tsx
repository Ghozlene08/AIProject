import type { Metadata } from "next";
import { AdminShell } from "./AdminShell";

export const metadata: Metadata = { title: { default: "Administration", template: "%s · Administration" } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
