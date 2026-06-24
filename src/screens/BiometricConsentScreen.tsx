import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useProfileStore } from '../state/profileStore';
import { triggerBiometricSetup } from '../crypto/keys';

/**
 * Exibida uma única vez, antes do onboarding, para:
 *  1. Explicar para que serve a autenticação biométrica/PIN no app.
 *  2. Reforçar que NENHUM dado sai do aparelho.
 *  3. Solicitar a confirmação de presença do usuário — que serve tanto
 *     como consentimento explícito quanto como verificação de que o
 *     aparelho tem bloqueio de tela configurado (pré-requisito para o
 *     Keystore hardware-backed funcionar de forma segura).
 */
export default function BiometricConsentScreen() {
  const [loading, setLoading] = useState(false);
  const setBiometricReady = useProfileStore((state) => state.setBiometricReady);

  async function handleSetup() {
    setLoading(true);
    try {
      const ok = await triggerBiometricSetup();
      if (ok) {
        setBiometricReady(true);
      } else {
        Alert.alert(
          'Não foi possível verificar',
          'Configure uma biometria (digital ou rosto) ou um PIN/padrão de desbloqueio nas configurações do Android e tente novamente.\n\nEssa proteção é necessária para manter suas mensagens seguras neste aparelho.',
          [{ text: 'Entendido' }]
        );
      }
    } catch {
      Alert.alert('Algo deu errado', 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* Ícone */}
      <View style={styles.iconContainer}>
        <Text style={styles.icon}>🔐</Text>
      </View>

      {/* Título */}
      <Text style={styles.title}>Sua segurança{'\n'}começa aqui</Text>

      <Text style={styles.subtitle}>
        Antes de criar seu perfil, precisamos confirmar que é você quem está configurando o app.
      </Text>

      {/* Explicação do que é a biometria */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Para que serve?</Text>
        <Text style={styles.cardBody}>
          Suas mensagens são protegidas por uma chave criptográfica única, gerada agora mesmo neste
          aparelho. A biometria (ou PIN/padrão) impede que qualquer outro app ou pessoa acesse essa
          chave enquanto o aparelho estiver bloqueado — mesmo que consigam o arquivo do banco de dados.
        </Text>
      </View>

      {/* Garantias de privacidade */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>O que fica só aqui</Text>
        <Row icon="📱" text="Sua biometria nunca sai do chip de segurança do aparelho — o Resenha Local nunca a vê, processa ou armazena." />
        <Row icon="🚫" text="Não existe servidor, nuvem ou backup automático. Suas mensagens e chaves existem apenas neste aparelho." />
        <Row icon="👤" text="Nenhum dado seu é enviado a nenhum lugar — nem ao desenvolvedor do app, nem a nenhum terceiro." />
        <Row icon="🔑" text="Sua chave de identidade é gerada localmente e nunca trafega pela rede, em nenhum momento." />
      </View>

      {/* Aviso de uso do dispositivo */}
      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          O sistema vai pedir sua digital, reconhecimento facial ou PIN do aparelho — o mesmo que você
          usa para desbloquear a tela.
        </Text>
      </View>

      {/* Botão */}
      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSetup}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Configurar segurança</Text>
        )}
      </Pressable>

      <Text style={styles.footnote}>
        Isso é feito uma única vez. Nas próximas aberturas, o app só pedirá sua confirmação quando
        precisar acessar sua chave de identidade.
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
    color: '#fff',
    fontSize: 30,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 12,
  },
  subtitle: {
    color: '#a0a0a0',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 28,
  },

  card: {
    backgroundColor: '#1c2022',
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
  },
  cardTitle: {
    color: '#1d9e75',
    fontWeight: '600',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  cardBody: {
    color: '#c0c0c0',
    fontSize: 14,
    lineHeight: 21,
  },

  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  rowIcon: { fontSize: 18, marginRight: 12, marginTop: 1 },
  rowText: { flex: 1, color: '#c0c0c0', fontSize: 14, lineHeight: 21 },

  infoBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#1d9e75',
    paddingLeft: 14,
    marginBottom: 28,
  },
  infoText: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  button: {
    backgroundColor: '#1d9e75',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    marginBottom: 18,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '700' },

  footnote: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});
