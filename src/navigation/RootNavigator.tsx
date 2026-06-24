import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import BiometricConsentScreen from '../screens/BiometricConsentScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import RadarScreen from '../screens/RadarScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useProfileStore } from '../state/profileStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Fluxo de navegação:
 *
 *  biometricReady = false
 *    └── BiometricConsent (única vez, explica e pede confirmação do usuário)
 *
 *  biometricReady = true, profile = null
 *    └── Onboarding (escolha de nome de usuário)
 *
 *  biometricReady = true, profile != null
 *    └── Radar → Chat / Settings
 *
 * O estado biometricReady é carregado do SecureStore em App.tsx antes da
 * NavigationContainer ser montada, então não há flash de tela errada.
 */
export default function RootNavigator() {
  const profile = useProfileStore((state) => state.profile);
  const biometricReady = useProfileStore((state) => state.biometricReady);

  function renderScreens() {
    if (!biometricReady) {
      return (
        <Stack.Screen
          name="BiometricConsent"
          component={BiometricConsentScreen}
          options={{ headerShown: false }}
        />
      );
    }

    if (!profile) {
      return (
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{ headerShown: false }}
        />
      );
    }

    return (
      <>
        <Stack.Screen
          name="Radar"
          component={RadarScreen}
          options={{ title: 'Pessoas por perto' }}
        />
        <Stack.Screen
          name="Chat"
          component={ChatScreen}
          options={({ route }) => ({ title: route.params.username })}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: 'Configurações' }}
        />
      </>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#101314' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#101314' },
        }}
      >
        {renderScreens()}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
