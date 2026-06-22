# Modelo de Ameaças — Resenha Local

## Premissas do modelo

- Comunicação totalmente P2P local — não existe servidor, nuvem ou infraestrutura operada pelo desenvolvedor.
- O adversário pode estar fisicamente presente no mesmo espaço que os usuários.
- O app não oferece anonimato de identidade real — só privacidade de conteúdo e ausência de coleta.

---

## Cenário 1: MITM no primeiro contato

**Descrição:** Um atacante intercala os handshakes de A e B, apresentando-se como cada um para o outro. Possível porque TOFU não verifica a identidade antes da primeira conexão.

**Impacto:** Todas as mensagens da sessão ficam expostas ao atacante enquanto o MITM persiste.

**Probabilidade:** Baixa — exige presença física, equipamento especializado e timing preciso durante o processo de conexão Nearby.

**Mitigação implementada:** Safety Number (computeSafetyNumber) disponível para verificação manual. TOFU fixa a identidade após o primeiro contato — um MITM continuado seria detectado na reconexão futura.

**Limitação:** A verificação do Safety Number não é obrigatória — depende do usuário iniciá-la voluntariamente.

**Risco residual aceito:** Conscientemente aceito em favor de simplicidade. Um app que exigisse verificação de chave antes de cada primeira conversa teria adoção próxima de zero no público-alvo.

---

## Cenário 2: Comprometimento posterior do dispositivo

**Descrição:** O aparelho de um dos participantes é comprometido por malware depois que conversas já ocorreram.

**Impacto:** Conteúdo das conversas visível no banco (protegido pelo SQLCipher, mas a chave do banco está no Keystore do mesmo aparelho). Estado do ratchet exposto — mas PFS garante que mensagens anteriores ao comprometimento não são retroativamente decifráveis com as chaves em memória no momento do ataque.

**Probabilidade:** Baixa a média — depende do vetor de ataque inicial (app malicioso, exploit de SO, etc.).

**Mitigação implementada:** SQLCipher cifra o banco; Keystore hardware-backed protege as chaves; detecção de root avisa antes de operar; `allowBackup: false` impede cópias automáticas.

**Limitação:** Acesso físico ao aparelho desbloqueado, ou malware com privilégios de root, pode ler o banco e o Keystore.

**Risco residual:** Médio — mitigado mas não eliminável sem hardware dedicado (smartcard).

---

## Cenário 3: Roubo do banco local

**Descrição:** O arquivo `resenha-local.db` é copiado de um aparelho (via backup, ADB, ou acesso físico com aparelho desbloqueado).

**Impacto:** Histórico de mensagens exposto se a chave do banco for obtida junto com o arquivo.

**Probabilidade:** Baixa em aparelhos normais; média em aparelhos rootados.

**Mitigação:** SQLCipher com chave no Keystore; `allowBackup: false`; `WHEN_UNLOCKED_THIS_DEVICE_ONLY` impede leitura com aparelho bloqueado.

**Limitação:** Aparelho desbloqueado + root = chave e banco acessíveis simultaneamente.

**Risco residual:** Baixo com aparelho bloqueado; alto com root ativo.

---

## Cenário 4: Malware com privilégios elevados

**Descrição:** Processo malicioso no aparelho com permissões de root ou capacidade de injetar código no processo do app.

**Impacto:** Acesso completo a tudo que o app vê: banco, chaves em memória, payloads antes da cifragem.

**Probabilidade:** Baixa — exige comprometimento profundo do SO.

**Mitigação:** Detecção de root (módulo Kotlin); Keystore hardware-backed (chaves não exportáveis mesmo com root em alguns aparelhos com TEE).

**Limitação:** Magisk Hide / Shamiko contornam a detecção de root. Em aparelhos sem TEE, root = acesso total ao Keystore.

**Risco residual:** Alto em aparelhos rootados sem TEE; baixo em aparelhos modernos com Keystore hardware-backed.

---

## Cenário 5: Root / bootloader desbloqueado

**Descrição:** O aparelho do usuário foi deliberadamente rootado ou tem o bootloader desbloqueado.

**Impacto:** Ver cenário 4. Adicional: possibilidade de modificação do próprio app (injeção de código).

**Mitigação:** Detecção de root com política configurável (alert/restricted/locked); aviso claro na UI; `allowBackup: false`.

**Limitação:** Usuário pode ignorar o aviso (política 'alert'). Detecção contornável com ferramentas de ocultação.

**Risco residual:** Aceito na política 'alert' — o usuário que deliberadamente rootou o aparelho tem conhecimento técnico para entender as implicações.

---

## Cenário 6: Comprometimento temporário das chaves de sessão

**Descrição:** Um message key ou chain key é obtido por um atacante em algum momento da sessão.

**Impacto:** Exposição apenas das mensagens cobertas por aquela chave específica (uma mensagem para message key; mensagens futuras até o próximo passo de DH ratchet para chain key).

**Mitigação:** Double Ratchet com descarte imediato de message keys após uso; PFS por mensagem; recuperação automática após cada passo de DH ratchet (Post-Compromise Security).

**Limitação:** Janela de exposição de chain key = mensagens até o próximo passo de DH ratchet (disparado pela próxima mensagem do outro lado).

**Risco residual:** Baixo — limitado a uma janela muito pequena de mensagens.

---

## Cenário 7: Ataques de replay

**Descrição:** Atacante captura um pacote cifrado e o reenvia posteriormente.

**Impacto:** Sem o Double Ratchet, poderia causar confusão ou processamento duplicado.

**Mitigação:** O Double Ratchet usa nonces aleatórios por mensagem E numera sequencialmente cada mensagem — uma mensagem com número N já visto é verificada contra `skippedKeys` e descartada se não encontrada; uma mensagem com número N < recvN é descartada automaticamente.

**Risco residual:** Mínimo — o ratchet torna replay ineficaz por construção.

---

## Cenário 8: Mensagens fora de ordem

**Descrição:** Mensagens chegam em ordem diferente da enviada (normal em redes sem garantia de ordem, incluindo Bluetooth).

**Impacto:** Sem tratamento, mensagens fora de ordem seriam descartadas.

**Mitigação:** Skipped message keys: o ratchet avança a cadeia até o número esperado, guardando as chaves intermediárias (cap: 100) para uso quando as mensagens atrasadas chegarem.

**Limitação:** Cap de 100 entradas por conversa. Mensagens que chegarem depois do FIFO eviction são permanentemente irrecuperáveis.

**Risco residual:** Baixo — no contexto P2P local (Bluetooth/Wi-Fi Direct), mensagens raramente chegam tão fora de ordem.

---

## Cenário 9: Troca silenciosa de identidade

**Descrição:** Um terceiro se apresenta com o nome de usuário de um contato conhecido, mas com uma chave de identidade diferente.

**Impacto:** Sem TOFU, o terceiro seria aceito como o contato legítimo e poderia ler/enviar mensagens em seu nome.

**Mitigação:** TOFU detecta a divergência de chave, bloqueia envio imediatamente, alerta o usuário com os dois fingerprints, exige confirmação explícita antes de continuar. A mudança fica registrada no `identity_change_log` permanentemente.

**Limitação:** Um atacante presente na primeira conexão (MITM no primeiro contato, cenário 1) ainda pode estabelecer uma identidade falsa que passa pelo TOFU nas reconexões seguintes.

**Risco residual:** Baixo após o primeiro contato; residual no primeiro contato (ver cenário 1).

---

## Cenário 10: Perda do dispositivo

**Descrição:** O aparelho é perdido ou roubado com o conteúdo intacto.

**Impacto:** Acesso a conversas se o aparelho estiver desbloqueado ou se a biometria for contornada.

**Mitigação:** SQLCipher requer chave do Keystore; Keystore com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`; biometria/PIN para chave privada; mensagens efêmeras reduzem o histórico disponível.

**Limitação:** Aparelho desbloqueado no momento do roubo = banco acessível (mas não as chaves privadas sem biometria adicional).

**Risco residual:** Baixo com aparelho bloqueado (padrão); médio com aparelho desbloqueado.

---

## Cenário 11: Reinstalação do aplicativo

**Descrição:** O usuário desinstala e reinstala o app no mesmo aparelho.

**Impacto:** Nova chave de identidade gerada → todos os contatos que conheciam a identidade antiga vão ver "IDENTITY_CHANGED" na próxima conexão.

**Mitigação:** O app não tenta preservar identidade entre reinstalações (não há servidor de recuperação). Os contatos são protegidos pelo TOFU — vão receber o alerta de mudança de identidade antes de continuar conversando.

**Tratamento seguro:** O fluxo de IDENTITY_CHANGED foi projetado explicitamente para cobrir esse caso legítimo — o usuário do outro lado vê o aviso, verifica com a pessoa por outro canal se necessário, e aceita a nova identidade consciente disso.

**Risco residual:** Mínimo — o protocolo trata isso como uma troca legítima de identidade, com o mesmo fluxo de qualquer outra.

---

## Cenário 12: Troca legítima de aparelho

**Descrição:** O usuário compra um aparelho novo e instala o app nele.

**Impacto:** Mesma situação da reinstalação — nova chave de identidade gerada.

**Mitigação:** Mesma do cenário 11. Adicionalmente: como não existe histórico portável (por design — sem backup automático), o usuário começa com um histórico limpo no aparelho novo, o que na maioria dos cenários de privacidade é preferível.

**Risco residual:** Mínimo.

---

## Cenário 13: Chave pública de baixa ordem (ataque de subgrupo)

**Descrição:** Um atacante envia uma chave pública fabricada em um subgrupo de baixa ordem da curva X25519, forçando o DH a produzir um segredo previsível.

**Impacto:** Potencial comprometimento da sessão estabelecida com essa chave.

**Mitigação:** A função `rawDiffieHellman` em dh.ts verifica se o output é all-zeros (o caso mais óbvio de chave degenerada) e lança uma exceção. A verificação completa de subgrupo exigiria `crypto_scalarmult` puro — indisponível neste binding.

**Limitação:** A checagem all-zero não cobre todos os casos de subgrupo pequeno possíveis em X25519. Isso é uma limitação da construção de DH via crypto_box_easy (ver crypto-architecture.md).

**Risco residual:** Baixo para alvos oportunistas; mitigação incompleta para atacantes sofisticados com conhecimento da limitação do binding.
