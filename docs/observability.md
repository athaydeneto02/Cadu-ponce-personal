# Verificações operacionais e sinais de falha

Implementado no código, sujeito à versão efetivamente publicada:

- `GET /api/health` / `HEAD /api/health`: sonda de banco com limite de tempo; retorna 200/`ok` ou 503/`unavailable`, sem dados de alunos. A resposta de sucesso pode ficar no cache da Vercel por 30 segundos. Não valida login, uploads, envio de push nem gravação de treinos.
- `node scripts/check-production.mjs`: leitura do site publicado, arquivo JS de entrada, manifest, service workers e health. Não cria usuário nem treino. Uma execução local aprovada não significa monitoramento contínuo.
- `.github/workflows/production-health.yml`: executa essa verificação a cada 30 minutos no GitHub Actions, depois que o workflow estiver na branch principal. Permite execução manual. O agendamento pode atrasar e depende de Actions habilitado; não oferece SLA.
- Falhas do navegador passam pelo ErrorBoundary e pelos handlers globais para `/api/client-error`, quando há sessão. O servidor registra eventos estruturados `client_error` nos Runtime Logs da Vercel. Categorias permitidas: `render`, `runtime`, `promise`, `asset`.
- O relatório de erro não inclui mensagem original, stack, UID nem conteúdo de formulário. Há deduplicação por categoria na página e limite por usuário no servidor. É um sinal de falha, não uma ferramenta completa de investigação.

## Rotina de investigação

1. Nos Runtime Logs da implantação correta, filtrar `client_error` e restringir o período. Anotar categoria e horário; verificar no mesmo período erros de APIs, timeouts e a versão implantada.
2. Se `health` responder 503, conferir configuração do servidor, disponibilidade Supabase e logs do banco. Não concluir que não existem treinos ou alunos a partir de uma leitura que falhou.
3. Para uma falha de sincronização, preservar os dados do navegador; verificar conexão, sessão ativa, mensagens de pendência e erros de RLS/validação. Não limpar IndexedDB/localStorage como primeiro passo.
4. Confirmar correção com os testes isolados pertinentes e com uma operação controlada no ambiente de testes. Não enviar push ou criar dados fictícios em produção apenas para medir disponibilidade.

## Limitações e itens ainda não configurados

O workflow de disponibilidade fornece uma verificação periódica. Não foi configurado um serviço dedicado de monitoramento nem um destino próprio de alertas por e-mail/WhatsApp. As notificações de falha de Actions dependem das preferências da conta GitHub. A retenção de logs depende do plano/configuração da Vercel e não foi confirmada. A coleta do navegador exige sessão; falhas antes do login, sem conexão ou quando o próprio bundle não inicia podem não chegar ao servidor. O limite/deduplicação reduz volume e também impede usar os eventos como contagem exata de todas as falhas.

Para fechar a operação, confirmar a execução do workflow, definir responsável/canal para incidentes, comprovar que um alerta controlado chega ao responsável e documentar a retenção. Um monitor dedicado é uma opção quando for necessário SLA. Nenhum alerta de teste foi enviado neste trabalho. Para recuperação de dados, seguir [backup e restauração](backup-restore.md).
