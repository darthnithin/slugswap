import { Redirect } from 'expo-router';

export default function Index() {
  // TODO: Check auth status and redirect accordingly
  // For now, redirect to sign-in
  return <Redirect href="/auth/sign-in" />;
}
