# Política de privacidade — Resenha Local

> A Google Play exige uma política de privacidade hospedada em uma URL pública (não pode ser só um texto dentro do app) para qualquer app que peça permissões sensíveis — e este app pede Bluetooth e localização. Hospede este texto em algum lugar público antes de submeter o app: uma página simples no GitHub Pages, Notion público, ou qualquer site institucional já resolve. Substitua os campos entre colchetes antes de publicar.

**Última atualização:** [DATA]

## Resumo

O Resenha Local foi construído para não coletar dados pessoais. Este documento explica exatamente o porquê, e o que as permissões do app realmente fazem.

## Quais dados o app coleta

Nenhum dado é coletado, transmitido ou armazenado por [NOME DA EMPRESA/DESENVOLVEDOR] ou por qualquer servidor. O Resenha Local não tem backend — não existe nenhum servidor para onde dados poderiam ser enviados.

As únicas informações que existem são:

- **Nome de usuário e perfil opcional**, escolhidos por você, guardados apenas no seu aparelho.
- **Chaves de criptografia**, geradas no seu aparelho e guardadas no Android Keystore — nunca saem dele.
- **Histórico de conversas**, cifrado e salvo localmente no seu aparelho, com opção de mensagens que se apagam automaticamente.

Nada dessa lista é enviado para fora do seu aparelho, exceto o conteúdo cifrado das mensagens, que vai diretamente para o aparelho da pessoa com quem você está conversando — nunca para nenhum servidor intermediário.

## Por que o app pede permissão de Bluetooth e localização

O Android exige a permissão `ACCESS_FINE_LOCATION` para que qualquer app possa fazer varredura de dispositivos Bluetooth próximos em versões mais antigas do sistema — essa é uma exigência do próprio Android, não uma escolha do Resenha Local, e o app não usa essa permissão para descobrir nem registrar sua localização geográfica. Em aparelhos com Android 12 ou mais recente, usamos as permissões `BLUETOOTH_SCAN`/`BLUETOOTH_ADVERTISE`/`BLUETOOTH_CONNECT` com a flag `neverForLocation`, que declara explicitamente ao sistema que a permissão não está sendo usada para fins de localização.

## Permissão de notificação

Usada apenas para manter visível o aviso de que o app está buscando ativamente pessoas por perto (exigência do Android para esse tipo de operação contínua em segundo plano). Não é usada para nenhum outro tipo de notificação ou alerta.

## Compartilhamento com terceiros

Não há compartilhamento de dados com terceiros, porque não há coleta de dados em primeiro lugar. O app não integra nenhum SDK de analytics, publicidade ou rastreamento.

## Crianças

O Resenha Local não é direcionado a menores de 13 anos e não coleta intencionalmente informações de crianças.

## Exclusão de dados

Como todos os dados ficam apenas no seu aparelho, você pode apagá-los a qualquer momento na própria tela de Configurações do app ("Apagar todos os dados locais"), ou simplesmente desinstalando o aplicativo.

## Alterações nesta política

Caso esta política mude no futuro, a nova versão será publicada nesta mesma URL, com a data de atualização revisada no topo do documento.

## Contato

Dúvidas sobre esta política podem ser enviadas para: [E-MAIL DE CONTATO]
