import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfileStore } from '../state/profileStore';
import { wipeAllSecrets } from '../crypto/keys';
import { wipeDatabase } from '../storage/database';
import { NearbyTransportService } from '../transport/NearbyTransportService';
import { RootStackParamList } from '../navigation/types';
import { formatFingerprint, computeIdentityFingerprint } from '../crypto/fingerprint';
import { fromBase64 } from '../crypto/encoding';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const profile = useProfileStore((state) => state.profile);
  const clearProfile = useProfileStore((state) => state.clearProfile);

  const fingerprint = profile?.publicKey
    ? formatFingerprint(computeIdentityFingerprint(fromBase64(profile.publicKey)))
    : '—';

  function handleClearData() {
    Alert.alert(
      'Apagar todos os dados locais',
      'Isso vai remover seu perfil, contatos, conversas e chaves criptográficas deste aparelho.\n\nEssa ação é irreversível.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar tudo',
          style: 'destructive',
          onPress: async () => {
            await NearbyTransportService.stop();
            wipeDatabase();
            await wipeAllSecrets();
            clearProfile();
            navigation.reset({ index: 0, routes: [{ name: 'Onboarding' }] });
          },
        },
      ]
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Nome de usuário</Text>
      <Text style={styles.value}>{profile?.username}</Text>

      <Text style={styles.label}>Sua impressão digital de identidade</Text>
      <Text style={styles.fingerprint}>{fingerprint}</Text>
      <Text style={styles.fingerprintHint}>
        Compartilhe esse código com seus contatos para que eles verifiquem que estão conversando com você.
      </Text>

      <Text style={styles.sectionTitle}>Como a privacidade funciona</Text>
      <Text style={styles.description}>
        As mensagens são protegidas pelo Double Ratchet (mesmo princípio do Signal), com chaves efêmeras que mudam a cada troca — comprometer uma sessão não expõe mensagens passadas nem futuras.{'\n\n'}
        As chaves de identidade ficam guardadas no Android Keystore. Nenhum dado sai deste aparelho em nenhum momento.
      </Text>

      <Pressable style={styles.dangerButton} onPress={handleClearData}>
        <Text style={styles.dangerText}>Apagar todos os dados locais</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101314', padding: 24 },
  label: { color: '#888', fontSize: 13, marginBottom: 4 },
  value: { color: '#fff', fontSize: 18, marginBottom: 20 },
  fingerprint: { color: '#1d9e75', fontSize: 13, fontFamily: 'monospace', letterSpacing: 1, marginBottom: 6 },
  fingerprintHint: { color: '#666', fontSize: 12, lineHeight: 17, marginBottom: 28 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  description: { color: '#a0a0a0', fontSize: 13, lineHeight: 19, marginBottom: 32 },
  dangerButton: { borderColor: '#E24B4A', borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 'auto' },
  dangerText: { color: '#E24B4A', fontWeight: '600' },
});
