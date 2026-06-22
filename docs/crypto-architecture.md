# Arquitetura Criptográfica — Resenha Local

## 1. Visão geral em camadas

```
┌─────────────────────────────────────────────────────────────┐
│  CAMADA 3 — Double Ratchet (em memória, por sessão)         │
│  Garante PFS por mensagem + recuperação pós-comprometimento │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 2 — Handshake X3DH efêmero (uma vez por sessão)     │
│  Estabelece a Root Key inicial com PFS desde o início       │
├─────────────────────────────────────────────────────────────┤
│  CAMADA 1 — Identidade + TOFU (persiste entre sessões)      │
│  Autentica os participantes sem servidor de diretório       │
└─────────────────────────────────────────────────────────────┘
           │                    │
           ▼                    ▼
  SQLCipher (banco)     Android Keystore (chaves)
  Protege em repouso    Hardware-backed, não migrável
```

## 2. Identidade e TOFU

Geração em keys.ts: crypto_box_keypair() → par X25519. Chave pública no SecureStore sem biometria; chave privada com requireAuthentication:true. Em aparelhos com Keystore hardware-backed (TEE), a chave de proteção nunca sai do hardware.

Decisão TOFU em trust.ts:

```
Contato anuncia (username, publicKey)
  ├─ Nunca vi esse username → TRUST_NEW (confia, salva)
  ├─ Mesma publicKey → TRUST_KNOWN (atualiza lastSeenAt)
  └─ PublicKey diferente → IDENTITY_CHANGED
       ├─ Bloqueia envio imediatamente
       ├─ Loga no identity_change_log
       └─ Aguarda confirmação explícita do usuário
```

## 3. Handshake X3DH adaptado para P2P síncrono

```
A                                    B
│── { IK_A, EK_A, username_A } ────►│
│◄─ { IK_B, EK_B, username_B } ─────│
│                                    │
DH1 = DH(IK_A.priv, EK_B.pub)  =  DH(EK_B.priv, IK_A.pub)
DH2 = DH(EK_A.priv, IK_B.pub)  =  DH(IK_B.priv, EK_A.pub)
DH3 = DH(EK_A.priv, EK_B.pub)  =  DH(EK_B.priv, EK_A.pub)
SK = HKDF(DH1‖DH2‖DH3, "resenha-local:x3dh-root", 32)
```

DH1/DH2 autenticam mutuamente; DH3 (efêmera+efêmera) garante PFS. Papel iniciador/respondedor determinado por comparação lexicográfica de IK — determinístico, sem negociação.

## 4. Double Ratchet

Estado por conversa: dhSelf, dhRemote, rootKey, sendChainKey, recvChainKey, sendN, recvN, PN, skippedKeys.

Passo de DH Ratchet (ao receber nova chave DH remota):
```
(rootKey', recvChain) = KDF_RK(rootKey, DH(dhSelf.priv, dhRemote_novo))
dhSelf = novo par DH gerado agora
(rootKey'', sendChain) = KDF_RK(rootKey', DH(dhSelf_novo.priv, dhRemote_novo))
```

Passo de Symmetric Ratchet (a cada mensagem):
```
nextChainKey = HKDF-expand(chainKey, "chain",   32)
messageKey   = HKDF-expand(chainKey, "message", 32)
← messageKey usada uma vez e descartada imediatamente →
```

Cifragem: XChaCha20-Poly1305(messageKey, nonce_aleatório_24B, plaintext, aad=header).

Mensagens fora de ordem: skippedKeys[base64(dhPub):N] → messageKey, cap 100, eviction FIFO, max 1000 saltos por cadeia.

## 5. Por que o histórico não usa chaves do ratchet

Message keys são descartadas após uso (PFS). Histórico guardado como content (texto já decifrado) protegido pelo SQLCipher. Comprometer ratchet não expõe histórico; comprometer banco não expõe ratchet.

## 6. Separação de chaves

```
Keystore hardware: chave pública (sem auth) + chave privada (biometria)
Keystore (derivado): chave do banco SQLCipher (sem biometria)
Memória (sessão): IdentityKeyPair + RatchetState + EphemeralKeyPairs
```

Cada camada tem propósito, ciclo de vida e proteção distintos — comprometer uma não compromete automaticamente as outras.

## 7. Construção não padronizada de DH

crypto_scalarmult e crypto_box_beforenm ausentes neste binding. Solução em dh.ts: crypto_box_easy(zeros32, zeros24, pk, sk)[0:32] ≡ crypto_box_beforenm(pk, sk). Matematicamente correto (mesmas operações internas), mas não é uma primitiva pública padronizada. Substituir por crypto_scalarmult quando o binding passar a expô-la.
