"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/auth";

export async function authenticate(
  _previousState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/ledger",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return "The email or password is incorrect.";
    }

    throw error;
  }
}

export async function requestMagicLink(formData: FormData) {
  const email = formData.get("email");

  if (typeof email !== "string" || !email.includes("@")) {
    redirect("/login?error=email");
  }

  redirect("/login?sent=1");
}
