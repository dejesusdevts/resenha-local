import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Solicita em tempo de execução todas as permissões necessárias para
 * anunciar/descobrir dispositivos via Nearby Connections, de acordo com
 * a versão do Android (o conjunto de permissões mudou bastante entre o
 * Android 11, 12 e 13 — ver comentários no AndroidManifest do módulo nativo).
 */
export async function requestNearbyPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;

  const apiLevel = Number(Platform.Version);
  const permissions: string[] = [];

  if (apiLevel >= 31) {
    permissions.push(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
    );
  } else {
    permissions.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  }

  if (apiLevel >= 33) {
    permissions.push(
      'android.permission.NEARBY_WIFI_DEVICES',
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
  }

  const results = await PermissionsAndroid.requestMultiple(permissions as any);
  return Object.values(results).every((status) => status === PermissionsAndroid.RESULTS.GRANTED);
}
