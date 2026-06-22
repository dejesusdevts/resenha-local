import 'react-native-get-random-values';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import sodium from 'react-native-libsodium';
import RootNavigator from './src/navigation/RootNavigator';
import { initDatabase, purgeExpiredMessages } from './src/storage/database';
import { loadOrCreateDatabaseKey } from './src/crypto/keys';
import { useProfileStore } from './src/state/profileStore';
import * as profileRepository from './src/storage/repositories/profileRepository';
import { getSecurityStatus, isOperationBlocked } from './src/security/rootPolicy';

export default function App() {
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const setProfile = useProfileStore((state) => state.setProfile);

  useEffect(() => {
    (async () => {
      try {
        await sodium.ready;

        // Verificação de root antes de qualquer operação criptográfica.
        const secStatus = await getSecurityStatus();
        if (secStatus.status === 'compromised') {
          if (isOperationBlocked('any')) {
            setInitError(
              'Ambiente comprometido detectado. O app não pode operar com segurança neste dispositivo.'
            );
            return;
          }
          // Política 'alert' ou 'restricted': avisa e segue.
          Alert.alert(
            'Aviso de segurança',
            'Este dispositivo parece ter sido modificado (root detectado). ' +
              'O Resenha Local pode não proteger seus dados adequadamente neste ambiente. ' +
              'Continue por sua conta e risco.',
            [{ text: 'Entendido', style: 'default' }]
          );
        }

        const dbKey = await loadOrCreateDatabaseKey();
        await initDatabase(dbKey);
        purgeExpiredMessages();

        const existingProfile = profileRepository.getProfile();
        if (existingProfile) setProfile(existingProfile);

        setReady(true);
      } catch (error) {
        console.warn('Erro na inicialização:', error);
        setInitError('Não foi possível iniciar o app com segurança. Tente reinstalar.');
      }
    })();
  }, []);

  if (initError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{initError}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color="#1d9e75" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <RootNavigator />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101314', alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#E24B4A', textAlign: 'center', fontSize: 15, lineHeight: 22 },
});
