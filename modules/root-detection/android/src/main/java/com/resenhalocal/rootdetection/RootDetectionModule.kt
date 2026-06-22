package com.resenhalocal.rootdetection

import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.io.File

/**
 * Verificações de root e ambiente comprometido — todas locais, sem
 * nenhuma chamada de rede. Cada verificação é independente das outras:
 * uma falha isolada não cancela as demais.
 *
 * Heurísticas implementadas (ver comentários individuais para contexto
 * de falsos positivos e limitações):
 *  1. Binários su em locais comuns
 *  2. Caminhos de root conhecidos
 *  3. Presença de apps de gerenciamento de root (Magisk, SuperSU etc.)
 *  4. Build.TAGS contém "test-keys" (build não assinado pela OEM)
 *  5. Propriedade ro.debuggable == "1"
 *  6. Partição /system montada como leitura-escrita
 *  7. Estado do bootloader via ro.boot.verifiedbootstate /
 *     ro.bootloader (aproximação — confirmar via DM-Verity quando
 *     possível)
 *  8. Detecção de "hook frameworks" via checagem de classes
 *     conhecidas de Xposed/LSPosed em classpath (melhor esforço)
 */
class RootDetectionModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("RootDetection")

        AsyncFunction("checkRoot") { promise: Promise ->
            val indicators = mutableListOf<String>()

            runCatching { checkSuBinaries(indicators) }
            runCatching { checkRootPaths(indicators) }
            runCatching { checkRootManagementApps(indicators) }
            runCatching { checkTestKeys(indicators) }
            runCatching { checkDebuggable(indicators) }
            runCatching { checkWritableSystem(indicators) }
            runCatching { checkBootloader(indicators) }
            runCatching { checkHookFrameworks(indicators) }

            promise.resolve(mapOf(
                "isRooted" to indicators.isNotEmpty(),
                "indicators" to indicators
            ))
        }
    }

    /**
     * Binários "su" em locais padrão usados por scripts de root.
     * Falso positivo comum: alguns emuladores e builds de debug da
     * AOSP incluem esses binários sem o aparelho estar "rootado" no
     * sentido de uso real.
     */
    private fun checkSuBinaries(indicators: MutableList<String>) {
        val suPaths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su",
            "/system/su", "/system/bin/.ext/.su", "/system/xbin/.su",
            "/data/local/xbin/su", "/data/local/bin/su", "/data/local/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su", "/dev/com.koushikdutta.superuser.daemon/"
        )
        for (path in suPaths) {
            if (File(path).exists()) {
                indicators.add("su_binary:$path")
                return // um é suficiente para a heurística
            }
        }
    }

    /**
     * Diretórios associados a ambientes rootados populares. Menos
     * definitivo que os binários su, mas cobre casos onde o binário
     * foi ocultado via Magisk Hide.
     */
    private fun checkRootPaths(indicators: MutableList<String>) {
        val rootPaths = listOf(
            "/data/local/tmp/busybox", "/data/local/tmp/su",
            "/system/app/Superuser.apk", "/system/etc/security/otacerts.zip",
            "/cache/recovery/", "/data/adb/magisk",
            "/data/adb/ksu", "/data/adb/apatch"
        )
        for (path in rootPaths) {
            if (File(path).exists()) {
                indicators.add("root_path:$path")
                return
            }
        }
    }

    /**
     * Apps de gerenciamento de root. Verifica pela presença do pacote
     * instalado — não funciona contra Magisk com "Magisk Hide" ou
     * Shamiko ativados, que escondem o próprio pacote do gerenciador
     * de pacotes.
     */
    private fun checkRootManagementApps(indicators: MutableList<String>) {
        val context = appContext.reactContext ?: return
        val rootApps = listOf(
            "com.topjohnwu.magisk",       // Magisk
            "eu.chainfire.supersu",        // SuperSU
            "com.koushikdutta.superuser",  // Superuser (CyanogenMod)
            "com.noshufou.android.su",     // Superuser (antigo)
            "me.weishu.kernelsu",          // KernelSU
            "me.bmax.apatch"               // APatch
        )
        for (pkg in rootApps) {
            runCatching {
                context.packageManager.getPackageInfo(pkg, 0)
                indicators.add("root_app:$pkg")
                return
            }
        }
    }

    /**
     * Builds assinados com "test-keys" não passaram pela cadeia de
     * assinatura oficial da OEM/Google, sinal de ROM customizada ou
     * build de desenvolvimento. Não é conclusivo por si só (builds de
     * dev legítimos e ROMs customizadas sem root disparam isso também),
     * mas reforça outras heurísticas.
     */
    private fun checkTestKeys(indicators: MutableList<String>) {
        val tags = Build.TAGS ?: return
        if (tags.contains("test-keys")) {
            indicators.add("test_keys:${tags}")
        }
    }

    /**
     * ro.debuggable = 1 em builds de produção é anormal — indica
     * modificação de sistema ou ROM de debug. Em builds de
     * desenvolvimento do próprio projeto, este campo pode estar em 1
     * legitimamente (e vai disparar um falso positivo). A política
     * padrão "alert" foi escolhida justamente para esse caso.
     */
    private fun checkDebuggable(indicators: MutableList<String>) {
        runCatching {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.debuggable"))
            val value = process.inputStream.bufferedReader().readLine()?.trim()
            if (value == "1") indicators.add("ro_debuggable:true")
        }
    }

    /**
     * /system montado como rw em produção indica que alguém conseguiu
     * modificar partições do sistema — exige root ou bootloader
     * desbloqueado + modificação ativa.
     */
    private fun checkWritableSystem(indicators: MutableList<String>) {
        runCatching {
            val process = Runtime.getRuntime().exec(arrayOf("mount"))
            val output = process.inputStream.bufferedReader().readText()
            // Procura por " /system " na tabela de montagem — o espaço antes
            // e depois evita falsos positivos com /system_ext etc.
            val systemMounts = output.lines().filter { line ->
                line.contains(" /system ") || line.contains(" /system\t")
            }
            if (systemMounts.any { it.contains("rw,") || it.contains(",rw") || it.endsWith(" rw") }) {
                indicators.add("system_rw:true")
            }
        }
    }

    /**
     * Estado do boot verificado — tenta ler via propriedades do sistema.
     * "orange" = bootloader desbloqueado; "yellow" = ROM de terceiro com
     * chave diferente; "red" = DM-Verity falhou.
     * "green" = produção normal (ignora).
     *
     * Disponibilidade: não garantida em todos os fabricantes — alguns
     * não expõem ro.boot.verifiedbootstate. Fallback via
     * ro.boot.flash.locked (disponível em aparelhos Qualcomm com
     * Fastboot).
     */
    private fun checkBootloader(indicators: MutableList<String>) {
        runCatching {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.boot.verifiedbootstate"))
            val state = process.inputStream.bufferedReader().readLine()?.trim() ?: ""
            if (state in listOf("orange", "yellow", "red")) {
                indicators.add("verified_boot:$state")
            }
        }
        runCatching {
            val process = Runtime.getRuntime().exec(arrayOf("getprop", "ro.boot.flash.locked"))
            val locked = process.inputStream.bufferedReader().readLine()?.trim() ?: ""
            if (locked == "0") {
                indicators.add("bootloader_unlocked:true")
            }
        }
    }

    /**
     * Frameworks de hook como Xposed/LSPosed injetam classes no
     * classpath de todos os processos Android — uma detecção aproximada
     * é tentar carregar classes características desses frameworks. Essa
     * checagem é "best-effort": versões modernas do LSPosed com
     * ocultação de módulos não expõem essas classes facilmente. Incluída
     * para cobrir casos sem ocultação ativa.
     */
    private fun checkHookFrameworks(indicators: MutableList<String>) {
        val hookClasses = listOf(
            "de.robv.android.xposed.XposedBridge",
            "de.robv.android.xposed.XposedHelpers",
            "org.lsposed.lspatch.loader.LSPatch"
        )
        for (cls in hookClasses) {
            runCatching {
                Class.forName(cls)
                indicators.add("hook_framework:$cls")
                return
            }
        }
    }
}
