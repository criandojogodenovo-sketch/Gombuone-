// GOMBUONE — /admin/oportunidades/nova
// Server component: verifica a sessão completa, carrega empresas e renderiza
// o formulário de criação (com compressão de imagem no cliente).

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { NewOpportunityForm } from "@/components/admin/new-opportunity-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nova oportunidade",
};

export default async function NewOpportunityPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    redirect("/admin/login");
  }

  const companies = await db.company.findMany({
    select: { id: true, name: true, slug: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-1 text-sm text-stone-500 hover:text-stone-800"
              aria-label="Voltar ao painel"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Painel</span>
            </Link>
            <div className="hidden items-center gap-3 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 font-mono text-lg font-bold text-white">
                G
              </span>
              <p className="font-mono text-sm font-bold tracking-tight text-stone-900">
                GOMBUONE
              </p>
            </div>
          </div>
          <p className="text-sm font-medium text-stone-600">
            Nova oportunidade
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
          {companies.length === 0 ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Sem empresas registadas</AlertTitle>
              <AlertDescription>
                Execute o seed inicial (<code>npx prisma db seed</code>) para
                criar a empresa de teste antes de criar oportunidades.
              </AlertDescription>
            </Alert>
          ) : (
            <NewOpportunityForm companies={companies} />
          )}
        </div>
      </main>

      <footer className="mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 text-sm text-stone-500 sm:px-6">
          GOMBUONE · Fase 1 — Fundação
        </div>
      </footer>
    </div>
  );
}
