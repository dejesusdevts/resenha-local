import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet,
  Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { useProfileStore } from '../state/profileStore';
import { loadOrCreateIdentityKeyPair, markBiometricReady } from '../crypto/keys';
import { authenticateWithBiometrics } from '../security/biometricAuth';

export default function BiometricConsentScreen() {
  const [loading, setLoading] = useState(false);
  const setBiometricReady = useProfileStore((state) => state.setBiometricReady);

  async function handleSetup() {
    setLoading(true);
    try {
      // Passo 1: pede biometria/PIN uma única vez, com mensagem clara.
      const authenticated = await authenticateWithBiometrics(
        'Confirme sua identidade para configurar o Resenha Local'
      );

      if (!authenticated) {
        Alert.alert(
          'Não foi possível verificar',
          'Configure uma biometria (digital ou rosto) ou um PIN/padrão de desbloqueio ' +
          'nas configurações do Android e tente novamente.\n\n' +
          'Essa proteção é necessária para manter suas mensagens seguras neste aparelho.',
          [{ text: 'Entendido' }]
        );
        return;
      }

      // Passo 2: cria as chaves — sem biometria adicional, já autenticamos acima.
      await loadOrCreateIdentityKeyPair();
      await markBiometricReady();
      setBiometricReady(true);
    } catch {
      Alert.alert('Algo deu errado', 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🔐</Text>
      </View>

      <Text style={styles.title}>Sua segurança{'\n'}começa aqui</Text>

      <Text style={styles.subtitle}>
        Antes de criar seu perfil, vamos confirmar que é você quem está
        configurando o app — e explicar onde seus dados ficam guardados.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Para que serve a biometria?</Text>
        <Text style={styles.cardBody}>
          O Resenha Local gera uma chave criptográfica única neste aparelho para
          proteger suas mensagens. A biometria (ou PIN/padrão) impede que qualquer
          outro app ou pessoa acesse essa chave enquanto a tela estiver bloqueada —
          mesmo que consigam copiar o arquivo do banco de dados.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>O que fica só aqui</Text>
        <Row icon="📱" text="Sua biometria nunca sai do chip de segurança do aparelho. O app nunca a vê, processa ou armazena." />
        <Row icon="🚫" text="Não existe servidor, nuvem ou backup automático. Tudo fica exclusivamente neste aparelho." />
        <Row icon="👤" text="Nenhum dado é enviado a ninguém — nem ao desenvolvedor, nem a terceiros, em nenhuma situação." />
        <Row icon="🔑" text="Sua chave de identidade é gerada aqui agora e nunca trafega pela rede em nenhum momento." />
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          Será pedida sua digital, reconhecimento facial ou PIN do aparelho —
          o mesmo que você usa para desbloquear a tela.{' '}
          <Text style={styles.bold}>Isso acontece uma única vez agora</Text>
          {' '}e depois somente ao abrir o app novamente.
        </Text>
      </View>

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSetup}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.buttonText}>Configurar segurança</Text>
        }
      </Pressable>

      <Text style={styles.footnote}>
        Sem biometria ou PIN configurado no aparelho, o app não consegue proteger
        suas chaves. Configure o bloqueio de tela antes de continuar.
      </Text>
    </ScrollView>
  );
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#101314' },
  container: { padding: 24, paddingBottom: 48 },
  iconContainer: { alignItems: 'center', marginTop: 32, marginBottom: 24 },
  icon: { fontSize: 64 },
  title: {
    color: '#fff', fontSize: 30, fontWeight: '700',
    textAlign: 'center', lineHeight: 38, marginBottom: 12,
  },
  subtitle: {
    color: '#a0a0a0', fontSize: 15, lineHeight: 22,
    textAlign: 'center', marginBottom: 28,
  },
  card: {
    backgroundColor: '#1c2022', borderRadius: 14,
    padding: 18, marginBottom: 14,
  },
  cardTitle: {
    color: '#1d9e75', fontWeight: '600', fontSize: 13,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10,
  },
  cardBody: { color: '#c0c0c0', fontSize: 14, lineHeight: 21 },
  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  rowIcon: { fontSize: 18, marginRight: 12, marginTop: 1 },
  rowText: { flex: 1, color: '#c0c0c0', fontSize: 14, lineHeight: 21 },
  infoBox: {
    borderLeftWidth: 3, borderLeftColor: '#1d9e75',
    paddingLeft: 14, marginBottom: 28,
  },
  infoText: { color: '#888', fontSize: 13, lineHeight: 20 },
  bold: { color: '#ccc', fontWeight: '600' },
  button: {
    backgroundColor: '#1d9e75', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginBottom: 18,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  footnote: { color: '#555', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
