import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useProfileStore } from '../state/profileStore';
import { wipeAllSecrets } from '../crypto/keys';
import { wipeDatabase } from '../storage/database';
import { NearbyTransportService } from '../transport/NearbyTransportService';
import { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

export default function SettingsScreen() {
  const navigation = useNavigation<Nav>();
  const profile = useProfileStore((state) => state.profile);
  const clearProfile = useProfileStore((state) => state.clearProfile);

  function handleClearData() {
    Alert.alert(
      'Apagar todos os dados locais',
      'Isso vai remover seu perfil, contatos e todas as conversas deste aparelho. Essa ação não pode ser desfeita.',
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

      <Text style={styles.sectionTitle}>Privacidade</Text>
      <Text style={styles.description}>
        Suas mensagens são cifradas de ponta a ponta e nunca saem dos aparelhos envolvidos na
        conversa. Não existe servidor, conta ou backup automático em nuvem.
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
  value: { color: '#fff', fontSize: 18, marginBottom: 32 },
  sectionTitle: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  description: { color: '#a0a0a0', fontSize: 13, lineHeight: 19, marginBottom: 32 },
  dangerButton: { borderColor: '#E24B4A', borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  dangerText: { color: '#E24B4A', fontWeight: '600' },
});
