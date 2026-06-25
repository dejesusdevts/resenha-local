import * as LocalAuthentication from 'expo-local-authentication';

/**
 * Único ponto de entrada para autenticação biométrica no app.
 * Usa expo-local-authentication, que suporta digital, rosto e PIN/padrão
 * do aparelho como fallback — o usuário sempre tem uma opção disponível
 * mesmo sem biometria cadastrada.
 *
 * Retorna true se o usuário autenticou com sucesso.
 * Retorna false se cancelou ou não há método de bloqueio configurado.
 */
export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();

  if (!hasHardware) {
    // Aparelho sem hardware biométrico — sem biometria disponível,
    // mas também não tem como proteger as chaves via hardware. Permite
    // continuar; o SQLCipher e WHEN_UNLOCKED_THIS_DEVICE_ONLY ainda
    // protegem em repouso.
    return true;
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: 'Usar PIN / padrão',
    // disableDeviceFallback: false -> permite PIN/padrão se biometria falhar
    disableDeviceFallback: false,
    cancelLabel: 'Cancelar',
  });

  return result.success;
}

/** Verifica se o aparelho tem biometria ou PIN configurado. */
export async function hasBiometricOrDeviceLock(): Promise<boolean> {
  const [hasHardware, isEnrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  // Considera OK se tem biometria cadastrada OU se tem PIN/padrão
  // (expo-local-authentication cobre os dois via disableDeviceFallback: false)
  return hasHardware || isEnrolled;
}
