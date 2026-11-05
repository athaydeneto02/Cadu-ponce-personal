# Publicação de 5 de novembro de 2026

Publicado em https://cadu-ponce-personal.vercel.app, projeto Vercel
`athaydeneto02s-projects/cadu-ponce-personal`.

As migrações `20261105125428_secure_access` e
`20261105125554_rotate_push_subscriptions` foram aplicadas ao Supabase
`umqjakmxhfgclcxmpfda`. Os nomes locais correspondem ao histórico remoto.
As tabelas do app têm RLS, os três buckets são privados e o administrador ativo
foi preservado. Nenhuma conta ou registro de treino foi removido.

As 98 inscrições antigas de push, incluindo duplicatas, estão preservadas em
`private.legacy_push_subscriptions_20261105`, acessível somente ao proprietário
do banco. A existência dessa tabela impede repetir a limpeza. Não a remova.
Os navegadores renovam a inscrição depois do login quando já existe permissão;
o primeiro consentimento é solicitado pelo botão Ativar.

As variáveis públicas e privadas foram cadastradas em Production e Preview.
As chaves privadas são Secret na Vercel e não devem ser adicionadas ao Git.
A recuperação de senha usa o domínio de produção e `/reset-password`.
O contato comercial temporário é +55 (43) 8428-0737; pagamento pelo WhatsApp.

Validação: 59 testes do app, 2 de rotação e 11 grupos de integração PostgreSQL
passaram; TypeScript e build local/remoto passaram. Em produção, `/` e
`/reset-password` retornaram 200, e as três APIs retornaram 401 sem sessão.
A chave do servidor foi validada com uma consulta administrativa somente de leitura.
Não foram criados usuários, enviados avisos ou alteradas senhas em produção para teste.

O scanner Supabase deixou de reportar erros de RLS. Restam avisos sobre as duas
funções de exclusão SECURITY DEFINER (protegidas por verificação de administrador)
e proteção de senhas vazadas não habilitada. Esta última configuração não foi alterada.
O build ainda sinaliza um bundle grande, e há seis alertas nas ferramentas de
desenvolvimento; `npm audit --omit=dev` não apontou vulnerabilidades.

Revogue os tokens de acesso compartilhados anteriormente (GitHub e Supabase).
Remover um token do código ou do chat não o revoga. A Vercel utiliza sua própria
chave do projeto Supabase e não depende do token de acesso pessoal usado na configuração.
