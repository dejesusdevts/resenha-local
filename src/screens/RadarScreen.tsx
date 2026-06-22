import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDevicesStore } from '../state/devicesStore';
import { NearbyTransportService } from '../transport/NearbyTransportService';
import { RootStackParamList } from '../navigation/types';
import { requestNearbyPermissions } from '../utils/permissions';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Radar'>;

type RadarError = { kind: 'permission' } | { kind: 'transport'; message: string } | null;

export default function RadarScreen() {
  const navigation = useNavigation<Nav>();
  const devices = useDevicesStore((state) => Object.values(state.devices));
  const [error, setError] = useState<RadarError>(null);

  useEffect(() => {
    let active = true;

    (async () => {
      setError(null);

      const granted = await requestNearbyPermissions();
      if (!active) return;
      if (!granted) {
        setError({ kind: 'permission' });
        return;
      }

      try {
        await NearbyTransportService.start();
      } catch (e) {
        if (!active) return;
        const message = e instanceof Error ? e.message : String(e);
        console.warn('Falha ao iniciar NearbyTransportService:', message);
        setError({ kind: 'transport', message });
      }
    })();

    return () => {
      active = false;
      NearbyTransportService.stop();
    };
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.endpointId}
        contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}
        ListEmptyComponent={
          error?.kind === 'permission' ? (
            <View style={styles.empty}>
              <Text style={styles.errorTitle}>Permissões necessárias não foram concedidas</Text>
              <Text style={styles.emptyText}>
                Vá em Ajustes do Android {'>'} Apps {'>'} Resenha Local {'>'} Permissões e libere
                Bluetooth e Localização. Em muitos aparelhos também é preciso que a Localização
                (GPS) do sistema esteja LIGADA para a varredura Bluetooth funcionar, mesmo com a
                permissão do app concedida.
              </Text>
            </View>
          ) : error?.kind === 'transport' ? (
            <View style={styles.empty}>
              <Text style={styles.errorTitle}>Não foi possível iniciar a busca</Text>
              <Text style={styles.emptyText}>{error.message}</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <ActivityIndicator color="#1d9e75" />
              <Text style={styles.emptyText}>Procurando pessoas por perto...</Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.deviceItem}
            disabled={item.status !== 'connected'}
            onPress={() => {
              const conversationId = NearbyTransportService.getConversationId(item.endpointId);
              if (!conversationId) {
                Alert.alert(
                  'Ainda sincronizando',
                  'A troca de chaves de segurança com esse contato ainda não terminou. Aguarde alguns segundos e tente de novo.'
                );
                return;
              }
              navigation.navigate('Chat', {
                endpointId: item.endpointId,
                conversationId,
                username: item.username,
              });
            }}
          >
            <View style={[styles.statusDot, statusColor(item.status)]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.deviceName}>{item.username}</Text>
              <Text style={styles.deviceStatus}>{statusLabel(item.status)}</Text>
            </View>
          </Pressable>
        )}
      />
      <Pressable style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsText}>Configurações</Text>
      </Pressable>
    </View>
  );
}

function statusLabel(status: string): string {
  switch (status) {
    case 'discovered':
      return 'Encontrado, conectando...';
    case 'connecting':
      return 'Conectando...';
    case 'connected':
      return 'Por perto agora';
    case 'disconnected':
      return 'Fora de alcance';
    default:
      return status;
  }
}

function statusColor(status: string) {
  if (status === 'connected') return { backgroundColor: '#1d9e75' };
  if (status === 'disconnected') return { backgroundColor: '#555' };
  return { backgroundColor: '#d8a93a' };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101314' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 64, paddingHorizontal: 24 },
  errorTitle: { color: '#E24B4A', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: '#888', textAlign: 'center', lineHeight: 19 },
  deviceItem: {
    backgroundColor: '#1c2022',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  deviceName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deviceStatus: { color: '#a0a0a0', fontSize: 13, marginTop: 2 },
  settingsButton: { padding: 16, alignItems: 'center' },
  settingsText: { color: '#1d9e75', fontSize: 14, fontWeight: '500' },
});
