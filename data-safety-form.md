# Guia de respostas — "Segurança dos dados" (Play Console)

A seção **Segurança dos dados** do Play Console é um questionário obrigatório, e respondê-lo incorretamente é uma causa comum de rejeição/suspensão de apps. Este documento é um guia de como responder a cada bloco para o Resenha Local, com a justificativa de cada resposta — confirme cada item diretamente no Console no momento da submissão, já que a Google ajusta o formulário periodicamente.

## Pergunta inicial: "Seu app coleta ou compartilha algum dos tipos de dados do usuário exigidos?"

**Resposta: Não.**

Justificativa: o app não tem servidor, não envia nenhuma informação para fora do aparelho do usuário (exceto o conteúdo cifrado das mensagens, que vai diretamente para o destinatário escolhido pelo próprio usuário, nunca para o desenvolvedor ou qualquer terceiro), e não integra nenhum SDK de analytics ou publicidade.

Se o Console insistir em detalhar categoria por categoria mesmo após essa resposta, use o guia abaixo.

## Categorias de dados — guia categoria por categoria

| Categoria | Coletado? | Compartilhado? | Observação |
|---|---|---|---|
| Localização | Não | Não | A permissão de localização é solicitada apenas porque o Android exige isso para varredura Bluetooth em versões mais antigas do sistema — o app nunca lê, processa ou armazena coordenadas geográficas. |
| Informações pessoais (nome, e-mail, etc.) | Não | Não | O nome de usuário é definido livremente pela pessoa e fica salvo apenas localmente; não há e-mail, telefone ou qualquer identificador real coletado. |
| Mensagens | Não* | Não | *As mensagens existem, mas nunca chegam ao desenvolvedor — ficam cifradas no aparelho do usuário e são transmitidas diretamente (P2P) ao destinatário escolhido por ele. Avalie com cuidado se o Console exige declarar isso mesmo sem o desenvolvedor ter acesso; em geral, "coleta" no contexto da Play Store se refere a dados que chegam ao desenvolvedor/servidor, o que não é o caso aqui. |
| Fotos e vídeos | Não | Não | Avatar de perfil (se implementado) fica salvo localmente, nunca enviado a servidor algum. |
| Identificadores de dispositivo | Não | Não | Nenhum identificador único de hardware é coletado ou transmitido pelo app. |
| Dados de uso do app / analytics | Não | Não | Não há nenhum SDK de analytics integrado. |

## Práticas de segurança a declarar

- "Os dados são criptografados em trânsito": **Sim** — todo conteúdo de mensagem é cifrado de ponta a ponta antes de sair do aparelho.
- "Os usuários podem solicitar a exclusão dos dados": **Sim** — a função "Apagar todos os dados locais" nas Configurações do app remove tudo instantaneamente, já que os dados nunca saem do aparelho.
- "Segue a Família de Políticas de Dados do Usuário do Google Play": confirmar como **Sim** após revisão final, já que o app não coleta dados.

## Declaração de permissões sensíveis

Apps que solicitam `ACCESS_FINE_LOCATION` precisam, em alguns casos, preencher uma declaração adicional de uso de permissão de localização em segundo plano/sensível, justificando o uso. Use como base o texto:

```
O app solicita permissão de localização exclusivamente porque o sistema
Android exige essa permissão para realizar varredura de dispositivos
Bluetooth próximos em versões anteriores ao Android 12. O app não acessa,
processa, armazena ou transmite coordenadas geográficas em nenhum momento.
Em Android 12+, o app usa as permissões BLUETOOTH_SCAN/ADVERTISE/CONNECT
com a flag neverForLocation, que formalmente dispensa o uso de localização.
```

## Antes de submeter

Sempre revise as respostas finais diretamente na interface do Play Console no momento da submissão — esse guia reflete a estrutura do formulário no momento em que foi escrito, mas a Google altera essas telas com alguma frequência.
