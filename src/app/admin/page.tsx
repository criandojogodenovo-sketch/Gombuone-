// GOMBUONE — /admin (painel administrativo, Fase 1)
// Server component: verifica a sessão completa (HMAC) e lista oportunidades.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LogoutButton } from "@/components/admin/logout-button";
import { Plus, ImageOff, CalendarClock } from "lucide-react";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Africa/Luanda",
});

const statusStyles: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-600 hover:bg-stone-100",
  ACTIVE: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
  EXPIRED: "bg-amber-100 text-amber-700 hover:bg-amber-100",
  ARCHIVED: "bg-zinc-200 text-zinc-600 hover:bg-zinc-200",
};

const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  ACTIVE: "Ativa",
  EXPIRED: "Expirada",
  ARCHIVED: "Arquivada",
};

export const metadata = {
  title: "Painel administrativo",
};

export default async function AdminPage() {
  // Verificação completa da sessão (independente do middleware)
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    redirect("/admin/login");
  }

  const opportunities = await db.opportunity.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { company: { select: { name: true } } },
  });

  const total = opportunities.length;
  const active = opportunities.filter((o) => o.status === "ACTIVE").length;

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 font-mono text-lg font-bold text-white">
              G
            </span>
            <div>
              <p className="font-mono text-sm font-bold tracking-tight text-stone-900">
                GOMBUONE
              </p>
              <p className="text-xs text-stone-500">Painel administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              asChild
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Link href="/admin/oportunidades/nova">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nova oportunidade</span>
                <span className="sm:hidden">Nova</span>
              </Link>
            </Button>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <CardDescription>Total de oportunidades</CardDescription>
                <CardTitle className="font-mono text-3xl">{total}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-emerald-200">
              <CardHeader className="pb-2">
                <CardDescription>Ativas</CardDescription>
                <CardTitle className="font-mono text-3xl text-emerald-700">
                  {active}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card className="border-stone-200">
              <CardHeader className="pb-2">
                <CardDescription>Empresas registadas</CardDescription>
                <CardTitle className="font-mono text-3xl">
                  {new Set(opportunities.map((o) => o.company.name)).size}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card className="border-stone-200">
            <CardHeader>
              <CardTitle>Oportunidades recentes</CardTitle>
              <CardDescription>
                As últimas 20 oportunidades criadas (mais recentes primeiro).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {opportunities.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                  <p className="text-stone-500">
                    Ainda não existem oportunidades.
                  </p>
                  <Button
                    asChild
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <Link href="/admin/oportunidades/nova">
                      <Plus className="h-4 w-4" />
                      Criar a primeira
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {opportunities.map((o) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3"
                    >
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-md border border-stone-200 bg-stone-50">
                        {o.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={o.imageUrl}
                            alt={`Imagem da oportunidade ${o.title}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <ImageOff className="h-4 w-4 text-stone-300" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-900">
                          {o.title}
                        </p>
                        <p className="truncate text-xs text-stone-500">
                          {o.company.name} · {o.slug}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge className={statusStyles[o.status]}>
                          {statusLabels[o.status]}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-stone-400">
                          <CalendarClock className="h-3 w-3" />
                          até {dateTimeFmt.format(o.validUntil)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-stone-500 sm:px-6">
          GOMBUONE · Fase 1 — Fundação ·{" "}
          <span className="font-mono text-xs">gombuone.vercel.app</span>
        </div>
      </footer>
    </div>
  );
}
