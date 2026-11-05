# Proteção de dados — 05/11/2026

Esta revisão reforça o aplicativo em uso. Não é certificação de invulnerabilidade nem um pentest externo de toda a infraestrutura.

## Controles no banco e nas APIs

- As RLS e todas as APIs privadas exigem uma sessão existente de Auth, vinculada ao usuário validado, dentro de `not_after`, sem banimento/exclusão e sem login anônimo. O JWT é validado pelo Auth antes de suas claims selecionarem a sessão nas APIs.
- Um JWT de sessão encerrada não dá acesso novo ao banco apenas por ainda estar dentro da validade criptográfica. A RPC de validação do servidor não pode ser chamada por alunos ou usuários anônimos.
- Alunos recebem somente seus próprios dados. Rotinas compartilhadas não retornam o cadastro dos demais destinatários; a tabela de modelos fica diretamente disponível apenas ao administrador.
- Mídias legadas órfãs e configurações financeiras administrativas não são uma biblioteca pública para os alunos.
- Os papéis da aplicação não podem criar objetos no schema público nem usar TRUNCATE, TRIGGER ou REFERENCES em tabelas do app.
- Consulta de conclusão de treino filtra o proprietário antes de retornar dados; a resposta não distingue um ID inexistente de um ID de outro aluno. Há limite persistente de tentativas.
- Inscrições de push são dados não confiáveis: URL canônica, domínio permitido, formato e chaves P-256 são verificados antes do envio. Não são aceitos destinos arbitrários. O envio tem limite de duração e informa pendências.
- Chamadas de serviço têm timeout e rejeitam redirects. A sonda de disponibilidade agrupa consultas simultâneas e usa cache curto.

## Navegador e arquivos

- CSP restringe scripts à própria aplicação, bloqueia scripts inline/eval, objetos, incorporação do app por outro site, alterações de base e submissão de formulários para outro domínio. Conexões JavaScript ficam limitadas ao app e ao projeto Supabase.
- HTTPS de imagens/vídeos externos continua permitido por compatibilidade com a biblioteca. `style-src` permite estilos inline usados por React/animações. Portanto, a CSP não é uma garantia de bloqueio de qualquer canal de saída.
- `nosniff`, `no-referrer`, isolamento de janela e política de permissões complementam a CSP. A exportação PDF, o PWA e vídeos do YouTube permanecem previstos na política.
- Fontes executáveis, HTML e SVG inline não são convertidos em blobs da origem do app. Arquivos locais exigem proprietário compatível com a sessão.
- A troca direta de conta fecha telas da conta anterior. Caches confirmados e descartáveis são removidos ao sair; respostas atrasadas não os repovoam.
- URLs privadas novas duram 10 minutos e são renovadas enquanto a conta mantém acesso. URLs antigas já emitidas continuam válidas até o prazo original. Downloads concluídos não são revogáveis.
- Pendências offline e dados legados foram preservados. Eles não foram criptografados no navegador. Em dispositivo compartilhado, use perfis separados do sistema/navegador; não limpe os dados enquanto houver sincronização pendente.

## Configuração e prevenção de regressão

- Cadastro público e login anônimo foram conferidos desativados no endpoint público de configuração do Auth. O usuário confirmou senha mínima de 12 caracteres e revogação do token pessoal antigo.
- A proteção de senhas vazadas do Supabase exige plano pago e permaneceu desativada. Não foi contratado upgrade.
- O projeto Vercel usa o plano Hobby. A regra ativa `Cadu API abuse protection` limita `/api/` a 120 requisições por IP em 60 segundos, usando a regra incluída no plano. Ela não abrange o domínio direto do Supabase Auth e não substitui RLS ou permissões. IPs compartilhados também compartilham esse limite.
- O comando de reativação das mitigações automáticas da Vercel foi recusado pelo próprio CLI por exigir execução interativa humana. Esse recurso não foi alterado; não confundir com a regra de rate limit, que foi publicada e conferida ativa.
- Instalação de produção usa `npm ci`; a versão direta de Supabase está fixada e o lockfile é versionado.
- CI verifica testes, build, dependências vulneráveis e padrões de segredos em arquivos versionados e no bundle. A checagem de disponibilidade verifica também os cabeçalhos de segurança.
- A busca em 515 blobs de código/configuração do histórico Git e no bundle não encontrou os padrões de credenciais privilegiadas examinados. Isso não prova ausência de qualquer tipo de segredo; o scanner não substitui revisão e rotação.

## Operação contínua

Mantenha autenticação em dois fatores nas contas administrativas de Supabase, GitHub e Vercel, privilégios mínimos e atualização de dependências. Esta rodada não cadastrou fatores MFA pessoais nem alterou credenciais do usuário. A segurança também depende dessas contas e dos dispositivos.

Backups e restauração devem seguir `backup-restore.md`. Logs e alertas seguem `observability.md`. Nenhum push/e-mail externo de teste foi enviado. O controle visual do Chrome foi interrompido por não conseguir validar a URL da janela; os ajustes do painel Auth foram feitos pelo usuário.

Referências: [sessões Supabase](https://supabase.com/docs/guides/auth/sessions), [segurança de senhas](https://supabase.com/docs/guides/auth/password-security), [CSP OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html), [rate limiting Vercel](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).
