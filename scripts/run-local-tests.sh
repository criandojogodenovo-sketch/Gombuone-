#!/bin/bash
# GOMBUONE — Fase 2 — Runner de testes local (HTTP real + banco real)
# Uso: bash scripts/run-local-tests.sh
#
# Passos: garante PG no ar → sobe next start (produção local, porta 3100)
# → aguarda prontidão → executa a suíte → para o servidor.
# Segredos vêm de .env.runtime.sh (gitignored).

set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.runtime.sh ]; then
  echo "ERRO: .env.runtime.sh não encontrado (crie com DATABASE_URL e ADMIN_MASTER_PASSWORD)"
  exit 1
fi
source .env.runtime.sh

# 1) PostgreSQL embutido no ar? (tenta conectar; senão sobe)
pg_up() {
  node -e "
const net = require('net');
const s = net.connect(5433, '127.0.0.1');
s.on('connect', () => { console.log('up'); process.exit(0); });
s.on('error', () => process.exit(1));
setTimeout(() => process.exit(1), 2000);
" 2>/dev/null
}

if ! pg_up; then
  echo "[runner] Subindo PostgreSQL embutido…"
  node scripts/local-pg.mjs start || exit 1
fi
echo "[runner] PostgreSQL OK"

# 2) Schema sincronizado? (força push + hardening — idempotentes)
echo "[runner] prisma db push…"
npx prisma db push --skip-generate 2>&1 | tail -2
echo "[runner] hardening (índice único parcial)…"
node scripts/db-hardening.mjs

# 3) Servidor de produção local na porta 3100 — SEMPRE reiniciado para
#    estado determinístico (rate limiting é em memória por processo)
stop_server() {
  pkill -f "next-server" 2>/dev/null
  pkill -f "next start -p 3100" 2>/dev/null
  for i in $(seq 1 10); do
    if curl -s -o /dev/null --max-time 2 http://localhost:3100/ 2>/dev/null; then
      sleep 1
    else
      return 0
    fi
  done
  return 0
}
stop_server
echo "[runner] Subindo next start -p 3100 (build atual)…"
setsid npx next start -p 3100 > .localpg/server.log 2>&1 < /dev/null &
for i in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 3 http://localhost:3100/ 2>/dev/null)
  if [ "$code" = "200" ]; then echo "[runner] Servidor UP (build $(date -r .next/BUILD_ID +%H:%M:%S 2>/dev/null || echo atual))"; break; fi
  sleep 2
done

# 4) Suíte completa (HTTP real + cookies reais + banco real)
echo "[runner] Executando suíte phase2-tests…"
node scripts/phase2-tests.mjs http://localhost:3100
SUITE_EXIT=$?

# 5) Para o servidor (o banco continua de pé para próximas execuções)
pkill -f "next start -p 3100" 2>/dev/null && echo "[runner] Servidor parado" || true

echo "[runner] FIM — exit da suíte: $SUITE_EXIT"
exit $SUITE_EXIT
