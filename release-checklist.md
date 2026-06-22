# Checklist de lançamento — Play Store

## Antes do primeiro build de produção

- [ ] Assets visuais prontos: ícone (1024×1024), ícone adaptável, splash screen (ver `assets/README.txt`)
- [ ] `app.config.ts` revisado: nome final, `package` Android definitivo (`com.resenhalocal.app` é só um ponto de partida — confirme que está disponível e é o que você quer usar permanentemente, porque trocar depois de publicado é praticamente impossível)
- [ ] `versionCode` e `version` corretos para o primeiro envio
- [ ] Projeto compilado e testado em pelo menos dois aparelhos Android físicos diferentes (descoberta, conexão, troca de mensagens)
- [ ] Testado em pelo menos um aparelho com Android ≤ 11 e um com Android ≥ 12 (o fluxo de permissões de Bluetooth muda bastante entre essas versões)
- [ ] Bateria: testado um ciclo de uso prolongado (15–20 min com descoberta ativa) para verificar consumo razoável

## Conta e configuração no Play Console

- [ ] Conta de desenvolvedor Google Play criada (taxa única de cadastro)
- [ ] App criado no Play Console, com nome e pacote definidos
- [ ] Ficha da loja preenchida (usar `play-store/store-listing.md` como base)
- [ ] Política de privacidade publicada em uma URL pública e vinculada no Console (usar `play-store/privacy-policy.md` como base)
- [ ] Formulário de Segurança dos dados preenchido (usar `play-store/data-safety-form.md` como guia)
- [ ] Questionário de classificação de conteúdo respondido (apps de chat sem conteúdo gerado moderado costumam precisar declarar a possibilidade de interação entre usuários — responda com atenção às perguntas sobre comunicação entre usuários e compartilhamento de localização)
- [ ] Declaração de uso de permissões sensíveis (Bluetooth/localização) preenchida, se solicitada pelo Console
- [ ] Público-alvo e conteúdo voltado a crianças: declarar que o app **não** é direcionado a crianças, dado o uso de comunicação entre desconhecidos por proximidade

## Build e assinatura

- [ ] `eas build --profile production --platform android` executado com sucesso
- [ ] Assinatura do app gerenciada pelo EAS (recomendado) ou keystore própria configurada e **guardada em local seguro com backup** — perder a chave de assinatura impede atualizações futuras do app
- [ ] Build de produção (`.aab`) testado via faixa de teste interno antes de qualquer lançamento público

## Faixas de lançamento (recomendado, nessa ordem)

- [ ] **Teste interno**: equipe e poucos testadores de confiança, feedback rápido
- [ ] **Teste fechado**: grupo maior, idealmente incluindo pessoas que vão de fato testar o cenário de uso em proximidade (evento, sala de aula etc.)
- [ ] **Produção**: lançamento público, idealmente com rollout gradual (porcentagem dos usuários) em vez de 100% de uma vez

## Pós-lançamento

- [ ] Monitorar a seção de "Estatísticas de falhas" do Play Console nos primeiros dias
- [ ] Ter um canal de e-mail/suporte ativo e monitorado (o mesmo declarado na ficha da loja)
- [ ] Planejar a primeira atualização incremental já com os itens do roadmap de segurança (verificação de impressão digital exposta na UI, grupos com sender keys) — ver seção 3 e 9 do documento de planejamento original
