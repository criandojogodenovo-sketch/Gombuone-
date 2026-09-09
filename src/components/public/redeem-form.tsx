"use client";

// GOMBUONE — Fase 2 — Formulário de resgate do consumidor
//
// O consumidor pede o código ANG-XXXX desta oferta. O servidor deriva a
// atribuição do cookie HttpOnly (o formulário NUNCA envia attributionId).
// Após o sucesso, o código é exibido em destaque para apresentar ao balcão
// do comerciante (a validação do comerciante é a Fase 3).

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TicketCheck, Loader2, AlertCircle, Copy, Check } from "lucide-react";

interface RedeemFormProps {
  opportunitySlug: string;
}

type Result =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "success"; code: string; validUntil: string; repeated?: boolean };

export default function RedeemForm({ opportunitySlug }: RedeemFormProps) {
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [result, setResult] = useState<Result>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult({ kind: "submitting" });
    try {
      // Nome e WhatsApp são OPCIONAIS (política Fase 2): só enviamos campos
      // preenchidos — o servidor deduplica por cookie anónimo, nunca por
      // WhatsApp, e nunca envia 409 (repetição → 200 com o mesmo código).
      const payload: Record<string, string> = { opportunitySlug };
      if (name.trim()) payload.consumerName = name.trim();
      if (whatsapp.trim()) payload.consumerWhatsapp = whatsapp.trim();

      const res = await fetch("/api/redemptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redemption?: { code: string; validUntil: string };
      };
      if (!res.ok) {
        setResult({
          kind: "error",
          message: data.error ?? "Não foi possível concluir o resgate.",
        });
        return;
      }
      if (!data.redemption?.code) {
        setResult({
          kind: "error",
          message: "Resposta inválida do servidor.",
        });
        return;
      }
      // 201 (novo) e 200 (repetição idempotente com o MESMO código) são
      // ambos sucesso para o consumidor.
      setResult({
        kind: "success",
        code: data.redemption.code,
        validUntil: data.redemption.validUntil,
        repeated: res.status === 200,
      });
    } catch {
      setResult({
        kind: "error",
        message: "Erro de rede. Verifique a ligação e tente novamente.",
      });
    }
  }

  async function copyCode() {
    if (result.kind !== "success") return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard indisponível — o código está visível na mesma
    }
  }

  if (result.kind === "success") {
    const validDate = new Date(result.validUntil).toLocaleDateString("pt-PT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6"
      >
        <div className="flex items-center gap-2 text-emerald-800">
          <TicketCheck className="h-5 w-5" />
          <p className="text-sm font-semibold">
            Oferta resgatada com sucesso!
          </p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-emerald-900">
          Apresente este código no estabelecimento para validar a sua oferta:
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 rounded-xl border-2 border-dashed border-emerald-400 bg-white px-6 py-5">
          <span
            data-testid="redemption-code"
            className="select-all font-mono text-3xl font-bold tracking-[0.2em] text-emerald-700"
          >
            {result.code}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={copyCode}
            aria-label="Copiar código"
            className="h-8 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-emerald-700">
          Código válido até {validDate}. Guarde-o — cada número de WhatsApp só
          pode ter um código ativo por oferta.
        </p>
      </div>
    );
  }

  const submitting = result.kind === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 className="font-mono text-lg font-bold text-stone-900">
        Resgatar esta oferta
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">
        Peça o seu código de resgate (formato ANG-XXXX) e apresente-o no
        estabelecimento. Sem registo de conta — nome e WhatsApp são
        opcionais.
      </p>

      <div className="mt-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="consumer-name">Nome (opcional)</Label>
          <Input
            id="consumer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="O seu nome"
            minLength={2}
            maxLength={60}
            autoComplete="name"
            disabled={submitting}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="consumer-whatsapp">WhatsApp (opcional)</Label>
          <Input
            id="consumer-whatsapp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="+244923456789"
            inputMode="tel"
            pattern="\+2449[0-9]{8}"
            title="Formato angolano: +2449XXXXXXXX"
            autoComplete="tel"
            disabled={submitting}
          />
        </div>
      </div>

      {result.kind === "error" && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{result.message}</span>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className="mt-5 h-11 w-full bg-emerald-600 text-base text-white hover:bg-emerald-700"
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            A gerar o seu código…
          </>
        ) : (
          "Receber código de resgate"
        )}
      </Button>
      <p className="mt-3 text-center text-xs text-stone-500">
        Sem registo de conta — o código fica associado a este navegador;
        pedir de novo devolve o mesmo código.
      </p>
    </form>
  );
}
