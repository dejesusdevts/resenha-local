import { requireNativeModule } from 'expo-modules-core';

/**
 * Detecção local de root e ambiente comprometido.
 *
 * Todas as verificações rodam no Kotlin, localmente no aparelho, sem
 * nenhuma chamada de rede, sem fingerprinting de hardware transmitido a
 * nenhum servidor, sem depender de nenhum serviço externo.
 *
 * POLÍTICA (definida em src/security/rootPolicy.ts):
 *   'alert'     — avisa o usuário na UI, mas não bloqueia nada.
 *   'restricted'— desabilita recursos que dependem de segredos (ex.:
 *                 handshake de novas sessões, leitura de chaves
 *                 privadas), mas permite ler histórico já carregado.
 *   'locked'    — app não opera nenhuma função; só exibe o aviso.
 *
 * LIMITAÇÕES HONESTAS (documentadas em docs/threat-model.md):
 *   - Estas verificações são baseadas em heurísticas conhecidas
 *     publicamente. Um root sofisticado (com Magisk Hide / Shamiko
 *     ativados) pode contornar a maioria. O objetivo não é tornar a
 *     detecção inquebrável, mas tornar o custo de contorná-la alto o
 *     suficiente para que um atacante comum não se dê ao trabalho.
 *   - Falsos positivos existem: alguns aparelhos de fabricantes
 *     (ex.: certos modelos Samsung, Sony com bootloader desbloqueado
 *     de fábrica para desenvolvedores) podem disparar uma ou mais
 *     heurísticas sem estarem rootados de fato. Por isso a política
 *     padrão é 'alert', não 'locked'.
 */
export type RootCheckResult = {
  isRooted: boolean;
  indicators: string[];
};

interface RootDetectionNativeModule {
  checkRoot(): Promise<RootCheckResult>;
}

const Native = requireNativeModule<RootDetectionNativeModule>('RootDetection');
export default Native;
