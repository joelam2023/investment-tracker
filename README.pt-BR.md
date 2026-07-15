# Investment Tracker — acompanhamento privado de carteira no Obsidian

[English](https://github.com/joelam2023/investment-tracker/blob/main/README.md) | [简体中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-CN.md) | [繁體中文](https://github.com/joelam2023/investment-tracker/blob/main/README.zh-TW.md) | [日本語](https://github.com/joelam2023/investment-tracker/blob/main/README.ja.md) | [한국어](https://github.com/joelam2023/investment-tracker/blob/main/README.ko.md) | [Español](https://github.com/joelam2023/investment-tracker/blob/main/README.es.md) | [Deutsch](https://github.com/joelam2023/investment-tracker/blob/main/README.de.md) | [Français](https://github.com/joelam2023/investment-tracker/blob/main/README.fr.md) | Português (Brasil)

**Sua carteira. Seu cofre. Criptografado.**

O Investment Tracker é um rastreador de carteira privado e local-first para o Obsidian. Acompanhe fluxos de caixa, avaliações, rentabilidade e desempenho de referência enquanto seus registros de investimento criptografados permanecem no seu cofre — sem conta, telemetria ou backend operado pelo desenvolvedor.

Ele funciona no nível da conta, permitindo calcular o desempenho dos investimentos sem manter um histórico de negociações por posição.

## Informações essenciais

| Tema | Como o Investment Tracker funciona |
| --- | --- |
| Registros de investimento | Criptografados e armazenados no cofre do Obsidian do usuário |
| Backend operado pelo desenvolvedor | Nenhum |
| Conta ou login | Não é necessário |
| Telemetria e análise de uso | Nenhuma |
| Criptografia | AES-256-GCM, com a chave do registro protegida por PBKDF2-SHA256 e por uma chave de recuperação separada |
| Acesso opcional à rede | O modo automático de referência solicita dados públicos de referência e câmbio ao FRED |
| Sincronização do cofre | Um serviço escolhido pelo usuário, como Obsidian Sync ou iCloud, pode sincronizar o registro criptografado |
| Exportações | As exportações JSON e CSV criadas pelo usuário são arquivos não criptografados |

## Recursos

- Várias contas de investimento em USD, GBP, SGD, CNY, TWD, JPY, KRW, EUR ou BRL.
- Escrituração imutável baseada em eventos para aportes, retiradas e avaliações.
- XIRR, lucro acumulado, rentabilidade anual e rentabilidade mensal pelo método Dietz Modificado.
- Comparação com o Índice de Preços S&P 500 usando os mesmos fluxos de caixa.
- Conversão da referência do FRED sensível à moeda, com verificação explícita da direção da cotação.
- Bloqueio por senha, chave de recuperação separada, valores financeiros ocultáveis e bloqueio automático configurável.
- Eventos JSON criptografados armazenados no cofre do usuário.
- Exportação local explícita em JSON e CSV; o fluxo nas configurações exige nova autenticação por senha.
- Seleção automática do idioma da interface, com escolha manual e inglês como idioma de fallback.
- Inglês, chinês simplificado, chinês tradicional, japonês, coreano, espanhol, alemão, francês e português do Brasil.

## Ideal para

- Investidores preocupados com privacidade que desejam manter os registros da carteira no próprio cofre do Obsidian.
- Pessoas que registram manualmente aportes, retiradas e avaliações no nível da conta.
- Investidores que desejam XIRR, desempenho mensal e anual e comparação com o S&P 500.
- Usuários que preferem um fluxo de trabalho local-first sem criar outra conta financeira.

## Não foi projetado para

- Sincronização com corretoras.
- Posições em tempo real, feeds de preços, controle de lotes fiscais ou negociações automatizadas.
- Substituir extratos de corretora, registros fiscais ou aconselhamento financeiro profissional.
- Proteger um cofre desbloqueado contra um dispositivo comprometido ou outro plugin malicioso.

## Instalação e atualizações

Instale o **Investment Tracker** em **Obsidian → Configurações → Plugins da comunidade → Explorar**. Pesquise “Investment Tracker”, selecione o plugin e escolha **Instalar** e depois **Ativar**.

As atualizações são distribuídas pelo mecanismo de atualização dos plugins da comunidade do Obsidian.

Para instalação manual ou testes, coloque `main.js`, `manifest.json` e `styles.css` em:

```text
<Cofre>/.obsidian/plugins/investment-tracker/
```

## Uso básico

1. Abra o Investment Tracker pela faixa de opções.
2. Defina uma senha e salve a chave de recuperação gerada fora do cofre.
3. Crie uma conta e registre sua avaliação inicial.
4. Registre aportes externos, retiradas e avaliações atualizadas do valor total da conta.
5. Use o botão de olho para exibir ou ocultar os valores financeiros.
6. Consulte a rentabilidade mensal e anual e compare-a com a referência selecionada.
7. Escolha as regras de bloqueio automático em **Configurações → Registro de Investimentos → Privacidade e criptografia**.

Alterar o idioma da interface nunca muda a moeda de uma conta existente. Em uma nova instalação, o plugin usa informações de localidade apenas para sugerir uma moeda inicial; o usuário pode alterá-la antes de criar uma conta.

## Privacidade e segurança

O Investment Tracker não tem nuvem operada pelo desenvolvedor, sistema de contas, telemetria, análise de uso, publicidade nem mecanismo de envio automático. Nomes de contas, datas, valores, notas e dados de eventos são criptografados e armazenados no cofre do Obsidian do usuário. Novas instalações usam a pasta `Investment Tracker Data`; caminhos de dados seguros já existentes são preservados durante as atualizações.

Os dados dos eventos são criptografados com AES-256-GCM. A chave do registro é protegida por uma chave PBKDF2-SHA256 derivada da senha e por uma chave de recuperação separada. A senha e a chave descriptografada do registro não são gravadas nas configurações do plugin.

O bloqueio automático tem duas regras independentes: bloquear imediatamente ao sair do Investment Tracker ou quando o Obsidian perde o foco; e bloquear após 1, 5, 15 ou 30 minutos sem atividade no Investment Tracker. Pelo menos uma regra permanece ativada. Se o bloqueio imediato ao sair estiver desativado, sair ainda oculta os valores financeiros, recolhe o histórico expandido e fecha diálogos confidenciais. A regra de inatividade ou um bloqueio manual determina quando a chave do registro é removida da memória.

Uma chave de recuperação recém-gerada é ocultada após o usuário sair e volta a ser exibida somente depois que o registro é desbloqueado. Mantenha a chave de recuperação fora do cofre e use uma senha forte e exclusiva.

A criptografia protege os arquivos do registro armazenados contra exposição casual. Ela não protege os dados enquanto o plugin está desbloqueado, nem contra um dispositivo comprometido, exposição por capturas de tela ou área de transferência ou outro plugin malicioso com acesso ao mesmo cofre.

### Sincronização e exportações

O Investment Tracker não opera um serviço de sincronização. Se o usuário ativar o Obsidian Sync, iCloud ou outro serviço de sincronização do cofre, esse serviço escolhido pelo usuário poderá sincronizar os arquivos criptografados do registro entre dispositivos.

As exportações JSON e CSV são arquivos não criptografados, criados somente quando o usuário faz uma exportação explícita. Trate os arquivos exportados como registros financeiros confidenciais e armazene-os ou exclua-os de forma adequada.

Leia a [Política de Privacidade](https://github.com/joelam2023/investment-tracker/blob/main/PRIVACY.md) e a [Política de Segurança](https://github.com/joelam2023/investment-tracker/blob/main/SECURITY.md) completas.

## Divulgação de rede

A manutenção dos registros e os cálculos de rentabilidade principais não exigem um serviço operado pelo desenvolvedor. O modo automático de referência envia solicitações HTTPS GET ao serviço Federal Reserve Economic Data em `fred.stlouisfed.org` para obter dados do S&P 500 e de conversão de moedas.

Essas solicitações contêm apenas identificadores de séries públicas, as moedas selecionadas necessárias para escolher uma série de câmbio e intervalos de datas. Elas não incluem nomes de contas, saldos, valores de fluxos de caixa, avaliações, notas, senhas, chaves de recuperação ou conteúdo do registro.

O usuário pode selecionar o modo manual de referência para evitar solicitações automáticas ao FRED. As atualizações automáticas da referência exigem conexão com a internet. A série do S&P 500 usada pelo plugin é um índice de preços e não inclui dividendos.

## Perguntas frequentes

### O Investment Tracker envia os dados da minha carteira?

Nenhum registro da carteira é enviado a um backend operado pelo desenvolvedor. O plugin não tem sistema de contas do desenvolvedor, telemetria, análise de uso nem envio automático da carteira. O modo automático de referência faz apenas as solicitações limitadas ao FRED descritas em “Divulgação de rede”.

### Onde meus dados de investimento são armazenados?

O registro criptografado é armazenado no cofre do Obsidian do usuário. Novas instalações usam `Investment Tracker Data`. Se o cofre for sincronizado por um serviço escolhido pelo usuário, esse serviço também poderá armazenar ou transferir o registro criptografado.

### Meus dados de investimento são criptografados?

Os dados de eventos armazenados são criptografados com AES-256-GCM. Uma chave PBKDF2-SHA256 derivada da senha e uma chave de recuperação separada protegem a chave do registro. Os dados ficam visíveis enquanto o plugin está desbloqueado, e as exportações JSON ou CSV criadas pelo usuário não são criptografadas.

### Posso usar o Investment Tracker offline?

Os registros locais e os cálculos de rentabilidade podem ser usados sem um serviço operado pelo desenvolvedor. As atualizações automáticas da referência e das moedas pelo FRED exigem acesso à internet; o modo manual de referência evita essas solicitações.

### Ele se conecta à minha corretora?

Não. O Investment Tracker não se conecta a contas de corretoras. O usuário registra manualmente aportes externos, retiradas e avaliações do valor total da conta.

### Ele acompanha ativos ou negociações individuais?

Não é necessário manter um histórico de negociações no nível das posições. O plugin foi projetado para fluxos de caixa e avaliações no nível da conta, e não para posições em tempo real ou controle de lotes fiscais.

### Quais informações são enviadas ao FRED?

Somente identificadores de séries públicas, as moedas selecionadas necessárias para escolher a série de câmbio e intervalos de datas são incluídos nas solicitações automáticas de referência. Registros da carteira e credenciais não são incluídos.

### O que acontece se eu perder minha senha?

Use a chave de recuperação armazenada separadamente para recuperar o acesso de acordo com o fluxo de recuperação do plugin. Perder a senha e a chave de recuperação pode tornar o registro criptografado inacessível.

### As exportações JSON e CSV são criptografadas?

Não. As exportações JSON e CSV não são criptografadas e devem ser tratadas como registros financeiros confidenciais.

## Ajuda e feedback

Abra **Configurações → Registro de Investimentos → Ajuda e feedback** para relatar um erro, sugerir um recurso ou copiar informações de diagnóstico não confidenciais. Os relatos podem ser escritos em qualquer idioma.

Os links de feedback abrem o GitHub somente depois que o usuário clica em um botão. O plugin nunca cria um relato automaticamente nem envia ao desenvolvedor dados do registro, nomes de contas, saldos, transações, senhas, chaves de recuperação, nomes ou caminhos do cofre ou informações de diagnóstico. Revise os diagnósticos copiados e remova informações confidenciais de capturas de tela antes do envio.

Relate vulnerabilidades de segurança ou privacidade pelo [relato privado de vulnerabilidades do GitHub](https://github.com/joelam2023/investment-tracker/security/advisories/new), e não em uma issue pública.

## Desenvolvimento

```bash
npm ci
npm run check
npm run build:release
npm run privacy:check
```

As traduções usam os textos originais em inglês como fallback. Pull requests que alteram textos visíveis ao usuário devem atualizar todos os idiomas e manter inalterados os espaços reservados de interpolação.

As tags de lançamento devem corresponder exatamente à versão semântica de `manifest.json`, sem o prefixo `v`. O fluxo de lançamento cria um rascunho de GitHub Release contendo apenas `main.js`, `manifest.json` e `styles.css`, para revisão manual antes da publicação.

As instruções para mantenedores estão no [Guia de lançamento](https://github.com/joelam2023/investment-tracker/blob/main/RELEASING.md) completo.

## Aviso financeiro

Este plugin é uma ferramenta de registro e cálculo, não constitui aconselhamento financeiro, tributário, jurídico ou de investimento. Verifique os cálculos importantes de forma independente antes de tomar decisões.

## Licença

[Licença MIT](https://github.com/joelam2023/investment-tracker/blob/main/LICENSE)
