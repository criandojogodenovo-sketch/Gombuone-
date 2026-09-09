// GOMBUONE — Fase 2 — PostgreSQL local embarcado para testes com BANCO REAL
//
// Uso:
//   node scripts/local-pg.mjs start   → inicializa (initdb se preciso) + sobe o PG
//   node scripts/local-pg.mjs stop    → desce o PG (dados persistem em .localpg/)
//
// O servidor sobe em 127.0.0.1:5433 (user/pass postgres/postgres, database
// "gombuone"):
//   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/gombuone?schema=public
//
// IMPORTANTE: o postgres é lançado com setsid (sessão desanexada) para
// sobreviver ao encerramento deste processo e do comando shell que o invocou
// (ambientes de sandbox matam grupos de processos inteiros). O stop usa
// pg_ctl -m fast.
//
// Dados persistem (.localpg/) para iterar rápido; resetar:
//   rm -rf .localpg && node scripts/local-pg.mjs start
//   npx prisma db push && npx prisma db seed
//
// NÃO usar em produção — ferramenta exclusiva do ambiente de testes local.

import { existsSync, mkdirSync } from "fs";
import net from "net";
import { spawn } from "child_process";
import pg from "pg";

const NATIVE = "node_modules/@embedded-postgres/linux-x64/native/bin";
const INITDB = `${NATIVE}/initdb`;
const PGCTL = `${NATIVE}/pg_ctl`;
const POSTGRES = `${NATIVE}/postgres`;
const DATA_DIR = ".localpg/data";
const LOG = ".localpg/postgres.log";
const PORT = 5433;
const DB_NAME = "gombuone";

const command = process.argv[2] ?? "start";

function waitTcp(port, timeoutMs = 20000, expectOpen = true) {
  return new Promise((resolve) => {
    const started = Date.now();
    const tryOnce = () => {
      const s = net.connect({ host: "127.0.0.1", port }, () => {
        s.destroy();
        resolve(expectOpen ? true : tryLater());
      });
      s.on("error", () => resolve(expectOpen ? tryLater() : true));
      setTimeout(() => s.destroy(), 1000);
    };
    const tryLater = () => {
      if (Date.now() - started > timeoutMs) resolve(!expectOpen);
      else setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

function run(cmd, args, { wait = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: wait ? "pipe" : "ignore" });
    let out = "";
    if (wait) {
      child.stdout?.on("data", (d) => (out += d));
      child.stderr?.on("data", (d) => (out += d));
    }
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} exit ${code}: ${out}`))));
  });
}

async function createDatabase() {
  const client = new pg.Client({
    host: "127.0.0.1",
    port: PORT,
    user: "postgres",
    password: "postgres",
  });
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [DB_NAME]
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${DB_NAME}"`);
    console.log(`[local-pg] Database "${DB_NAME}" criada`);
  } else {
    console.log(`[local-pg] Database "${DB_NAME}" já existia`);
  }
  await client.end();
}

try {
  if (command === "stop") {
    await run(PGCTL, ["-D", DATA_DIR, "-m", "fast", "stop"]).catch(() => {});
    const closed = await waitTcp(PORT, 10000, false);
    console.log(
      closed
        ? "[local-pg] PostgreSQL parado (dados mantidos em .localpg/)"
        : "[local-pg] PostgreSQL parado (porta fechada)"
    );
  } else if (command === "start") {
    mkdirSync(".localpg", { recursive: true });
    if (!existsSync(`${DATA_DIR}/PG_VERSION`)) {
      console.log("[local-pg] Cluster novo — initdb…");
      await run(INITDB, ["-D", DATA_DIR, "--username=postgres", "--pwfile=/dev/stdin"], {}).catch(
        async () => {
          // fallback: pwfile via arquivo temporário
          const { writeFileSync, unlinkSync } = await import("fs");
          writeFileSync(".localpg/pw", "postgres");
          try {
            await run(INITDB, ["-D", DATA_DIR, "--username=postgres", "--pwfile=.localpg/pw"]);
          } finally {
            unlinkSync(".localpg/pw");
          }
        }
      );
      console.log("[local-pg] Cluster inicializado (usuário postgres)");
    }
    // sobe o postgres em SESSÃO DESANEXADA (setsid) — sobrevive ao fim deste
    // processo e do comando shell que o chamou
    const detached = spawn(
      "setsid",
      [POSTGRES, "-D", DATA_DIR, "-p", String(PORT), "-k", "/tmp"],
      { stdio: "ignore", detached: true }
    );
    detached.unref();
    const ready = await waitTcp(PORT, 20000, true);
    if (!ready) throw new Error("postgres não abriu a porta 5433 no tempo esperado");
    console.log(`[local-pg] PostgreSQL rodando em 127.0.0.1:${PORT} (sessão desanexada)`);
    await createDatabase();
    console.log(
      "[local-pg] DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/gombuone?schema=public"
    );
    process.exit(0);
  } else {
    console.error(`[local-pg] Comando desconhecido: ${command} (use start|stop)`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`[local-pg] ERRO (${command}):`, err);
  process.exit(1);
}
