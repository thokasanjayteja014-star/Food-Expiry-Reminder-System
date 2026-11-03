import { Suspense } from "react";
import { AuthSwitchLink } from "@/components/AuthSwitchLink";
import type { Metadata } from "next";
import { AuthCard } from "@/components/AuthCard";
import { RegisterForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Register" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Start tracking your food in under a minute."
      footer={
        <>
          Already have an account?{" "}
          <Suspense fallback={<span>Login</span>}>
            <AuthSwitchLink href="/login">Login</AuthSwitchLink>
          </Suspense>
        </>
      }
    >
      <Suspense>
        <RegisterForm />
      </Suspense>
    </AuthCard>
  );
}
