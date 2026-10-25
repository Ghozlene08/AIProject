// Server component: route segment config can only be exported from here,
// not from a "use client" file.
import AlertesClient from "./AlertesClient";
 
export const instant = false;
 
export default function Page() {
  return <AlertesClient />;
}