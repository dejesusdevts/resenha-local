import React, { useEffect } from 'react';
import {
  View, Text, FlatList, Pressable,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useDevicesStore } from '../state/devicesStore';
import { NearbyTransportService } from '../transport/NearbyTransportService';
import { RootStackParamList } from '../navigation/types';
import { requestNearbyPermissions } from '../utils/permissions';
import { NearbyDeviceStatus } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Radar'>;

export default function RadarScreen() {
  const navigation = useNavigation<Nav>();
  const devices = useDevicesStore((state) => Object.values(state.devices));

  useEffect(() => {
    let active = true;
    (async () => {
      const granted = await requestNearbyPermissions();
      if (!granted || !active) return;
      await NearbyTransportService.start();
    })();
    return () => {
      active = false;
      NearbyTransportService.stop();
    };
  }, []);

  function handleDevicePress(endpointId: string, status: NearbyDeviceStatus, username: string) {
    if (status === 'discovered') {
      // Usuário decide conectar — nunca automático.
      NearbyTransportService.connectToEndpoint(endpointId);
      return;
    }

    if (status === 'connecting') {
      // Feedback visual já mostra "Conectando..." — nada a fazer aqui.
      return;
    }

    if (status === 'connected') {
      const conversationId = NearbyTransportService.getConversationId(endpointId);
      if (!conversationId) {
        Alert.alert(
          'Ainda sincronizando',
          'A troca de chaves com esse contato está em andamento. Aguarde um instante e tente novamente.'
        );
        return;
      }
      navigation.navigate('Chat', { endpointId, conversationId, username });
    }
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.endpointId}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <ActivityIndicator color="#1d9e75" />
            <Text style={styles.emptyTitle}>Procurando pessoas por perto...</Text>
            <Text style={styles.emptySubtitle}>
              Bluetooth e Wi-Fi precisam estar ligados.{'\n'}
              Não é necessário estar conectado à internet.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={[
              styles.deviceItem,
              item.status === 'connecting' && styles.deviceItemConnecting,
            ]}
            onPress={() => handleDevicePress(item.endpointId, item.status, item.username)}
          >
            <View style={[styles.statusDot, statusDotStyle(item.status)]} />

            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{item.username}</Text>
              <Text style={styles.deviceStatus}>{statusLabel(item.status)}</Text>
            </View>

            <Text style={styles.deviceAction}>{actionLabel(item.status)}</Text>
          </Pressable>
        )}
      />

      <Pressable style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
        <Text style={styles.settingsText}>Configurações</Text>
      </Pressable>
    </View>
  );
}

function statusLabel(status: NearbyDeviceStatus): string {
  switch (status) {
    case 'discovered':    return 'Por perto — toque para conectar';
    case 'connecting':    return 'Conectando...';
    case 'connected':     return 'Conectado — toque para conversar';
    case 'disconnected':  return 'Fora de alcance';
  }
}

function actionLabel(status: NearbyDeviceStatus): string {
  switch (status) {
    case 'discovered':   return '›';
    case 'connecting':   return '···';
    case 'connected':    return '💬';
    case 'disconnected': return '';
  }
}

function statusDotStyle(status: NearbyDeviceStatus) {
  switch (status) {
    case 'connected':    return { backgroundColor: '#1d9e75' };
    case 'connecting':   return { backgroundColor: '#d8a93a' };
    case 'disconnected': return { backgroundColor: '#444' };
    default:             return { backgroundColor: '#555' };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#101314' },
  list: { padding: 16, gap: 10, flexGrow: 1 },

  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingTop: 80,
  },
  emptyTitle: { color: '#aaa', fontSize: 15, fontWeight: '500' },
  emptySubtitle: {
    color: '#555', fontSize: 13, textAlign: 'center', lineHeight: 19,
  },

  deviceItem: {
    backgroundColor: '#1c2022', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  deviceItemConnecting: { opacity: 0.6 },

  statusDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },

  deviceInfo: { flex: 1 },
  deviceName: { color: '#fff', fontSize: 16, fontWeight: '600' },
  deviceStatus: { color: '#888', fontSize: 13, marginTop: 3 },

  deviceAction: { color: '#1d9e75', fontSize: 20, fontWeight: '300' },

  settingsButton: { padding: 16, alignItems: 'center' },
  settingsText: { color: '#1d9e75', fontSize: 14, fontWeight: '500' },
});
