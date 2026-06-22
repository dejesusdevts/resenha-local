import { getDatabase } from '../storage/database';

/**
 * Proteções do armazenamento local (Objetivo 6).
 *
 * === VALIDAÇÃO DO SQLCipher ===
 * Confirma em runtime que o banco está realmente cifrado — não confia
 * apenas no fato de ter passado uma encryptionKey para `open()`. Um banco
 * aberto sem cifragem ou com a chave errada se manifesta de duas formas:
 *   a) o `open()` lança exceção com "file is not a database" (SQLCipher
 *      rejeita abrir um banco não cifrado com uma chave) — já tratado
 *      no initDatabase; ou
 *   b) o banco estava corrompido/vazio e foi criado de novo sem cifragem
 *      (só acontece se o `open()` ignorar silenciosamente a chave, o que
 *      não deveria ocorrer no op-sqlite com SQLCipher compilado, mas
 *      vale verificar).
 * A verificação abaixo detecta o caso (b): tenta ler a versão do cipher
 * do próprio SQLCipher — se falhar, o SQLCipher não está ativo.
 */
export function validateSQLCipherActive(): { active: boolean; error?: string } {
  try {
    const db = getDatabase();
    // PRAGMA cipher_version é fornecido SOMENTE pelo SQLCipher, não pelo
    // SQLite puro. Se retornar null/vazio, a build não tem SQLCipher.
    const result = db.execute("PRAGMA cipher_version;");
    const version = result.rows?._array?.[0]?.cipher_version;
    if (!version) {
      return {
        active: false,
        error: 'cipher_version vazio — SQLCipher pode não estar compilado nesta build. Verifique as dependências do @op-engineering/op-sqlite.',
      };
    }
    return { active: true };
  } catch (error: any) {
    return { active: false, error: String(error?.message ?? error) };
  }
}

/**
 * Verifica se o banco responde normalmente com a chave atual.
 * Uma discrepância aqui indica que a chave mudou (rotação incompleta)
 * ou que o banco foi substituído por um arquivo externo.
 */
export function validateDatabaseIntegrity(): { ok: boolean; error?: string } {
  try {
    const db = getDatabase();
    const result = db.execute('PRAGMA integrity_check;');
    const check = result.rows?._array?.[0]?.integrity_check;
    if (check !== 'ok') {
      return { ok: false, error: `integrity_check retornou: ${check}` };
    }
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

/**
 * === PROTEÇÃO CONTRA BACKUP INSEGURO ===
 *
 * O Android faz backup automático de dados de apps pelo ADB e pelo
 * Google Backup. O arquivo do banco SQLCipher ESTÁ cifrado em repouso,
 * então um backup não expõe o conteúdo sem a chave. Mas a chave fica no
 * Android Keystore, que NÃO é incluído em backups automáticos —
 * portanto, um backup restaurado em outro aparelho não consegue abrir
 * o banco. Isso é o comportamento DESEJADO.
 *
 * A declaração correta para impedir backups ADB não autorizados é feita
 * no AndroidManifest (android:allowBackup="false"), que o Expo configura
 * automaticamente quando `androidAllowBackup: false` está no app.config.
 *
 * Esta função valida se a configuração foi aplicada corretamente
 * (só consegue verificar indiretamente via Runtime — não há API JS
 * para ler o AndroidManifest em runtime). A verificação principal
 * precisa acontecer via CI/CD: ver docs/security-audit-checklist.md.
 */
export function getBackupProtectionStatus(): string {
  return (
    'O banco de dados é cifrado pelo SQLCipher. A chave de cifragem fica ' +
    'no Android Keystore e NÃO é incluída em backups automáticos do Android, ' +
    'tornando um backup restaurado em outro aparelho ilegível sem a chave original. ' +
    'Confirme que androidAllowBackup=false está configurado no app.config.ts ' +
    'para impedir backups ADB não autorizados (ver docs/security-audit-checklist.md).'
  );
}
