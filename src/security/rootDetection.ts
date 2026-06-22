import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

/**
 * Detecção local de root / ambiente comprometido (Objetivo 5).
 *
 * FILOSOFIA DESTA IMPLEMENTAÇÃO:
 * Detecção de root em Android via JavaScript é inerentemente limitada —
 * um dispositivo com root REAL pode ocultar completamente esses sinais
 * de apps em user-space. O objetivo aqui não é tornar o app "à prova de
 * root" (impossível), mas detectar os casos mais comuns de dispositivos
 * modificados sem cuidado de ocultar os rastros, e informar o usuário
 * para que ele possa tomar uma decisão consciente.
 *
 * Todas as verificações são LOCAIS — não dependem de internet, de
 * serviços externos, de Play Integrity API (que exige Google Play
 * Services e tráfego de rede) nem de nenhuma biblioteca nativa adicional.
 *
 * === POLÍTICAS DISPONÍVEIS ===
 *
 *   'warn_only':   exibe um alerta uma vez por sessão; o app funciona
 *                  normalmente. Recomendada para a fase MVP — não expulsa
 *                  usuários com ROMs customizadas legítimas (ex.:
 *                  LineageOS sem root ativo) que disparariam falsos
 *                  positivos. Adotada como padrão.
 *
 *   'restricted':  bloqueia apenas as operações mais sensíveis (apagar
 *                  dados, aceitar nova identidade) quando root for
 *                  detectado. Recomendada para um build "hardened" futuro.
 *
 *   'block':       impede a abertura do app completamente. Adequada para
 *                  ambientes corporativos com MDM. Não recomendada para
 *                  distribuição pública — taxa de falsos positivos alta
 *                  demais em Android.
 *
 * === LIMITAÇÕES RECONHECIDAS ===
 *
 *   - Magisk Hide, Shamiko e ferramentas equivalentes ocultam
 *     completamente os sinais abaixo de apps em user-space. Esta
 *     implementação não detecta root ocultado.
 *   - Algumas ROM de fabricantes (Samsung Knox, MIUI Optimization)
 *     podem disparar falsos positivos em alguns dos checks.
 *   - A verificação de integridade de SafetyNet / Play Integrity (que
 *     detecta bootloader desbloqueado com maior confiabilidade) requer
 *     conexão com os servidores do Google e está fora do escopo de um
 *     app totalmente local como este.
 *   - Ver docs/threat-model.md, cenários "root" e "bootloader
 *     desbloqueado".
 */

export type RootPolicy = 'warn_only' | 'restricted' | 'block';

export type RootCheckResult = {
  isCompromised: boolean;
  signals: string[];
};

// Binários e caminhos mais comuns de ferramentas de root e su binaries.
// Lista baseada nos projetos RootBeer e SafetyNet Helper (Apache 2.0).
const SUSPICIOUS_PATHS = [
  '/sbin/su',
  '/system/bin/su',
  '/system/xbin/su',
  '/data/local/xbin/su',
  '/data/local/bin/su',
  '/data/local/su',
  '/system/sd/xbin/su',
  '/system/bin/failsafe/su',
  '/su/bin/su',
  '/magisk/.core/bin/su',
  '/sbin/magisk',
  '/sbin/.magisk',
  '/data/adb/magisk',
  '/system/app/Superuser.apk',
  '/system/app/SuperSU.apk',
  '/system/app/KingUser.apk',
  '/data/data/eu.chainfire.supersu',
  '/data/data/com.noshufou.android.su',
  '/data/data/com.koushikdutta.superuser',
  '/data/data/com.topjohnwu.magisk',
];

/** Subconjunto verificável via expo-file-system sem permissões especiais. */
async function checkSuspiciousFiles(): Promise<string[]> {
  if (Platform.OS !== 'android') return [];
  const found: string[] = [];

  for (const path of SUSPICIOUS_PATHS) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) found.push(`Arquivo encontrado: ${path}`);
    } catch {
      // Sem permissão de leitura = file provavelmente existe mas está
      // acessível só com root. Contamos isso como sinal suspeito.
      found.push(`Acesso negado (pode indicar arquivo restrito): ${path}`);
    }
  }

  return found;
}

/**
 * Verifica se o app está rodando em modo de depuração (debug build).
 * Em produção, builds debugáveis permitem que ferramentas como Frida
 * injetem código no processo — a Play Store rejeita builds com
 * debuggable=true, mas vale checar em runtime também.
 */
function checkDebugBuild(): string[] {
  if (__DEV__) {
    return ['App rodando em modo de desenvolvimento (debug build) — aceitável em dev, não em produção.'];
  }
  return [];
}

/**
 * Detecta emuladores — não é evidência de comprometimento per se, mas
 * combinado com outros sinais é relevante para análise de segurança.
 */
function checkEmulator(): string[] {
  // Em React Native, não há acesso direto ao Build.FINGERPRINT ou
  // ro.product.model via JS sem módulo nativo adicional. O que podemos
  // fazer: checar props de ambiente que emuladores comuns expõem.
  return []; // reservado para implementação via módulo nativo futuro
}

export async function runRootCheck(): Promise<RootCheckResult> {
  const [fileSignals, debugSignals] = await Promise.all([checkSuspiciousFiles(), Promise.resolve(checkDebugBuild())]);

  const allSignals = [...fileSignals, ...debugSignals];
  // Exclui falsos positivos de modo de desenvolvimento — eles são
  // esperados durante o desenvolvimento e não devem contar como
  // comprometimento no contexto do app.
  const criticalSignals = allSignals.filter((s) => !s.includes('modo de desenvolvimento'));

  return {
    isCompromised: criticalSignals.length > 0,
    signals: allSignals,
  };
}

/**
 * Decide o que fazer com o resultado da checagem, conforme a política
 * configurada. Retorna uma ação a executar na camada de UI.
 */
export function evaluateRootPolicy(
  result: RootCheckResult,
  policy: RootPolicy
): { action: 'allow' | 'warn' | 'block'; message?: string } {
  if (!result.isCompromised) return { action: 'allow' };

  const summary =
    `Foram detectados ${result.signals.length} sinal(is) de que este dispositivo pode estar modificado:\n\n` +
    result.signals.map((s) => `• ${s}`).join('\n') +
    '\n\nAs mensagens continuam cifradas de ponta a ponta, mas as chaves armazenadas neste aparelho podem estar em risco.';

  switch (policy) {
    case 'warn_only':
      return { action: 'warn', message: summary };
    case 'restricted':
      return { action: 'warn', message: summary };
    case 'block':
      return {
        action: 'block',
        message: summary + '\n\nO app foi bloqueado por política de segurança.',
      };
  }
}
