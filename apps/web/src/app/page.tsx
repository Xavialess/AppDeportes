import { redirect } from 'next/navigation';

// Root redirects to the owner dashboard; middleware handles auth guard
export default function RootPage() {
  redirect('/dashboard');
}
