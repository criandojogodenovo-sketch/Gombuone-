"use client";

// GOMBUONE — Fase 2 — Rastreador de referência (?ref=)
//
// Componente de cliente INVISÍVEL montado na página da oportunidade.
// Quando a página é visitada com ?ref=<código> (link partilhado por um
// distribuidor), envia um único POST /api/attributions no carregamento.
//
// - O attributionId NUNCA passa pelo cliente: o servidor cria o registo e
//   escreve o cookie HttpOnly. Este componente só envia o código público.
// - Guarda em sessionStorage evita POSTs repetidos na mesma sessão
//   (a desduplicação REAL acontece no servidor, via cookie gombu_attr —
//   mesmo cookie + mesma oportunidade → mesma Attribution).
// - Silencioso por design: falhas de atribuição nunca quebram a navegação
//   nem revelam se o código era válido (a resposta é uniforme).

import { useEffect } from "react";

interface RefTrackerProps {
  opportunitySlug: string;
  refCode: string;
}

export default function RefTracker({
  opportunitySlug,
  refCode,
}: RefTrackerProps) {
  useEffect(() => {
    const storageKey = `gombu_attr_sent:${opportunitySlug}:${refCode}`;
    try {
      // Evita reenvios na mesma sessão (navegação de ida e volta)
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, "1");
    } catch {
      // sessionStorage indisponível (modo privado) — segue com o POST;
      // o servidor desduplica por cookie de qualquer forma.
    }

    const controller = new AbortController();
    fetch("/api/attributions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunitySlug, ref: refCode }),
      credentials: "same-origin",
      keepalive: true,
      signal: controller.signal,
    }).catch(() => {
      // Silencioso por design (ver comentário do módulo)
    });

    return () => controller.abort();
  }, [opportunitySlug, refCode]);

  return null;
}
