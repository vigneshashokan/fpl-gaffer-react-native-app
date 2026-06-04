import { Redirect } from 'expo-router';

// Redirects to onboarding. Later tasks will check auth state here.
export default function Index() {
  return <Redirect href="/(onboarding)" />;
}
