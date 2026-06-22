import RootDetection, { RootCheckResult } from 'root-detection';

/**
 * Política de reação ao root — configurável sem rebuild nativo.
 *
 * 'alert'     — comportamento padrão: exibe um aviso na UI explicando
 *               os riscos, mas o app funciona normalmente. Indicado
 *               quando os falsos positivos (ROMs customizadas legítimas,
 *               aparelhos de dev) pesam mais que o risco real de uso
 *               por um usuário que deliberadamente rootou o aparelho.
 *
 * 'restricted'— desabilita operações que envolvem material criptográfico
 *               novo (iniciar novas sessões, assinar mensagens), mas
 *               permite ler conversas já carregadas em memória. Indicado
 *               para builds de produção de alta sensibilidade.
 *
 * 'locked'    — o app exibe apenas um aviso e não opera nenhuma função.
 *               Indicado para organizações que precisam de garantias
 *               fortes de ambiente de execução (uso corporativo).
 *
 * Raciocínio para o padrão 'alert': ver docs/threat-model.md, cenário
 * "root / bootloader desbloqueado" — a detecção local é uma camada de
 * defesa de profundidade, não uma barreira absoluta. Um atacante com
 * root já tem acesso ao dispositivo físico e muito provavelmente
 * consegue contornar essa verificação com ferramentas como Magisk Hide
 * ou Shamiko. O valor real da detecção é conscientizar o usuário
 * legítimo (que pode não saber que rootou indiretamente ao instalar uma
 * ROM customizada) e dificultar explorações automatizadas não
 * sofisticadas.
 */
export type RootPolicy = 'alert' | 'restricted' | 'locked';

const ACTIVE_POLICY: RootPolicy = 'alert'; // altere aqui para builds específicos

export type SecurityStatus =
  | { status: 'safe' }
  | { status: 'compromised'; policy: RootPolicy; indicators: string[] };

let cachedStatus: SecurityStatus | null = null;

export async function getSecurityStatus(): Promise<SecurityStatus> {
  if (cachedStatus) return cachedStatus; // verificação feita uma vez por sessão

  const result: RootCheckResult = await RootDetection.checkRoot();

  if (!result.isRooted) {
    cachedStatus = { status: 'safe' };
    return cachedStatus;
  }

  cachedStatus = {
    status: 'compromised',
    policy: ACTIVE_POLICY,
    indicators: result.indicators,
  };
  return cachedStatus;
}

export function isOperationBlocked(operation: 'new_session' | 'read_keys' | 'any'): boolean {
  if (!cachedStatus || cachedStatus.status === 'safe') return false;

  switch (cachedStatus.policy) {
    case 'alert':     return false;
    case 'restricted': return operation === 'new_session' || operation === 'read_keys';
    case 'locked':    return true;
  }
}

export function invalidateCache(): void {
  cachedStatus = null;
}
