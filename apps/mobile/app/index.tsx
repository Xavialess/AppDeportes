import { Redirect } from 'expo-router';

// Root redirects to the auth gate; router handles session state
export default function Index() {
  return <Redirect href="/(auth)/login" />;
}
