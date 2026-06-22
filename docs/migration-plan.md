# Plano de Migração — v0.1 para v0.2

## Resumo das mudanças

v0.2 introduz Double Ratchet, TOFU, handshake X3DH e detecção de root. O esquema do banco mudou (v1 → v2). O protocolo de fio mudou (envelopes 'message'/'typing' → envelope único 'ratchet').

## O que acontece quando um usuário v0.1 atualiza para v0.2

### Banco de dados

O sistema de migração em `database.ts` usa `PRAGMA user_version`. Na primeira abertura após a atualização:

1. `user_version` lido = 1 (v0.1)
2. `runMigrationV2()` executa:
   - Cria tabelas novas (identities, identity_change_log, ratchet_sessions, skipped_message_keys)
   - Renomeia `messages.ciphertext` para `messages.content` via `ALTER TABLE RENAME COLUMN`
3. `user_version` gravado = 2

**Dados preservados:** histórico de mensagens (renomeado, não apagado), contatos, perfil, grupos.

**Dados perdidos:** nenhum. As mensagens antigas ficam como `content` (já eram armazenadas decifradas desde v0.1 — a coluna se chamava `ciphertext` mas continha o texto em claro por conta do design anterior).

### Sessões de ratchet

Não existem sessões v0.1 salvas (o ratchet não existia). Na primeira reconexão com cada contato, o handshake X3DH é feito do zero — o contato verá a identidade do usuário como "nova" se a chave de identidade se manteve (TRUST_KNOWN), ou como "mudada" se o usuário limpou os dados (TRUST_NEW).

### Compatibilidade de protocolo entre versões

**v0.1 e v0.2 não são compatíveis.** Um aparelho v0.2 enviando um envelope `{ type: 'ratchet', ... }` para um aparelho v0.1 vai causar uma falha silenciosa no v0.1 (o tipo de envelope é desconhecido). Um aparelho v0.2 recebendo um envelope `{ type: 'message', ... }` de um v0.1 vai ignorá-lo (não é o tipo 'ratchet').

**Recomendação de lançamento:** publicar v0.2 como atualização obrigatória na Play Store (definir `minUpdateVersionCode` = 2 no Play Console) para garantir que todos os usuários estejam na mesma versão antes de conversar. Como a base de usuários no lançamento é pequena, uma janela de migração de 48h com notificação in-app deve ser suficiente.

## Estratégia sem perda de dados

1. Build de produção v0.2 submetida na faixa interna da Play Store.
2. Testes de atualização: instalar v0.1 → atualizar para v0.2 → verificar que histórico, perfil e contatos sobrevivem.
3. Rollout gradual: 10% → 50% → 100% ao longo de 3 dias.
4. Durante o rollout, monitorar crashes relacionados a `PRAGMA user_version` e `ALTER TABLE RENAME COLUMN`.

## Rotação da chave do banco (futuro)

SQLCipher suporta `PRAGMA rekey = 'novaChave'` para rotação da chave de cifragem sem re-exportar o banco. O fluxo:
1. Gerar nova chave de banco via `loadOrCreateDatabaseKey` (versão 2 — com sufixo na chave do SecureStore).
2. Executar `PRAGMA rekey` com a nova chave.
3. Atualizar o SecureStore para apontar para a nova chave.
4. Apagar a chave antiga do SecureStore.

Isso pode ser feito transparentemente, sem fechar o banco ou perder dados.
