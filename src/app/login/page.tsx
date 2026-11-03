import { Suspense } from "react";
import { AuthSwitchLink } from "@/components/AuthSwitchLink";
import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to see what needs using first in your kitchen."
      footer={
        <>
          New here?{" "}
          <Suspense fallback={<span>Create an account</span>}>
            <AuthSwitchLink href="/register">Create an account</AuthSwitchLink>
          </Suspense>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
