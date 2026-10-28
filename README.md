# Corrente de esperança

Plataforma independente de arrecadação para tratamento oncológico. Next.js App Router, React, TypeScript, Tailwind CSS, Supabase/PostgreSQL/Auth/Realtime, Motion, Lucide, Zod e QR Code gerado localmente. Dinheiro transferido diretamente pelo doador ao beneficiário, sem gateway, webhook ou API bancária.

A campanha começa com **meta de R$ 100.000,00, R$ 0,00 arrecadados e zero doações**. Dados pessoais, fotografias e Pix não são preenchidos com exemplos. Sem Supabase, a interface sinaliza preparação; uma falha em um Supabase configurado gera indisponibilidade, nunca um total fictício.

## Executar

Requer Node.js 24 LTS e npm. Utilize o checkout existente: cada tarefa na nuvem já é isolada, sem necessidade de worktree.

```sh
npm ci
cp .env.example .env.local
# preencher as variáveis abaixo
npm run dev
```

Variáveis:

| Nome                                   | Conteúdo                                                       |
| -------------------------------------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | URL HTTPS do seu projeto Supabase                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública publishable (ou anon legada); nunca service role |
| `NEXT_PUBLIC_SITE_URL`                 | Origem pública canônica, incluindo https:// em produção        |

As duas primeiras são públicas por definição e têm segurança baseada em RLS. Não configure service role na aplicação. No ambiente gerenciado, libere **o hostname exato do seu projeto** (`seu-projeto.supabase.co`) nas configurações de rede, além dos destinos já disponíveis do npm/GitHub. A interface precisa de HTTPS e WebSocket para esse host. Preserve proxy e verificação TLS do ambiente.

## Configurar o Supabase

1. Crie um projeto PostgreSQL/Supabase e copie a URL e chave pública em Settings → API.
2. Execute **uma vez** o conteúdo completo de `supabase/migrations/001_campaign.sql` no SQL Editor. Este arquivo é a instalação inicial revisada; exige que estas tabelas ainda não existam. Se uma versão anterior já foi aplicada, não a reaplique: será necessária uma migration incremental específica, sem apagar dados. A migration é transacional e adiciona `campaign_signal` à publicação `supabase_realtime`. Não publique `donations` nem `audit_logs` no Realtime.
3. Desative cadastro público em Authentication → Providers → Email. Crie o administrador pelo painel de usuários do Supabase; use uma senha forte. Configure Site URL e redirecionamentos somente para os domínios reais da aplicação. Mantenha os limites de autenticação do Supabase habilitados; adapte-os ao volume legítimo. Não há endpoint público para criar administradores.
4. Copie o UUID do usuário criado e execute, substituindo o marcador pelo UUID real:

```sql
insert into public.admin_users(user_id) values ('UUID-DO-USUARIO-CRIADO');
```

5. Faça login em `/admin/login`. Autorizações são conferidas no servidor, nos RPCs e por RLS; ser um usuário autenticado não basta. Para revogar acesso, remova o UUID de `admin_users` pelo SQL Editor.
6. Em **Campanha e Pix**, configure nome, história, fotografias autorizadas (URLs HTTPS), mensagem, destinação dos recursos, contato público e meta. Registre a autorização do beneficiário antes de publicar seus dados de saúde e imagens. Não envie laudos sem consentimento.
7. Configure chave Pix registrada no Mercado Pago, titular e cidade do recebedor. Use CPF/CNPJ sem pontuação, telefone com +55, e-mail ou chave aleatória. O titular é normalizado para o BR Code (25 caracteres) e a cidade para 15 caracteres. Habilitar Pix torna a chave pública; prefira chave aleatória para evitar divulgação de CPF. Confira no banco o titular real e valide uma transferência pequena antes de divulgar. A plataforma não pode verificar a titularidade da chave.
8. Use URLs de fotografias e documentos em armazenamento que você controla. Remova dados sensíveis dos comprovantes antes de publicá-los. A aplicação não recebe comprovantes privados nem faz upload de arquivos; o administrador informa URLs de arquivos já preparados e autorizados.

## Registrar e conferir doações

- Confira o recebimento no extrato do beneficiário e abra **Doações** no painel.
- Informe valor e horário do recebimento. A data do formulário usa o fuso do dispositivo; filtros usam America/Cuiaba. Tudo é armazenado em UTC.
- Mantenha anonimato, salvo autorização válida documentada. Referência bancária e observações são privadas. Sempre que possível, informe referência única do extrato para impedir registro duplicado entre operadores.
- O servidor valida com Zod, a função SQL confirma a permissão e a operação ocorre em uma transação. `request_id` torna reenvios idempotentes, com bloqueio transacional para reenvios concorrentes e fingerprint dos dados normalizados. Reutilizar o mesmo identificador com outro conteúdo é rejeitado. Sem referência bancária, registros distintos de um mesmo pagamento não podem ser identificados automaticamente: a conferência administrativa continua necessária.
- Corrigir preserva a linha anterior como `corrected` e cria substituta `confirmed`; cancelar muda para `cancelled`. Não há exclusão financeira comum. Controle de versão impede correções simultâneas sobre o mesmo registro.
- Histórico possui filtros por nome público/referência e datas, paginação e exportação CSV privada com proteção contra fórmulas. Não compartilhe o CSV publicamente. Durante exportações, evite alterações concorrentes se precisar de um fechamento contábil exato; o CSV paginado não é um snapshot transacional de grandes volumes.
- Comunicados podem conter despesas e links de documentos previamente revisados. A retirada de uma publicação fica auditada. A tela mostra os 30 comunicados mais recentes e as 60 operações mais recentes; o histórico completo de auditoria permanece no PostgreSQL.

## Integridade e atualização em tempo real

`donations` é a fonte oficial: total é `sum(amount_cents)` apenas de linhas `confirmed`. Valores monetários são inteiros em centavos; a barra visual limita em 100%, mas o percentual pode ultrapassar a meta e o restante nunca é negativo.

`public_snapshot()` lê uma fotografia consistente dos agregados e uma projeção pública limitada. Não retorna referências bancárias, notas, consentimentos privados ou identidades dos administradores. Conteúdo pessoal não autorizado e dados Pix desabilitados são removidos dessa resposta. Não existem permissões públicas de leitura/escrita nas tabelas financeiras. Mesmo administradores autenticados têm apenas SELECT em `donations`, sem políticas RLS de INSERT/UPDATE/DELETE: alterações financeiras só ocorrem pelos RPCs. A resposta pública enumera os campos permitidos, sem repassar chaves privadas ou futuras do JSON de configuração. RPCs com `search_path` fixo autorizam o administrador antes de gravar. GRANT/REVOKE remove também os privilégios herdados de PUBLIC e os grants explícitos padrão de anon/authenticated. A função de trigger de auditoria não pode ser chamada diretamente pelos papéis da API; registra antes/depois por operação e converte UUID e ID booleano de campanhas em texto. Registros e auditoria são atômicos. Um limite persistente de 60 alterações por administrador/minuto é aplicado no banco; uma correção usa duas alterações. Login utiliza a proteção de taxa do Supabase Auth.

Cada mutação incrementa apenas a revisão da tabela pública `campaign_signal`. O navegador recebe a invalidação por Supabase Realtime e **consulta novamente o snapshot oficial**, sem confiar em totais de um evento. Reconexão, retorno à aba e evento online sincronizam os dados; polling de 30 segundos cobre eventos perdidos. Notificações dependem de contribuições reais novas em relação ao snapshot anterior, sem identificar doadores. Movimento reduzido é respeitado.

Para validar a integração no seu projeto:

1. Abra a campanha em duas janelas e o painel em outra.
2. Registre uma doação **realmente recebida** de valor conhecido.
3. Confirme em ambas as janelas total, quantidade, percentual, restante e histórico.
4. Teste correção e cancelamento de um lançamento de teste apenas em projeto separado de homologação.
5. Desconecte e reconecte uma janela: ela deve recuperar os totais oficiais. Uma indisponibilidade preserva o último valor conhecido com aviso de sincronização.
6. Como anon e como usuário sem `admin_users`, tente consultar as tabelas privadas e executar RPCs de escrita: o acesso deve ser negado. Verifique também `/admin/export` sem sessão.

## Verificações

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm start
# em outro terminal, com o servidor ativo:
npx playwright install chromium
npm run test:e2e
```

No ambiente atual, Chromium está em `/usr/bin/chromium`; use `PLAYWRIGHT_CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`. O caminho é opcional; em outras máquinas o Playwright usa seu navegador instalado. Testes de navegador pressupõem projeto sem variáveis Supabase, para validar o estado de preparação de forma determinística. Use um projeto separado para homologar fluxos autenticados.

Os testes de unidade cobrem centavos, meta, consentimento, CSV e BR Code/CRC. O teste PostgreSQL embarcado executa a migration real, com um schema `auth` mínimo e papéis anon/authenticated, e verifica RLS sob privilégios padrão permissivos, ausência de escrita financeira direta inclusive para administradores, revogação de administrador, idempotência, versão nula, payloads inválidos, correção/cancelamento, rollback, privacidade, limites de taxa e auditoria com IDs UUID e booleano. As garantias de acesso descritas se aplicam a anon/authenticated; o proprietário do banco e credenciais privilegiadas ficam fora dessa fronteira e nunca devem ser expostos à aplicação. Ele não substitui teste do Supabase Auth hospedado ou do transporte Realtime real. Os testes Chromium verificam rotas, proteção da exportação, interações e largura em 390, 768 e 1440 pixels. Webpack é utilizado por compatibilidade com o ambiente gerenciado.

## Publicar na Vercel

1. Envie os arquivos e o lockfile ao repositório GitHub e importe-o na Vercel como projeto Next.js. Diretório raiz: o diretório deste `package.json`; Node.js 24.x; instalação `npm ci`; build `npm run build`.
2. Configure as três variáveis acima nos ambientes apropriados. Defina `NEXT_PUBLIC_SITE_URL` com o domínio canônico HTTPS e faça novo deploy ao alterar qualquer variável `NEXT_PUBLIC_*`, pois ela entra no bundle.
3. Execute a migration e configure o administrador no Supabase antes de divulgar o site. Ajuste os domínios de Auth. Se usar domínio personalizado para a API Supabase, ajuste também `connect-src` no CSP.
4. Faça login, salve campanha/Pix/contato, revise autorizações e o conteúdo de privacidade/termos com os responsáveis. Defina política de retenção, backups e acesso administrativo. Não há garantia de resultado médico.
5. Confira QR Code em aplicativos bancários reais, titular, metadados Open Graph e sincronização entre duas janelas. O processo de transferência fica exclusivamente no banco do doador.

Não há servidor financeiro permanente nem credenciais bancárias. A Vercel atende páginas e Server Actions; Supabase hospeda banco, Auth e Realtime. Deploy, criação de projeto Supabase, configuração bancária e teste financeiro real dependem das contas dos responsáveis e não são efetuados automaticamente.

## Estrutura

- `src/app`: páginas, API pública, ações administrativas, exportação CSV e imagem Open Graph.
- `src/components`: campanha, formulário Pix, compartilhamento e painel.
- `src/lib`: regras monetárias, validação Zod, BR Code/CRC, autenticação e acesso aos dados.
- `src/proxy.ts`: renovação de sessão administrativa; cada operação revalida a autorização independentemente do proxy.
- `supabase/migrations`: banco, políticas RLS, RPCs, sinal público e auditoria.
- `tests`: testes de regras, PostgreSQL e navegador.

Nenhum pagamento é efetuado pelo site. Uma integração futura deve chamar o mesmo serviço de registro/confirmação autorizado, mantendo o cálculo a partir do livro de contribuições; nenhuma integração bancária está habilitada nesta versão.
