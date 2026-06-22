# Checklist de Auditoria de Segurança — Resenha Local

## Antes de cada build de produção

### Criptografia

- [ ] `src/crypto/dh.ts` — verificar que a checagem all-zero está presente e lança exceção
- [ ] `src/crypto/hkdf.ts` — confirmar que `_unstable_crypto_kdf_hkdf_sha256_extract/expand` ainda existem no binding instalado: `await sodium.ready; console.log(Object.keys(sodium).filter(k => k.includes('hkdf')))`
- [ ] `src/crypto/doubleRatchet.ts` — rodar `node tests/doubleRatchet.test.js` (deve imprimir TODOS OS TESTES PASSARAM)
- [ ] `src/crypto/handshake.ts` — rodar `node tests/handshake.test.js` (deve imprimir TODOS OS TESTES PASSARAM)
- [ ] Confirmar que nenhum material criptográfico (chaves, seeds) aparece em `console.log` em nenhum arquivo de produção
- [ ] Confirmar que nenhum material criptográfico é incluído em mensagens de erro visíveis ao usuário

### Armazenamento

- [ ] Confirmar que `op-sqlite` está compilado com SQLCipher: no banco gerado em dispositivo real, verificar que `sqlite3 resenha-local.db .tables` retorna "file is not a database" (sem a chave correta)
- [ ] Confirmar que `allowBackup: false` está em `app.config.ts`
- [ ] Confirmar que `WHEN_UNLOCKED_THIS_DEVICE_ONLY` está em todas as chamadas de SecureStore
- [ ] Confirmar que `requireAuthentication: true` está apenas na chave privada (não na chave do banco)
- [ ] Confirmar separação: a chave do banco (`DB_KEY_STORAGE_KEY`) é diferente das chaves de identidade

### Transporte

- [ ] Confirmar que nenhum envelope `{ type: 'handshake' }` contém chave privada
- [ ] Confirmar que `conversationId` nunca é derivado do `endpointId` da Nearby Connections
- [ ] Confirmar que `ratchetRepository.saveRatchetState` é chamado após cada `ratchetEncrypt` E após cada `ratchetDecrypt` bem-sucedido

### TOFU

- [ ] Confirmar que `evaluateTrust` é chamado para cada envelope `handshake` recebido
- [ ] Confirmar que `IDENTITY_CHANGED` bloqueia `sendRatchetPayload` via `isBlockedByIdentityChange`
- [ ] Confirmar que `identity_change_log` persiste mesmo após o usuário aceitar/rejeitar a mudança
- [ ] Confirmar que `replaceTrustedIdentity` só é chamada após confirmação explícita do usuário

### Detecção de root

- [ ] Confirmar que `getSecurityStatus()` é chamado em `App.tsx` antes de qualquer operação criptográfica
- [ ] Testar em emulador com root: verificar que pelo menos um indicador é detectado
- [ ] Confirmar que `ACTIVE_POLICY` em `rootPolicy.ts` está definido corretamente para o tipo de build

### Build

- [ ] Confirmar que `eas.json` usa `buildType: "app-bundle"` para produção (não `apk`)
- [ ] Confirmar que ProGuard/R8 está habilitado para builds de produção (ofusca nomes de classe — dificulta engenharia reversa do módulo de detecção de root)
- [ ] Confirmar que o EAS Build está usando uma keystore fixa (não gerada automaticamente a cada build)
- [ ] Confirmar versão exata de `react-native-libsodium` no package.json (sem `^` ou `~`)

## Após cada atualização de dependência

- [ ] Re-executar `await sodium.ready; console.log(Object.keys(sodium))` em dispositivo real e comparar com a lista de funções usadas no código
- [ ] Re-executar os testes de Double Ratchet e handshake
- [ ] Verificar se `_unstable_crypto_kdf_hkdf_sha256_*` continuam presentes
- [ ] Verificar se `crypto_box_keypair`, `crypto_box_easy`, `crypto_box_open_easy`, `crypto_aead_xchacha20poly1305_ietf_*`, `crypto_generichash`, `randombytes_buf`, `to_hex`, `to_string` continuam presentes

## Recomendações para builds de produção

1. **ProGuard/R8 obrigatório** — em especial para os módulos nativos e o código de detecção de root.
2. **Certificate pinning desnecessário** — o app não usa TLS de propósito (sem servidor), então não há certificado para fixar.
3. **Versão do SDK target** — sempre seguir o mínimo exigido pela Play Store no momento do lançamento (`targetSdkVersion`).
4. **Debug disabled** — confirmar que `Build.TAGS` não contém "test-keys" no APK de produção.
5. **Network security config** — considerar adicionar um `res/xml/network_security_config.xml` que bloqueie todo tráfego em cleartext, como defesa em profundidade contra dependências que façam HTTP inadvertidamente.
6. **Fixar versão do binding libsodium** — remoção da API `_unstable_*` numa atualização silenciosa quebraria HKDF sem erro óbvio; a verificação em tempo de build ou inicialização é o caminho correto.

## Recomendações operacionais (manutenção futura)

- Roteio de relatórios de crash (ex.: Sentry) deve ser configurado em modo local apenas, sem upload automático de stack traces que possam conter informações de sessão.
- O `identity_change_log` não tem limpeza automática — considerar uma política de expiração (ex.: apagar entradas com `resolution != 'pending'` e `detected_at` > 90 dias).
- Rotação periódica da chave do banco (via `PRAGMA rekey`) pode ser oferecida como opção nas configurações para usuários que querem garantia adicional.
