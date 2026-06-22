import React, { useEffect, useRef, useState } from 'react';
import { View, FlatList, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { RouteProp, useRoute } from '@react-navigation/native';
import { RootStackParamList } from '../navigation/types';
import { useChatStore } from '../state/chatStore';
import { useTypingStore } from '../state/typingStore';
import { useSecurityStore } from '../state/securityStore';
import { formatFingerprint } from '../crypto/fingerprint';
import { NearbyTransportService } from '../transport/NearbyTransportService';

type ChatRoute = RouteProp<RootStackParamList, 'Chat'>;

const TYPING_STOP_DELAY_MS = 3000;

export default function ChatScreen() {
  const { params } = useRoute<ChatRoute>();
  const [draft, setDraft] = useState('');
  const messages = useChatStore((state) => state.messagesByConversation[params.conversationId] ?? []);
  const isPeerTyping = useTypingStore((state) => state.typingByConversation[params.conversationId] ?? false);
  const pendingIdentityChange = useSecurityStore(
    (state) => state.pendingChangesByEndpoint[params.endpointId]
  );

  const isTypingRef = useRef(false);
  const stopTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function notifyStoppedTyping() {
    if (stopTypingTimeoutRef.current) {
      clearTimeout(stopTypingTimeoutRef.current);
      stopTypingTimeoutRef.current = null;
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      NearbyTransportService.sendTypingIndicator(params.endpointId, false);
    }
  }

  function handleChangeText(text: string) {
    setDraft(text);

    if (text.length === 0) {
      notifyStoppedTyping();
      return;
    }

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      NearbyTransportService.sendTypingIndicator(params.endpointId, true);
    }

    if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
    stopTypingTimeoutRef.current = setTimeout(notifyStoppedTyping, TYPING_STOP_DELAY_MS);
  }

  async function handleSend() {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    notifyStoppedTyping();

    try {
      await NearbyTransportService.sendMessage(params.endpointId, text);
    } catch (error) {
      console.warn('Falha ao enviar mensagem:', error);
      Alert.alert('Não foi possível enviar', String((error as Error)?.message ?? error));
    }
  }

  useEffect(() => {
    return () => {
      if (stopTypingTimeoutRef.current) clearTimeout(stopTypingTimeoutRef.current);
      if (isTypingRef.current) {
        NearbyTransportService.sendTypingIndicator(params.endpointId, false);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Identidade mudou: bloqueia silenciosamente o envio (já é feito no
  // serviço de transporte) e pede confirmação explícita assim que a tela
  // de chat percebe a mudança — nunca substitui a identidade sozinho.
  useEffect(() => {
    if (!pendingIdentityChange) return;

    Alert.alert(
      'A identidade desse contato mudou',
      `${pendingIdentityChange.username} está se conectando com uma chave de segurança diferente da que reconhecíamos.\n\n` +
        `Chave conhecida: ${formatFingerprint(pendingIdentityChange.oldFingerprint)}\n` +
        `Chave nova: ${formatFingerprint(pendingIdentityChange.newFingerprint)}\n\n` +
        'Isso é esperado se essa pessoa reinstalou o app ou trocou de aparelho. Mas também pode ser sinal de algo errado — confirme com ela por outro meio antes de continuar, se tiver dúvida.',
      [
        {
          text: 'Não confiar',
          style: 'cancel',
          onPress: () => NearbyTransportService.rejectIdentityChange(params.endpointId),
        },
        {
          text: 'Confiar na nova identidade',
          style: 'destructive',
          onPress: () => NearbyTransportService.acceptIdentityChange(params.endpointId),
        },
      ]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIdentityChange?.logId]);

  const isBlocked = !!pendingIdentityChange;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.direction === 'outgoing' ? styles.outgoing : styles.incoming]}>
            <Text style={styles.bubbleText}>{item.content}</Text>
          </View>
        )}
      />

      {isBlocked && (
        <View style={styles.warningRow}>
          <Text style={styles.warningText}>
            ⚠ Conversa pausada — a identidade desse contato mudou. Responda à confirmação para continuar.
          </Text>
        </View>
      )}

      {isPeerTyping && !isBlocked && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>{params.username} está digitando...</Text>
        </View>
      )}

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={handleChangeText}
          placeholder={isBlocked ? 'Conversa pausada por segurança' : 'Mensagem cifrada de ponta a ponta...'}
          placeholderTextColor="#777"
          editable={!isBlocked}
          multiline
        />
        <Pressable style={styles.sendButton} onPress={handleSend} disabled={isBlocked}>
          <Text style={[styles.sendText, isBlocked && styles.sendTextDisabled]}>Enviar</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101314' },
  bubble: { maxWidth: '80%', borderRadius: 14, padding: 12 },
  outgoing: { backgroundColor: '#1d9e75', alignSelf: 'flex-end' },
  incoming: { backgroundColor: '#1c2022', alignSelf: 'flex-start' },
  bubbleText: { color: '#fff', fontSize: 15 },
  typingRow: { paddingHorizontal: 16, paddingBottom: 4 },
  typingText: { color: '#888', fontSize: 13, fontStyle: 'italic' },
  warningRow: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#3a1f1f' },
  warningText: { color: '#E8A0A0', fontSize: 13 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#1c2022',
  },
  input: {
    flex: 1,
    backgroundColor: '#1c2022',
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 120,
  },
  sendButton: { justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  sendText: { color: '#1d9e75', fontWeight: '600' },
  sendTextDisabled: { color: '#555' },
});
