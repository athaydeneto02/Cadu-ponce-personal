# Cadu Ponce Personal

Aplicativo de consultoria esportiva em React/TypeScript, Vite, Supabase e Vercel.
A contratação e o pagamento são combinados pelo WhatsApp. O treinador cria ou
ativa a conta no painel depois da confirmação; o app não coleta cartão nem simula
pagamento.

## Desenvolvimento

1. Use Node.js 22 ou 24 e execute `npm ci`.
2. Copie `.env.example` para um arquivo local ignorado pelo Git e preencha apenas
   as variáveis do ambiente de desenvolvimento. Nunca use a produção nos testes.
3. Execute `npm run dev` para a interface. Para testar as funções `/api`, use
   `vercel dev` com credenciais de um ambiente de teste.

O cliente usa `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e, quando houver push,
`VITE_VAPID_PUBLIC_KEY`. Variáveis privilegiadas não podem ter prefixo `VITE_`.
Veja os nomes e usos em [configuração de segurança](docs/security-deployment.md).

## Verificação

- `npm run lint`: checagem TypeScript.
- `npm test`: testes de autenticação, APIs, associação de treinos, mídia, cache e
  sincronização com serviços simulados; não acessa serviços reais.
- `npm run test:db`: migração e permissões em PostgreSQL embutido/PGlite, sem rede.
- `npm run build`: checagem TypeScript seguida do build e PWA.
- `npm run check`: todas as verificações acima.

Os scripts antigos de diagnóstico exigem variáveis `TEST_` e recusam o ambiente
 da aplicação. Leia [ambiente de teste](docs/test-environment.md) antes de usá-los.

## Banco e publicação

A migração `supabase/migrations/20261105125428_secure_access.sql` protege os dados,
adiciona relações e funções de exclusão transacional e torna os buckets privados.
`supabase_setup.sql` é um espelho dessa migração, para instalações novas.

Antes de publicar, verifique o administrador real, aplique a migração primeiro em
uma cópia de teste, configure os segredos da Vercel e valide duas contas de alunos.
O procedimento completo está em [configuração de segurança](docs/security-deployment.md).
Remover uma credencial do código não a revoga: os valores expostos precisam ser
substituídos nos serviços correspondentes.

Fotos e registros de treino pendentes ficam separados por conta neste dispositivo
e são reenviados ao conectar. O aplicativo informa quando o envio está pendente;
não limpe os dados do navegador antes de concluir a sincronização.
