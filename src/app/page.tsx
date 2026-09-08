// GOMBUONE — Fase 2 — Feed público de oportunidades
//
// Página inicial pública: lista as ofertas ATIVAS e não expiradas
// (ordenadas pela validade mais próxima primeiro — urgência para o
// consumidor). Dados sempre frescos: force-dynamic (sem cache de build).
//
// Sem identificações internas no HTML: apenas slug, título, empresa,
// localização, imagem e validade. O botão leva à página da oferta, onde
// o fluxo de resgate acontece.

import Link from "next/link";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarDays,
  MapPin,
  Store,
  Sparkles,
  TicketCheck,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Home() {
  const opportunities = await db.opportunity.findMany({
    where: {
      status: "ACTIVE",
      validUntil: { gt: new Date() },
    },
    include: { company: { select: { name: true } } },
    orderBy: { validUntil: "asc" },
    take: 50,
  });

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
            <Link href="/admin/login">Área administrativa</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero compacto */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-10 sm:px-6 sm:pt-14">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-5 gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Ofertas de empresas locais
            </Badge>
            <h1 className="text-balance font-mono text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl">
              Ofertas ativas{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                perto de si
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-pretty text-base leading-relaxed text-stone-600">
              Peça o seu código de resgate (ANG-XXXX) e apresente-o no
              estabelecimento — sem contas, sem cartões.
            </p>
          </div>
        </section>

        {/* Feed */}
        <section className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          {opportunities.length === 0 ? (
            <div className="mx-auto max-w-md rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center">
              <TicketCheck className="mx-auto h-8 w-8 text-stone-400" />
              <p className="mt-3 font-medium text-stone-700">
                Sem ofertas ativas de momento
              </p>
              <p className="mt-1 text-sm text-stone-500">
                Volte em breve — novas oportunidades são publicadas
                regularmente.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {opportunities.map((opportunity) => {
                const validUntilLabel = new Date(
                  opportunity.validUntil
                ).toLocaleDateString("pt-PT", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                });
                return (
                  <Link
                    key={opportunity.id}
                    href={`/oportunidades/${opportunity.slug}`}
                    className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                  >
                    <div className="aspect-[16/9] w-full overflow-hidden bg-stone-100">
                      <img
                        src={opportunity.imageUrl}
                        alt={opportunity.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <Badge className="w-fit gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                        <Store className="h-3 w-3" />
                        {opportunity.company.name}
                      </Badge>
                      <h2 className="mt-3 text-balance font-mono text-base font-bold leading-snug text-stone-900">
                        {opportunity.title}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-600">
                        {opportunity.description}
                      </p>
                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-stone-100 pt-3 text-xs text-stone-500">
                        {opportunity.location ? (
                          <span className="inline-flex min-w-0 items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                            <span className="truncate">
                              {opportunity.location}
                            </span>
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
                          até {validUntilLabel}
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Rodapé */}
      <footer className="mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:px-6">
          <p>GOMBUONE © 2026 — Campanhas e oportunidades locais</p>
          <p className="font-mono text-xs">gombuone.vercel.app</p>
        </div>
      </footer>
    </div>
  );
}
