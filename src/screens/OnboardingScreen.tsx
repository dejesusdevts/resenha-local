import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import sodium from 'react-native-libsodium';
import { useProfileStore } from '../state/profileStore';
import { loadOrCreateIdentityKeyPair, publicKeyToBase64 } from '../crypto/keys';
import * as profileRepository from '../storage/repositories/profileRepository';
import { Profile } from '../types';

export default function OnboardingScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const setProfile = useProfileStore((state) => state.setProfile);

  async function handleContinue() {
    const trimmed = username.trim();
    if (trimmed.length < 2) {
      Alert.alert('Nome muito curto', 'Escolha um nome de usuário com pelo menos 2 caracteres.');
      return;
    }

    setLoading(true);
    try {
      await sodium.ready;
      const identity = await loadOrCreateIdentityKeyPair();

      const profile: Profile = {
        id: sodium.to_hex(sodium.randombytes_buf(16)),
        username: trimmed,
        publicKey: publicKeyToBase64(identity.publicKey),
        createdAt: Date.now(),
      };

      profileRepository.saveProfile(profile);
      setProfile(profile);
    } catch (error) {
      Alert.alert('Algo deu errado', 'Não foi possível criar seu perfil local. Tente novamente.');
      console.warn(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Resenha Local</Text>
      <Text style={styles.subtitle}>
        Sem login, sem número de telefone, sem servidor. Só um nome para as pessoas por perto te
        reconhecerem — e tudo cifrado de ponta a ponta entre os aparelhos.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Como você quer ser chamado?"
        placeholderTextColor="#777"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={30}
      />

      <Pressable style={styles.button} onPress={handleContinue} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Preparando...' : 'Começar'}</Text>
      </Pressable>

      <Text style={styles.footnote}>
        Seu nome e seu perfil ficam salvos só neste aparelho. Nada é enviado a nenhum servidor.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101314', padding: 24, justifyContent: 'center' },
  title: { color: '#fff', fontSize: 30, fontWeight: '700', marginBottom: 12 },
  subtitle: { color: '#a0a0a0', fontSize: 14, lineHeight: 20, marginBottom: 32 },
  input: {
    backgroundColor: '#1c2022',
    color: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 16,
  },
  button: { backgroundColor: '#1d9e75', borderRadius: 12, padding: 16, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footnote: { color: '#666', fontSize: 12, marginTop: 24, textAlign: 'center' },
});
