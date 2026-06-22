import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './types';
import OnboardingScreen from '../screens/OnboardingScreen';
import RadarScreen from '../screens/RadarScreen';
import ChatScreen from '../screens/ChatScreen';
import SettingsScreen from '../screens/SettingsScreen';
import { useProfileStore } from '../state/profileStore';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const profile = useProfileStore((state) => state.profile);

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#101314' },
          headerTintColor: '#fff',
          contentStyle: { backgroundColor: '#101314' },
        }}
      >
        {!profile ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Radar" component={RadarScreen} options={{ title: 'Pessoas por perto' }} />
            <Stack.Screen
              name="Chat"
              component={ChatScreen}
              options={({ route }) => ({ title: route.params.username })}
            />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Configurações' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
