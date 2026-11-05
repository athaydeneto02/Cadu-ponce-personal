# Diagnósticos manuais em ambiente de testes

Os scripts `.mjs` de diagnóstico na raiz usam `scripts/test-environment.mjs`.
Eles não usam as credenciais da aplicação como alternativa e não imprimem
registros de alunos, IDs, endereços de e-mail, senhas ou tokens.

Configure as variáveis no terminal ou no arquivo local ignorado pelo Git
`.env.test.local`:

```dotenv
TEST_SUPABASE_URL=http://127.0.0.1:54321
TEST_SUPABASE_ANON_KEY=chave-publicavel-do-ambiente-de-testes
TEST_USER_EMAIL=conta-sintetica-do-ambiente-de-testes
TEST_USER_PASSWORD=senha-exclusiva-da-conta-de-testes
```

Para um projeto Supabase remoto separado, use HTTPS e defina também
`TEST_ALLOWED_HOST` com o hostname exato desse projeto. O helper recusa o mesmo
hostname de `VITE_SUPABASE_URL` presente no ambiente ou nos arquivos de
configuração da aplicação. `TEST_PRODUCTION_SUPABASE_URL` pode registrar uma
origem de produção adicional para bloquear.

Scripts que cadastram contas, inserem treinos/exercícios ou alteram o perfil
exigem `TEST_ALLOW_WRITES=true`. Use somente contas sintéticas e banco descartável:
os registros de diagnóstico permanecem nesse banco. Políticas RLS continuam
valendo; para operações administrativas, a conta de teste precisa do papel
adequado. Nunca use chave `service_role` ou `sb_secret_` nesses scripts.

`create_test_student.mjs` usa o e-mail e a senha configurados para criar uma conta
de teste. A confirmação do e-mail e a ativação dessa conta devem seguir a
configuração do ambiente. Esse script não concede papel de administrador.

`create_workout_logs_table.mjs` apenas verifica se a tabela está acessível.
Mudanças de esquema devem usar as migrações SQL do projeto em ambiente de teste.

Exemplos de execução manual, depois de configurar um ambiente separado:

```powershell
node check_db.mjs
node test_profile_exists.mjs
```

Os testes automatizados de validação do helper não realizam conexões externas:

```powershell
node --test tests/test-environment.test.mjs
```
