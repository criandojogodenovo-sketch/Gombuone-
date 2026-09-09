# Relatório de testes da Fase 2 CORRIGIDA (execução local — 2026-09-09T11:31:42.548Z)

Alvo: http://localhost:3100 (execução local com banco real — PostgreSQL embutido)

- **TESTE A1** [PASS] Caso A: mesmo cookie + mesma oportunidade → reutiliza a MESMA Attribution — attr=9gzke6nu repetida=true linhas=1
- **TESTE A2** [PASS] Caso B: cookie ausente + mesmo IP → CRIA nova Attribution (IP nunca deduplica) — antes=1 depois=2 status=200
- **TESTE A3** [PASS] Multi-oportunidade: mapa do cookie preserva AMBAS as entradas — entradas=2 opp2-linhas=1
- **TESTE A4** [PASS] Cookie corrompido (3 variantes) → 200, cria Attribution válida, reseta cookie — variantes-ok=3/3 linhas=3→6
- **TESTE A5** [PASS] Caso F: cookie aponta para Attribution de outra oportunidade → NÃO reutiliza — nova-linha=true original-intacta=true
- **TESTE A6** [PASS] Caso G: cookie aponta para Attribution de outro distribuidor → NÃO reutiliza (anti-manipulação) — nova-linha=true credito-original-intacto=true
- **TESTE A7** [PASS] Cookie ausente → nova Attribution; IP gravado APENAS como auditoria — linhas=8→9 ip-audit=presente
- **TESTE B1** [PASS] Redemption SEM WhatsApp → 201 (campo opcional) — status=201 código=ANG-MH58 whatsapp-null=true
- **TESTE B2** [PASS] Redemption SEM nome → 201; sem nome E sem WhatsApp → 201 — sem-nome=201 sem-ambos=201 nome-null=true
- **TESTE B3** [PASS] Mesmo consumerDevice + mesma oportunidade: 1ª=201, 2ª=200, MESMO código, 1 linha — status=201/200 código=ANG-LYNY/ANG-LYNY iguais=true linhas=1
- **TESTE B4** [PASS] Mesmo WhatsApp + cookies diferentes → duas Redemptions permitidas (201+201) — status=201/201 códigos=ANG-TLXT/ANG-VMZ7 linhas=2
- **TESTE B5** [PASS] Cookie do consumidor apagado → nova identidade, nova Redemption (201) — status=201/201 nova-identidade=true
- **TESTE B6** [PASS] Cookie de Attribution forjado/inexistente/outra-oportunidade → resgate segue, attributionId=null — v1=201/null=true v2=201/null=true
- **TESTE B7** [PASS] Código ANG-XXXX: formato, sem 0/O/1/I, único na BD; gerador cobre 32 chars — bd=10 únicos-bd=true ambíguos=false amostras=1000/1000 (colisão estatística esperada ≤5) charset=true posições=32/32/32/32
- **TESTE C1** [PASS] 2 requisições simultâneas (mesmo device+opportunidade) → 1 código, 1 linha — status=200,201 código=ANG-WCQW linhas=1
- **TESTE C2** [PASS] 5 requisições simultâneas → exatamente 1 criação (201), restantes 200, mesmo código — criações-201=1 linhas=1 código=ANG-CYM5
- **TESTE S1** [PASS] Rate limit Attribution: 60 pedidos/10 min/IP → 429 no 61º — primeiro-429=61
- **TESTE S2** [PASS] Rate limit Redemption: 20/h/IP → 429 no 21º (com Retry-After) — primeiro-429=21 retry-after=true
- **TESTE S3** [PASS] SQL injection → 400 uniforme (Prisma parametrizado); banco intacto — estados=[400,400,400,400,400] oportunidades=3→3
- **TESTE S4** [PASS] XSS em nome/whatsapp → 400; nada persistido — nome=400 whatsapp=400 linhas=32→32
- **TESTE S5** [PASS] Payloads oversized → 400; servidor continua de pé — nome-10k=400 corpo-1mb=400 home=200
- **TESTE S6** [PASS] Mass assignment (code/status/id/attributionId/consumerDevice no corpo) → ignorados — status=201 código=ANG-X64H status-bd=REDEEMED device=01903085…
- **TESTE S7** [PASS] Cookie gombu_consumer forjado (não-UUID) → servidor gera identidade própria — status=201 identidade=34319cce… válida=true
- **TESTE S8** [PASS] GET públicos → 405; admin sem sessão → 401; /admin → redirect login — attr=405 red=405 admin-api=401 /admin=307 login=200
- **TESTE S9** [PASS] Oportunidades draft/expirada/inexistente → 404 uniforme (sem distinguir) — attr=[404,404,404] red=[404,404,404] corpos-únicos=1/1 linhas=0
- **TESTE S10** [PASS] Ref inexistente/malformado → 400 uniforme; nenhuma linha criada — inexistente=400 malformado=400 linhas=71→71
- **TESTE S11** [PASS] Cookies: HttpOnly + SameSite=Lax + Path=/ + Max-Age + Secure(produção) — attr=httpOnly:ok lax:ok path:ok secure:ok 30d=true | consumer=httpOnly:ok lax:ok path:ok secure:ok 1a=true
- **TESTE S12** [PASS] Segredos (senha admin, DATABASE_URL) ausentes do bundle cliente e do HTML — ficheiros=30 limpo
- **TESTE S13** [PASS] HTML da página pública sem IDs internos (attribution/consumer/distribuidor) — limpo
- **TESTE P1** [PASS] Página pública: 200 com/sem ?ref=; draft → 404 — com-ref=200 sem-ref=200 draft=404
- **TESTE P2** [PASS] Visita sem ?ref= (página e home) não cria Attribution — antes=72 depois=72
- **TESTE P3** [PASS] Login admin emite sessão (senha errada → 401); logout limpa o cookie — login=200 sessão=emitida senha-errada=401 logout=200 cookie-limpo=true

**TOTAL: 32 | PASS: 32 | FAIL: 0**

Política testada: Attribution dedup exclusivamente por cookie (IP nunca);
Redemption idempotente por (consumerDevice, opportunityId) — 201/200, nunca 409;
consumerName/consumerWhatsapp opcionais (WhatsApp nunca deduplica);
concorrência serializada (advisory lock + índice único parcial);
rate limiting, anti-enumeração, anti-mass-assignment e anti-XSS verificados.