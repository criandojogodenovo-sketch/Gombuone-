# Relatório de testes da Fase 2 (execução local — 2026-09-08T19:44:26.817Z)

Alvo: http://localhost:3100

- **TESTE 13** [PASS] POST /api/attributions válido cria linha e emite cookie — status=200 attr=cmtt2ua4g0001oknqxfqe4r9k
- **TESTE 14** [PASS] Cookie = mapa JSON por opportunityId; HttpOnly+Secure+SameSite=Lax+Path=/+Max-Age=30d — mapa=ok flags=ok
- **TESTE 15** [PASS] Repetição (mesmo IP+ref) não duplica linha; cookie estável — antes=1 depois=1
- **TESTE 16** [PASS] Multi-oportunidade: mapa preserva AMBAS as entradas (sem sobreposição) — entradas=2
- **TESTE 17** [PASS] Ref inexistente → 400 uniforme (anti-enumeração), sem linha/cookie — status=400
- **TESTE 18** [PASS] Oportunidade DRAFT rejeitada (404) — status=404
- **TESTE 19** [PASS] Oportunidade expirada rejeitada (404) — status=404
- **TESTE 20** [PASS] Oportunidade inexistente rejeitada (404) — status=404
- **TESTE 21** [PASS] Corpos malformados → 400 (JSON, campos, charsets) — json-inválido:400 sem-ref:400 ref-ilegal:400 ref-com-simbolos:400 slug-ilegal:400
- **TESTE 22** [PASS] Página /oportunidades/[slug] renderiza (com e sem ?ref=) — com-ref=200 sem-ref=200
- **TESTE 23** [PASS] Visita sem ?ref= não cria linhas de atribuição — antes=2 depois=2
- **TESTE 24** [PASS] POST /api/redemptions com cookie → 201 + código + cookie consumidor — status=201 código=ANG-2QSJ
- **TESTE 25** [PASS] Formato do código ^ANG-[A-HJ-NP-Z2-9]{4}$ (sem 0/O/1/I) — código=ANG-2QSJ
- **TESTE 26** [PASS] Redemption vinculado à atribuição TESTREF01 (status REDEEMED, dados guardados) — attribution=cmtt2ua4g0001oknqxfqe4r9k
- **TESTE 27** [PASS] Multi-oportunidade: código distinto e vínculo TESTREF02 — código=ANG-A3YD
- **TESTE 28** [PASS] Resgate direto (sem cookie) → 201 com attributionId null — status=201 attribution=-
- **TESTE 29** [PASS] Cookie forjado revalidado no servidor → resgate direto (sem crédito falso) — status=201
- **TESTE 30** [PASS] Resgate de oportunidade expirada → 404 — status=404
- **TESTE 31** [PASS] Dados do consumidor inválidos → 400 (formato, XSS, ausência) — whatsapp-mal:400 whatsapp-letras:400 nome-curto:400 nome-tags:400 sem-campos:400
- **TESTE 32** [PASS] Duplicado → 409, sem segundo código — status=409
- **TESTE 33** [PASS] consumerDevice (UUID do cookie anónimo) persistido — device=4a60da5d-c5ea...
- **TESTE 34** [PASS] Spam de atribuição: 429 a partir do 61º; desduplicação segura a linha — primeiro-429=61 linhas=1
- **TESTE 35** [PASS] Spam de resgate: 429 a partir do 21º — primeiro-429=21 criados=20
- **TESTE 36** [PASS] SQL injection → 400 uniforme; BD intacta (Prisma parametrizado) — estados=[400,400,400,400,400] oportunidades=7
- **TESTE 37** [PASS] XSS no nome → 400 (charset de nomes) e nada guardado — status=400
- **TESTE 38** [PASS] Payloads oversized → 400; servidor continua de pé — estados=[400,400,400] home=200
- **TESTE 39** [PASS] Mapa forjado (múltiplas entradas) → resgate direto, sem créditos falsos — status=201 attribution=-
- **TESTE 40** [PASS] Sem enumeração: GET públicos 405; admin sem sessão 401; /admin redireciona — attr=405 red=405 admin=401 /admin=307
- **TESTE 41** [PASS] Nenhum segredo em .next/static nem no HTML (ficheiros: 30) — limpo
- **TESTE 42** [PASS] 1000 códigos: charset válido, não-sequencial, colisões dentro do esperado (≤5; unicidade garantida pela BD) — únicos=1000/1000 colisões=0 posições=32/32/32/32
- **TESTE 43** [PASS] POST /api/admin/opportunities sem sessão → 401; nada criado — status=401
- **TESTE 44** [PASS] Resposta 409 genérica — não revela o código já emitido — status=409 vazamento=false
- **TESTE 45** [PASS] Login admin com senha ROTACIONADA → sessão emitida — status=200 sessão=emitida

**TOTAL: 33 | PASS: 33 | FAIL: 0**