import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { isSeedLoginEnabled } from "@/lib/deployment";
import { verifySeedCredentials } from "@/lib/seed-auth";

export const { auth, handlers, signIn, signOut } = NextAuth({
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      authorize(credentials) {
        if (!isSeedLoginEnabled()) {
          return null;
        }

        return verifySeedCredentials(credentials);
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
});
