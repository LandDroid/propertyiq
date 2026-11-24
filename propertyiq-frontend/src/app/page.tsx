
import DashboardClient from "@/components/dashboard/DashboardClient";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

export const instant = false;

export default function Home() {
  return (
    <ProtectedRoute>
      <DashboardClient />
    </ProtectedRoute>
  );
}
