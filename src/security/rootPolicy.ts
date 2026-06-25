import RootDetection, { RootCheckResult } from 'root-detection';

export type RootPolicy = 'alert' | 'restricted' | 'locked';

const ACTIVE_POLICY: RootPolicy = 'alert';

export type SecurityStatus =
  | { status: 'safe' }
  | { status: 'compromised'; policy: RootPolicy; indicators: string[] };

let cachedStatus: SecurityStatus | null = null;

/**
 * Indicadores que aparecem em builds de desenvolvimento do Expo por
 * motivos legítimos, sem que o aparelho esteja rootado de fato.
 *
 * - test_keys: development builds são assinados com chaves de teste, não
 *   com as chaves de produção da OEM — o EAS Build de desenvolvimento
 *   sempre produz isso.
 * - ro_debuggable: builds de desenvolvimento do Expo habilitam o modo
 *   depurável para conectar ao Metro bundler.
 *
 * Em builds de produção (__DEV__ === false), esses indicadores NÃO são
 * filtrados — aí seria sinal de ROM modificada ou build não-oficial.
 */
const DEV_BUILD_ONLY_INDICATORS = ['test_keys', 'ro_debuggable'];

export async function getSecurityStatus(): Promise<SecurityStatus> {
  if (cachedStatus) return cachedStatus;

  const result: RootCheckResult = await RootDetection.checkRoot();

  const meaningfulIndicators = __DEV__
    ? result.indicators.filter(
        (ind) => !DEV_BUILD_ONLY_INDICATORS.some((d) => ind.startsWith(d))
      )
    : result.indicators;

  if (meaningfulIndicators.length === 0) {
    cachedStatus = { status: 'safe' };
    return cachedStatus;
  }

  cachedStatus = {
    status: 'compromised',
    policy: ACTIVE_POLICY,
    indicators: meaningfulIndicators,
  };
  return cachedStatus;
}

export function isOperationBlocked(operation: 'new_session' | 'read_keys' | 'any'): boolean {
  if (!cachedStatus || cachedStatus.status === 'safe') return false;

  switch (cachedStatus.policy) {
    case 'alert':      return false;
    case 'restricted': return operation === 'new_session' || operation === 'read_keys';
    case 'locked':     return true;
  }
}

export function invalidateCache(): void {
  cachedStatus = null;
}
