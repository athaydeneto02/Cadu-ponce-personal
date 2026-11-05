# Aplicação das correções de segurança

O código local já exige identidade e privilégios no servidor. A proteção completa
depende também da migração do banco, da configuração das funções Vercel e da
substituição das credenciais que estavam expostas. Esses passos não são executados
automaticamente pelo build. Não copie valores de chaves para tickets ou logs.

## Antes da publicação

1. Faça backup dos dados e da configuração atual no Supabase. Use uma cópia de
   teste para validar a migração. Ela preserva registros, mas substitui as políticas
   das tabelas deste aplicativo e torna privados os três buckets gerenciados.
2. Confirme pelo painel do Supabase o UUID da conta do proprietário. O código antigo
   promovia usuários por texto no e-mail; essa regra foi removida. Verifique os papéis
   existentes, pois a migração não escolhe automaticamente quem deve ser administrador.
   A presença do painel administrativo na versão antiga não prova que exista um
   administrador registrado no banco. Pelo SQL Editor, obtenha apenas contagens:

   ```sql
   select count(*) filter (where role = 'admin') as administradores,
          count(*) filter (where role = 'admin' and status = 'active') as administradores_ativos
   from public.profiles;
   ```

   Se `administradores_ativos` for zero, pare a publicação até verificar a conta
   legítima e promovê-la no banco. Essa consulta não retorna dados pessoais.
3. Se o proprietário ainda estiver salvo como aluno, promova apenas o UUID verificado
   pelo SQL Editor, usando uma sessão administrativa:

   ```sql
   -- Substitua somente depois de verificar a identidade no painel de Auth.
   update public.profiles
   set role = 'admin', status = 'active'
   where id = 'UUID_VERIFICADO_DO_PROPRIETARIO';
   ```

   Revise também qualquer outra conta com papel `admin`. Não use nomes semelhantes
   ou trechos de e-mail para atribuir privilégios.
4. Revogue o token do GitHub que estava no endereço `origin` e configure o Git com
   o gerenciador de credenciais. Remover o valor do arquivo não revoga o token.
5. Gere um novo par VAPID caso o par exposto tenha sido utilizado. Configure as duas
   chaves no servidor e a chave pública no build do cliente. As inscrições dos
   navegadores precisam ser renovadas com o novo par. Revise as contas de teste que
   tinham senhas em scripts e troque/remova essas credenciais pelo painel de Auth.

## Banco de dados

Execute `supabase/migrations/20261105125428_secure_access.sql` no SQL Editor da cópia
de teste. O arquivo `supabase_setup.sql` tem exatamente o mesmo conteúdo e também
pode criar uma instalação nova. Execute uma cópia do script por ambiente; não
execute ambos como etapas separadas. A migração pode ser repetida sem duplicar
políticas ou registros. Em caso de erro, a transação é revertida; não remova trechos
de segurança para forçar a execução.

A migração:

- Habilita RLS nas tabelas utilizadas e remove políticas permissivas antigas dessas
  tabelas. Alunos acessam apenas registros próprios; administradores ativos gerenciam
  os dados. Bibliotecas de exercícios podem ser lidas por usuários ativos.
- Protege papel, situação, e-mail e configurações administrativas do perfil contra
  alteração por alunos. Nome, foto, peso, altura e dados pessoais permitidos podem
  ser editados pelo próprio aluno ativo.
- Cria novos perfis de cadastro público como `student` e `inactive`. A contratação
  é pelo WhatsApp, e o administrador cria ou ativa a conta depois da confirmação.
  O fluxo administrativo cria a conta no servidor, sem senha padrão e sem enviar
  convites automaticamente. Considere desativar cadastro público no painel Auth.
- Torna `evolution-photos`, `arquivos-alunos` e `exercise-videos` privados. Fotos e
  arquivos ficam sob o caminho `UUID_DO_ALUNO/...`, acessível ao aluno e ao admin;
  vídeos de exercícios têm leitura autenticada e escrita administrativa.
  Arquivos de alunos aceitam até 20 MB: PDF, JPEG, PNG, WebP, TXT, DOC/DOCX,
  XLS/XLSX e vídeos MP4/MOV. Fotos comprimidas de evolução aceitam até 10 MB;
  vídeos da biblioteca aceitam até 100 MB em MP4/WebM/MOV.
- Adiciona `workouts.routine_id`, `workout_logs.comment` e colunas de cargas
  prescritas quando ausentes. Preserva os dados legados e não associa por nome.
- Cria relações entre exercícios e seus treinos/rotinas quando os tipos dos IDs
  são compatíveis. Usa `NOT VALID` para preservar órfãos legados; novas gravações
  já respeitam a relação. Após revisar e corrigir órfãos sem descartar dados,
  valide as constraints. Tipos incompatíveis geram um aviso e exigem migração
  específica revisada; não são convertidos automaticamente.
- Exclui uma atribuição ou rotina por funções transacionais que conferem papel
  administrativo e removem somente filhos e cópias ligadas por ID. Se uma etapa
  falha, toda a exclusão é revertida. Treinos legados de mesmo nome são preservados.
- Mantém os arquivos antigos no Storage. Registros com caminhos fora do padrão
  do UUID devem ser revistos pelo administrador; não amplie políticas para torná-los
  públicos. O cliente resolve referências `storage://bucket/path` em URLs assinadas.
- Adiciona limites por administrador e por minuto: 10 envios de notificações,
  20 uploads via função e 10 cadastros. Se a função SQL de limite não estiver
  disponível, as APIs recusam a operação.

Confira as colunas e tipos do banco existente antes da execução: o projeto usava
scripts e esquemas parciais. As políticas comparam IDs UUID/texto explicitamente,
mas esta migração não tenta converter schemas incompatíveis ou inferir relações
legadas a partir de nomes. Aplique em produção apenas depois da validação da cópia.

## Variáveis da Vercel

Use `.env.example` como lista de nomes. As chaves do servidor não devem ter prefixo
`VITE_`, pois esse prefixo expõe valores ao navegador.

| Nome | Onde é usado |
| --- | --- |
| `VITE_SUPABASE_URL` | Cliente |
| `VITE_SUPABASE_ANON_KEY` | Cliente; chave pública, protegida por RLS |
| `VITE_VAPID_PUBLIC_KEY` | Cliente; deve corresponder à nova chave pública VAPID |
| `SUPABASE_URL` | Funções do servidor; pode reutilizar a URL pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Apenas funções do servidor |
| `VAPID_PUBLIC_KEY` | Apenas função de notificações |
| `VAPID_PRIVATE_KEY` | Apenas função de notificações |
| `VAPID_SUBJECT` | Contato do emissor, por exemplo `mailto:suporte@seu-dominio` |

As APIs não aceitam uma chave anônima como alternativa à service role. Sem
configuração adequada retornam indisponibilidade em vez de reduzir a segurança.
Não registre o cabeçalho Authorization, senha de cadastro ou conteúdo das inscrições.

No Supabase Auth, configure a URL do site e permita o redirecionamento de recuperação
para `/reset-password` no domínio real. Use apenas os domínios de produção e teste
necessários. O cadastro administrativo exige senha de pelo menos 12 caracteres;
a senha é enviada ao Auth, nunca armazenada em `profiles`.

## Publicação e verificação

Valide em ambiente de teste com duas contas de alunos e uma de administrador:

- Aluno A não lê nem altera perfil, treino, foto ou arquivo do aluno B.
- Aluno não muda papel, situação, faturas ou modelos de treino.
- Conta inativa não acessa os dados protegidos; administrador ativo mantém acesso.
- A API retorna 401 sem sessão e 403 para aluno/inativo, inclusive quando o corpo
  da requisição contém um papel administrativo.
- Notificações retornam contagem real; sem inscrição ou falha não aparece sucesso.
- Criação administrativa não muda a sessão do treinador, não usa senha padrão e
  não deixa conta parcialmente criada quando a gravação do perfil falha.
- Fotos privadas são visíveis somente para o aluno e o treinador e continuam
  funcionando após recarregar a página, com renovação das URLs assinadas.

Depois dos testes, coordene a migração, as variáveis e a publicação da nova versão.
Clientes antigos podem precisar recarregar o PWA porque URLs públicas de buckets
privados passam a exigir autenticação. Não reverta as políticas para públicas como
solução de compatibilidade.

Para funções locais, utilize `vercel dev` com variáveis de desenvolvimento. O
servidor Vite não executa as funções: `/api/` retorna uma orientação 503. Uploads
diretos ao Supabase continuam sujeitos às políticas do banco. O fallback autenticado
`/api/upload` aceita até 4 MB e verifica MIME e assinatura; arquivos maiores usam
envio direto autenticado ao Storage.

## Testes automatizados

`tests/backend-security.test.ts` verifica identidade, papel, limites, destinos de
notificações, assinaturas de arquivos e recusa anônima dos três handlers sem rede.
`tests/sql-security.integration.mjs` executa a migração em PostgreSQL embutido com
PGlite, simula as funções de identidade do Supabase e testa RLS, edição de perfis,
políticas antigas de Storage e limites de frequência. Isso não substitui a
verificação do schema, configuração Auth/Storage e variáveis reais de produção.

Referências: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security),
[políticas do Storage](https://supabase.com/docs/guides/storage/security/access-control)
e [criação administrativa de usuário](https://supabase.com/docs/reference/javascript/auth-admin-createuser).
