# Backup e ensaio de restauração

Estado em 05/11/2026: o procedimento abaixo foi testado com arquivos fictícios e clientes simulados. **Não foi executado backup nem restauração de produção por este procedimento.** A disponibilidade, a retenção e o último sucesso do backup gerenciado/PITR deste projeto continuam sem confirmação. Não há rotina externa agendada por este documento.

A consulta de leitura da equipe nesta data encontrou zero objetos em `storage.objects`. Isso não comprova ausência de arquivos pendentes nos navegadores: IndexedDB, rascunhos, fotos e registros ainda não sincronizados **não fazem parte do backup remoto**. Não limpar dados do navegador antes de concluir a sincronização.

## O conjunto necessário

| Parte | Procedimento | Limite |
| --- | --- | --- |
| Banco, contas Auth, tabelas privadas e regras | Backup gerenciado confirmado ou exportação lógica oficial | Precisa de ensaio real em projeto separado |
| Objetos do Storage | `scripts/storage-backup.mjs` | Complementa o banco; não exporta tabelas, RLS, contas ou credenciais |
| Código e migrações | Commit do repositório correspondente | Git não contém dados reais nem segredos |
| Configuração de Auth, domínios, OAuth e variáveis Vercel | Inventário em cofre de segredos | Não copiar segredos para Git ou logs |
| Dados ainda locais | Sincronização pelo próprio aplicativo | Nenhum dado de navegador foi copiado ou validado por estes scripts |

O backup de banco Supabase contém metadados de Storage, não os arquivos. Confira as opções e a retenção efetivamente habilitadas no Dashboard, em Database → Backups. A documentação descreve backups diários nos planos pagos e exportações próprias para o plano gratuito; isso **não confirma o plano ou a configuração deste projeto**. [Documentação oficial](https://supabase.com/docs/guides/platform/backups).

## Exportar e conferir os arquivos

Requer Node e as dependências já instaladas do repositório. O script não carrega `.env`, não escolhe produção implicitamente, não imprime nomes de arquivos/alunos e não grava dentro do repositório. Crie previamente uma pasta privada fora do Git, preferencialmente em disco cifrado e com acesso restrito ao operador. No Windows, o modo `0600` não substitui ACLs/BitLocker.

Disponibilize na sessão, através do gerenciador de segredos:

- `BACKUP_SUPABASE_URL`: origem explícita do projeto de origem.
- `BACKUP_SUPABASE_SERVICE_KEY`: chave privilegiada desse projeto, usada somente para leitura neste comando. Nunca use uma variável `VITE_` para essa chave.
- `BACKUP_PASSPHRASE`: frase aleatória de pelo menos 20 caracteres. Guarde-a separada dos arquivos; perdê-la impede a recuperação.

Exemplo de caminhos, sem credenciais:

```powershell
node scripts/storage-backup.mjs export 'D:\BackupsPrivados\cadu-storage-2026-11-05'
node scripts/storage-backup.mjs verify 'D:\BackupsPrivados\cadu-storage-2026-11-05'
```

O diretório final deve ser novo. O export enumera buckets, pastas e objetos com paginação, baixa os objetos, cifra cada arquivo e o manifesto com AES-256-GCM, registra SHA-256 e repete o inventário. A frase é derivada por scrypt com salt aleatório; cada arquivo usa nonce independente. O índice `backup.json` informa somente formato, salt e datas, sem caminhos privados.

Só aceite saída com código zero e `status: "ok"`, seguida de `verify` também com código zero. `backup.json` deve indicar `complete`. Falha de download, mudança no inventário, disco cheio, tamanho ausente ou objeto maior que 128 MB deixam o processo incompleto. O limite evita carregar vídeos arbitrariamente grandes na memória. Não reutilize uma pasta incompleta; preserve-a para diagnóstico e faça outra exportação.

Esta exportação não é uma transação do banco nem uma fotografia atômica do serviço. Faça banco e arquivos na mesma janela sem gravações. A comparação de inventário detecta alterações usuais durante a exportação, mas não substitui essa janela. Copie o conjunto cifrado para armazenamento externo independente e execute `verify` sobre a cópia. Não guarde a frase junto ao arquivo.

## Ensaio local do Storage

Prepare uma instância **local e descartável** do Supabase e aplique as migrações do app. A implantação/instalação dessa instância não foi realizada por este trabalho. Inspecione primeiro `supabase --version`, `supabase start --help` e `supabase db dump --help`; o CLI v3 alterou a seleção de destinos, portanto não reutilize comandos de v2 sem verificar.

Configure somente as credenciais da instância local:

- `RESTORE_SUPABASE_URL`: por exemplo `http://127.0.0.1:54321`.
- `RESTORE_SUPABASE_SERVICE_KEY`: chave privilegiada **local**, nunca a chave de produção.
- `BACKUP_PASSPHRASE`: a frase do backup.

```powershell
# Verifica todos os arquivos e o destino; nenhuma escrita.
node scripts/storage-backup.mjs restore 'D:\BackupsPrivados\cadu-storage-2026-11-05'

# Somente depois de verificar o resultado acima, executar no Supabase local.
$env:RESTORE_ALLOW_WRITES = 'true'
node scripts/storage-backup.mjs restore 'D:\BackupsPrivados\cadu-storage-2026-11-05' --apply
Remove-Item Env:RESTORE_ALLOW_WRITES
```

O script recusa qualquer destino remoto. Sem `--apply` e a variável explícita não grava. Antes da primeira gravação, confere a integridade de todo o backup e possíveis conflitos. Não sobrescreve arquivos: uma colisão com conteúdo diferente ou um arquivo extra no bucket interrompe o procedimento. Uma repetição aceita objetos já restaurados com hash idêntico. Ao terminar, baixa os arquivos do destino e confere novamente os hashes.

O ensaio restaura nomes, conteúdo, MIME e configuração básica de buckets. Não restaura identidade do proprietário de cada objeto, políticas RLS ou histórico de versões. As regras do aplicativo usam pastas por UID; preserve os mesmos UIDs ao restaurar o banco/Auth. Não teste notificações com inscrições e chaves de produção em uma cópia do sistema.

## Banco: procedimento que ainda requer comprovação

1. Registrar em local privado: projeto de origem, versão do Postgres, commit da aplicação, migrações aplicadas, início/fim da janela e identificador do backup. Anotar separadamente o backup de Storage correspondente.
2. Confirmar no Dashboard se há backup diário ou PITR, último sucesso, retenção e ponto recuperável. Não alterar o plano nem ativar recursos pagos como parte de uma inspeção.
3. Quando precisar de cópia lógica, seguir o [guia oficial de backup e restauração](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), incluindo roles, schema e dados. Conferir se Auth, schemas privados, customizações de `auth`/`storage` e histórico `supabase_migrations` estão contemplados. Os arquivos SQL contêm dados pessoais: manter em pasta privada cifrada, fora do Git.
4. O guia atual usa CLI v3, Docker e conexão direta/session pooler; esses executáveis não foram encontrados neste ambiente. Verificar a versão e `--help` antes de executar. Não redefinir a senha do banco só para realizar uma auditoria. Não registrar a string de conexão ou sua senha em terminal compartilhado, scripts, tickets ou logs.
5. Restaurar primeiro em destino separado e descartável, compatível com a versão/extensões de origem. Usar transação e interrupção no primeiro erro. Nunca apontar o primeiro ensaio ao projeto ativo. Conferir instruções adicionais de Vault/criptografia se houver; uma cópia de dados sem a chave necessária não é recuperável.
6. Reconstituir regras, publicações Realtime e configurações necessárias conforme o guia e as migrações, sem executar limpezas históricas novamente fora dos guardas das migrações. Preservar `private.legacy_push_subscriptions_20261105` como arquivo histórico privado.
7. Restaurar Storage com os mesmos caminhos, verificar integridade e executar os critérios de aceite abaixo. Registrar tempo total, erros e resultados. Não chamar “backup validado” antes desse ensaio.

## Critérios de aceite e registro

- Comparar contagens por tabela/bucket, chaves e relacionamentos de perfis, prescrições, exercícios, avaliações, anamneses, agenda e conclusões. Não publicar linhas ou dados pessoais no relatório.
- Conferir conteúdo e hash de cada arquivo, links privados, regras de acesso entre dois usuários fictícios e acesso administrativo. Uma restauração que apenas importa linhas não comprova RLS.
- Testar login/recuperação com contas fictícias do ambiente isolado, treino completo, retomada e sincronização, arquivos e leitura de avisos. Bloquear envio de push e integrações externas durante o ensaio.
- Registrar um resumo sem PII: data, versão do procedimento, quantidades, checksums agregados, duração e resultado. Não enviar esse resumo automaticamente para serviços externos.
- Definir com o responsável metas de perda tolerável (RPO), tempo de recuperação (RTO), frequência e retenção. Nenhum RPO/RTO foi medido ou garantido neste trabalho. Uma possibilidade operacional a aprovar é cópia diária, sete diárias e quatro semanais, com ensaio periódico e antes de mudanças de esquema relevantes.

Testes isolados disponíveis:

```powershell
node --test tests/storage-backup.test.mjs
```

Eles cobrem paginação, cifragem, integridade, falhas parciais, inventário alterado, prevenção de destino remoto e restauração/repetição com dados fictícios. Não equivalem a um ensaio real do banco nem comprovam disponibilidade do backup gerenciado.
