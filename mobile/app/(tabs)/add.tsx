import { Redirect } from 'expo-router';

// This is a placeholder - the tab button redirects to /task/new
export default function AddScreen() {
  return <Redirect href="/task/new" />;
}
