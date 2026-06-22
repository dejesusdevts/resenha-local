# Resenha Local

Bate-papo local por proximidade. Sem login, sem servidor, sem internet — as mensagens trafegam direto entre os celulares, cifradas de ponta a ponta com Bluetooth/Wi-Fi via **Nearby Connections API** do Google.

Este repositório é o esqueleto funcional do app descrito no documento de planejamento (`resenha-local-planejamento.md`, gerado anteriormente). Ele já traz a arquitetura completa — módulo nativo, criptografia, armazenamento, estado e telas — pronta para ser refinada, testada em aparelhos reais e publicada.

## Por que development build (e não Expo Go)

O app usa a Nearby Connections API do Google, que não tem suporte no Expo Go porque exige código nativo Android compilado junto ao binário. Por isso, o projeto inclui um **módulo nativo local** (`modules/nearby-transport`) e precisa rodar sempre via **development build** (`expo-dev-client` + EAS Build), nunca pelo app Expo Go da loja.

## Pré-requisitos

- Node.js LTS e npm
- Conta Expo/EAS (`npx eas login`)
- Android Studio com SDK/NDK instalados, **ou** usar o build na nuvem do EAS (recomendado se você não quer configurar o ambiente Android localmente)
- Dois aparelhos Android físicos para testar a comunicação por proximidade — **emulador não enxerga outro emulador via Bluetooth/Nearby**, então esse teste exige hardware real

## Primeiros passos

```bash
npm install

# Reconcilia as versões das dependências nativas com a versão do Expo SDK
# instalada (importante: os números de versão no package.json são um ponto
# de partida, não a palavra final — deixe o Expo resolver as versões certas).
npx expo install --check

# Gera o projeto nativo Android localmente (opcional, só se for buildar local)
npx expo prebuild

# Login e configuração do projeto no EAS
npx eas login
npx eas init
```

Depois, gere e instale um development build no celular:

```bash
npm run build:dev
# baixe o .apk gerado pelo EAS e instale no aparelho via adb install ou o QR code do próprio EAS

npm start
# abre o Metro bundler; o app instalado no aparelho conecta nele
```

Repita a instalação do development build em **dois aparelhos** para conseguir testar a descoberta e a troca de mensagens de verdade.

## Estrutura do projeto

```
resenha-local/
├── App.tsx                      # inicialização: sodium, banco cifrado, navegação
├── app.config.ts                 # config Expo (permissões Android, ícones, EAS)
├── eas.json                      # perfis de build (development/preview/production)
│
├── modules/nearby-transport/     # módulo nativo: wrapper da Nearby Connections API
│   ├── index.ts                   # interface TypeScript exposta ao app
│   └── android/.../NearbyTransportModule.kt   # implementação Kotlin (Expo Modules API)
│
└── src/
    ├── crypto/                   # identidade, handshake (X25519), cifragem (XChaCha20-Poly1305)
    ├── storage/                  # SQLite cifrado + repositórios (perfil, contatos, mensagens, grupos)
    ├── state/                    # stores Zustand (perfil, dispositivos próximos, mensagens)
    ├── transport/                # orquestra módulo nativo + criptografia + armazenamento
    ├── navigation/                # React Navigation
    ├── screens/                   # Onboarding, Radar, Chat, Configurações
    └── utils/permissions.ts       # solicitação de permissões Android em runtime
```

## Como as peças se conectam

1. **Onboarding** gera a identidade criptográfica do aparelho (par de chaves X25519 via libsodium, guardado no Android Keystore) e salva o perfil local — nada disso sai do aparelho.
2. **Radar** pede as permissões necessárias e inicia `NearbyTransportService`, que por sua vez chama o módulo nativo para anunciar (`startAdvertising`) e descobrir (`startDiscovery`) outros aparelhos rodando o app.
3. Ao encontrar alguém, o app solicita conexão automaticamente. Assim que a conexão é aceita nos dois lados, os aparelhos trocam suas chaves públicas (handshake) e derivam uma chave de sessão compartilhada — **sem transmitir nenhum segredo pela rede**.
4. Toda mensagem digitada no **Chat** é cifrada com essa chave de sessão antes de ser enviada pelo módulo nativo, e persistida já cifrada no SQLite local.

O diagrama de arquitetura completo está no documento de planejamento gerado anteriormente.

## Segurança — o que já está implementado vs. o que é roadmap

Implementado neste scaffold:
- Identidade por dispositivo (X25519, via `crypto_box_keypair`), sem conta nem verificação externa
- Handshake automático de chaves ao conectar com um novo contato
- Cifragem ponta a ponta com `crypto_box_easy`/`crypto_box_open_easy` (NaCl box: ECDH em X25519 + cifragem autenticada em uma única chamada), usando a chave de identidade do remetente e a chave pública do destinatário diretamente — sem uma etapa separada de "chave de sessão", porque a versão instalada de `react-native-libsodium` não expõe `crypto_kx_*` nem `crypto_box_beforenm` (confirme o conjunto de funções disponível na sua versão com `Object.keys(sodium)` após `await sodium.ready`, caso troque de versão da biblioteca)
- Banco de dados local cifrado em repouso (SQLCipher via op-sqlite)
- Função de "impressão digital de segurança" (`crypto/fingerprint.ts`) pronta para uso, mas ainda **não exposta em nenhuma tela** — adicionar um botão "verificar contato" na tela de chat é o próximo passo natural de segurança

Deixado como roadmap (ver documento de planejamento, seção 3 e 10):
- Forward secrecy completo (double ratchet) — a versão atual usa uma chave de sessão estável por conversa
- Grupos com "sender keys" (hoje, grupo seria fan-out pareado simples)
- Rede mesh multi-salto para estender o alcance além da conexão direta
- Compartilhamento de mídia

## Limitações conhecidas deste scaffold

Este código foi escrito como referência de arquitetura completa e **não foi compilado/testado em dispositivo real** neste ambiente (sem acesso a build Android aqui). Antes de ir para produção:

- Rode `npx expo install --check` para alinhar as versões exatas das dependências nativas com a versão do Expo SDK que você instalar — os números no `package.json` são um ponto de partida.
- Compile o módulo nativo (`npx expo run:android` ou um build de development no EAS) e corrija eventuais ajustes de Gradle/Kotlin — é o tipo de coisa que só aparece ao compilar de verdade.
- Teste a permissão de Bluetooth em pelo menos um aparelho Android ≤ 11 e um ≥ 12, já que o fluxo de permissões muda bastante entre essas versões.
- Adicione os assets visuais em `assets/` (ver `assets/README.txt`) antes do primeiro build.
- Telas de "criar grupo" e "verificar contato" têm a lógica de base pronta (repositório de grupos, função de fingerprint) mas ainda não têm uma tela própria — só o fluxo 1:1 está com UI completa.

## Comandos úteis

```bash
npm run typecheck       # checagem de tipos TypeScript
npm run build:dev        # build de development (EAS, instalável com expo-dev-client)
npm run build:preview     # build de preview/teste interno (apk)
npm run build:production  # build de produção (app bundle, para a Play Store)
npm run submit:production # envia o build de produção para a faixa interna da Play Store
```

## Problemas comuns

**Conexão e handshake funcionam, mas nenhuma mensagem chega do outro lado.** Esse foi um bug estrutural do design original: o `endpointId` da Nearby Connections é **local a cada aparelho** — o valor que A usa para identificar "minha conexão com B" não é garantido ser o mesmo que B usa para "minha conexão com A". O app inicialmente usava esse `endpointId` como `conversationId`, então uma mensagem recebida ficava salva sob o ID que o *remetente* usava, enquanto a tela de chat do destinatário procurava pelo ID que *ele próprio* usa para a mesma conversa — nunca batiam, e a mensagem ficava "engavetada" sem erro nenhum. Corrigido: `conversationId` agora é derivado das duas chaves públicas dos participantes (`computeConversationId` em `src/crypto/fingerprint.ts`), de forma determinística — os dois aparelhos chegam ao mesmo valor de forma independente, sem precisar negociar nada pela rede. `NearbyTransportService.sendMessage` não recebe mais `conversationId` como argumento (ele mesmo calcula); a UI usa `NearbyTransportService.getConversationId(endpointId)` para saber sob qual ID ler as mensagens de uma conversa.

**Erro `MISSING_PERMISSION_ACCESS_WIFI_STATE` (ou qualquer `MISSING_PERMISSION_*`) ao iniciar.** A Nearby Connections usa Wi-Fi internamente mesmo sem conexão à internet, e exige `ACCESS_WIFI_STATE`/`CHANGE_WIFI_STATE` declaradas no manifesto, além das permissões de Bluetooth. Essas já estão no `AndroidManifest.xml` do módulo neste projeto — mas **qualquer alteração de permissão exige gerar um novo development build**: rode `npx expo prebuild --clean` e depois um novo `npm run build:dev` (ou `npx expo run:android` localmente). Só recarregar o JavaScript (Fast Refresh / reload do Metro) não é suficiente, porque permissões ficam compiladas dentro do `.apk`.

**`crypto_kx_keypair`, `crypto_box_beforenm` ou `from_string` "is not a function".** Bindings de libsodium para React Native variam bastante em quais funções expõem — nem todo build implementa a família `crypto_kx_*`, `crypto_box_beforenm` ou `from_string`. Este projeto já foi ajustado para usar só funções confirmadas presentes em teste real (`crypto_box_keypair` + `crypto_box_easy`/`open_easy` para a cifragem ponta a ponta, com um encoder UTF-8 próprio em `src/crypto/encoding.ts` no lugar de `from_string`). Se aparecer outro erro parecido em alguma outra função, rode `await sodium.ready; console.log(Object.keys(sodium))` no dispositivo e ajuste a chamada correspondente para a função equivalente disponível nessa lista.

**`from_base64 failed` ao processar payload recebido.** O Android (`Base64.encodeToString(bytes, Base64.NO_WRAP)`, em `NearbyTransportModule.kt`) usa o alfabeto **padrão** de base64 (com `+`, `/` e padding `=`), enquanto `sodium.to_base64`/`sodium.from_base64` usam variantes próprias da biblioteca que não corresponderam de forma confiável nos testes (nem mesmo fixando `base64_variants.ORIGINAL` explicitamente — sinal de que essa constante não existe com esse nome/valor neste binding específico). A correção definitiva foi parar de depender da implementação de base64 do `sodium` inteiramente: `toBase64`/`fromBase64` em `src/crypto/encoding.ts` agora são uma implementação própria, em JS puro, seguindo à risca o RFC 4648 (o mesmo padrão que o Android usa por padrão) — eliminando essa categoria de incompatibilidade de uma vez. Não usar `sodium.to_base64`/`sodium.from_base64` em nenhum outro lugar do código — sempre importar os wrappers desse arquivo.

**App não encontra o outro aparelho.** Depois de garantir que não há nenhum erro de `MISSING_PERMISSION_*` no console (ver item acima), confirme que o Bluetooth e o Wi-Fi estão ligados nos dois aparelhos (a Nearby Connections usa os dois), que as permissões de runtime foram concedidas (veja em Ajustes do Android > Apps > Resenha Local > Permissões) e que nenhum dos dois está com economia de bateria agressiva ativada para o app.

**Conexão cai sozinha em segundo plano.** Verifique se o foreground service (`NearbyDiscoveryService`) está rodando — deve aparecer uma notificação persistente "Buscando pessoas por perto". Em alguns fabricantes (Xiaomi, Samsung), é preciso desativar manualmente a otimização de bateria para o app.

**Erro de build relacionado a `expo-modules-core` no Gradle do módulo.** Confirme que rodou `npx expo prebuild` (ou que o EAS Build está fazendo isso automaticamente) antes de tentar compilar — o `android/build.gradle` do módulo depende da estrutura gerada pelo prebuild.

## Próximos passos sugeridos

1. Compilar e testar o fluxo de descoberta + handshake em dois aparelhos reais.
2. Adicionar a tela de verificação de impressão digital de segurança (a lógica já existe em `crypto/fingerprint.ts`).
3. Implementar a tela de criação de grupos reaproveitando `groupsRepository.ts`.
4. Preencher os assets visuais e seguir o checklist em `play-store/release-checklist.md` para publicar.
