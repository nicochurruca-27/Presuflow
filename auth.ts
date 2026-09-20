import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";
import { isSessionTokenValid, nowInSeconds } from "@/lib/session-validity";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Stamped once, at sign-in. Auth.js refreshes `iat` on every session
        // read, so this is the only reliable record of when this session began.
        token.authAt = nowInSeconds();
        return token;
      }

      // Every subsequent session read passes through here: a token issued
      // before the account's last password change is refused, and returning
      // null makes Auth.js drop the session and clear the cookie.
      if (typeof token.id === "string") {
        const stillValid = await isSessionTokenValid(token.id, token.authAt as number | undefined);
        if (!stillValid) return null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
