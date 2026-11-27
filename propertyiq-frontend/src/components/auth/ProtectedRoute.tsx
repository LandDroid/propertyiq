
"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthProvider";

export default function ProtectedRoute({
  children,
}: {
  children: ReactNode;
}) {
  const router = useRouter();
 const {
  isLoading,
  isAuthenticated,
  user,
  accessToken,
} = useAuth() as any;

console.log("PROTECTED ROUTE");
console.log("isLoading:", isLoading);
console.log("isAuthenticated:", isAuthenticated);
console.log("user:", user);
console.log("accessToken:", accessToken);


  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f7fb",
          color: "#526477",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Checking your secure PropertyIQ session...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
