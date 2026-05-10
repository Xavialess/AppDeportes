import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { I18nextProvider } from 'react-i18next';
import i18n from '@appdeportes/i18n';

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </I18nextProvider>
  );
}
