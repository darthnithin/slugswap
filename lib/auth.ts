import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";

export const authClient = createAuthClient({
  baseURL: Constants.expoConfig?.extra?.neonAuthUrl || process.env.EXPO_PUBLIC_NEON_AUTH_URL,
});

export const { signIn, signUp, signOut, useSession } = authClient;
