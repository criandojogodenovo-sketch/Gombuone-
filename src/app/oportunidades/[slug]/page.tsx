// GOMBUONE — Fase 2 — Página pública da oportunidade
//
// /oportunidades/<slug>                      → página da oferta
// /oportunidades/<slug>?ref=<refCode>        → link de distribuidor
//
// - Só renderiza oportunidades PÚBLICAS: status ACTIVE + validUntil futura.
//   Rascunho, expirada ou inexistente → 404 (sem enumeração).
// - O parâmetro ?ref= é validado em FORMATO no servidor antes de descer ao
//   componente de cliente (RefTracker); o POST de atribuição parte do cliente
//   e o servidor faz TODAS as validações (existência, role, desduplicação).
// - A atribuição viva permanece no cookie HttpOnly — nada de identificadores
//   internos é serializado para o HTML.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { REF_PATTERN } from "@/lib/validators";
import RefTracker from "@/components/public/ref-tracker";
import RedeemForm from "@/components/public/redeem-form";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, MapPin, Store, ArrowLeft, Clock } from "lucide-react";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ref?: string | string[] }>;
}

async function getPublicOpportunity(slug: string) {
  return db.opportunity.findFirst({
    where: {
      slug,
      status: "ACTIVE",
      validUntil: { gt: new Date() },
    },
    include: {
      company: { select: { name: true, slug: true } },
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const opportunity = await getPublicOpportunity(slug);
  if (!opportunity) {
    return { title: "Oferta não encontrada" };
  }
  return {
    title: `${opportunity.title} — ${opportunity.company.name}`,
    description: opportunity.description.slice(0, 150),
  };
}

export default async function OpportunityPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const opportunity = await getPublicOpportunity(slug);
  if (!opportunity) notFound();

  // ?ref= só é aceite com formato válido; qualquer outra coisa é ignorada
  const rawRef = Array.isArray(sp.ref) ? sp.ref[0] : sp.ref;
  const safeRef =
    typeof rawRef === "string" && REF_PATTERN.test(rawRef) ? rawRef : null;

  const validUntilLabel = new Date(opportunity.validUntil).toLocaleDateString(
    "pt-PT",
    { day: "2-digit", month: "long", year: "numeric" }
  );
  const daysLeft = Math.max(
    0,
    Math.ceil(
      (opportunity.validUntil.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    )
  );

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      {/* Cabeçalho */}
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 font-mono text-lg font-bold text-white">
              G
            </span>
            <span className="font-mono text-lg font-bold tracking-tight text-stone-900">
              GOMBUONE
            </span>
          </Link>
          <Button
            asChild
            variant="outline"
            className="border-stone-300 text-stone-700 hover:bg-stone-100"
          >
            <Link href="/">Todas as ofertas</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Ver todas as ofertas
          </Link>

          {/* Cartão da oferta */}
          <article className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="relative aspect-[16/9] w-full bg-stone-100">
              <img
                src={opportunity.imageUrl}
                alt={opportunity.title}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                  <Store className="h-3.5 w-3.5" />
                  {opportunity.company.name}
                </Badge>
                {daysLeft > 0 && daysLeft <= 7 && (
                  <Badge className="gap-1.5 bg-amber-100 text-amber-800 hover:bg-amber-100">
                    <Clock className="h-3.5 w-3.5" />
                    Termina em {daysLeft} dia{daysLeft === 1 ? "" : "s"}
                  </Badge>
                )}
              </div>

              <h1 className="mt-4 text-balance font-mono text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
                {opportunity.title}
              </h1>

              <div className="mt-4 flex flex-col gap-2 text-sm text-stone-600 sm:flex-row sm:gap-6">
                {opportunity.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 shrink-0 text-emerald-600" />
                    {opportunity.location}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 shrink-0 text-emerald-600" />
                  Válida até {validUntilLabel}
                </span>
              </div>

              <p className="mt-6 whitespace-pre-line text-pretty text-base leading-relaxed text-stone-700">
                {opportunity.description}
              </p>
            </div>
          </article>

          {/* Resgate */}
          <div className="mt-6">
            <RedeemForm opportunitySlug={opportunity.slug} />
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:px-6">
          <p>GOMBUONE © 2026 — Campanhas e oportunidades locais</p>
          <p className="font-mono text-xs">gombuone.vercel.app</p>
        </div>
      </footer>

      {/* Rastreador de referência — invisível; só age com ?ref= válido */}
      {safeRef && (
        <RefTracker opportunitySlug={opportunity.slug} refCode={safeRef} />
      )}
    </div>
  );
}
