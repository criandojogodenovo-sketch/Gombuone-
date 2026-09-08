import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ImagePlus, Database, Lock, Rocket, Store } from "lucide-react";

export default function Home() {
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
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <Link href="/admin/login">Área administrativa</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-6 gap-1.5 rounded-full border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-700"
            >
              <Rocket className="h-3.5 w-3.5" />
              Fase 1 — Fundação
            </Badge>
            <h1 className="text-balance font-mono text-4xl font-bold tracking-tight text-stone-900 sm:text-5xl md:text-6xl">
              Campanhas e{" "}
              <span className="bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent">
                oportunidades
              </span>{" "}
              locais
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-stone-600">
              A plataforma que liga empresas, distribuidores e consumidores.
              A Fase 1 estabelece a fundação: gestão administrativa de
              oportunidades com upload seguro de imagens e base de dados
              serverless.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 bg-emerald-600 px-8 text-base text-white hover:bg-emerald-700"
              >
                <Link href="/admin/login">Entrar na administração</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Estado da plataforma */}
        <section className="border-t border-stone-200 bg-white">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center font-mono text-2xl font-bold text-stone-900">
              Estado da plataforma
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-stone-600">
              Implementação progressiva por fases — a Fase 1 entrega a
              fundação funcional e segura.
            </p>

            <div className="mt-10 grid gap-6 md:grid-cols-3">
              <Card className="border-emerald-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-stone-900">
                      <ShieldCheck className="h-5 w-5 text-emerald-600" />
                      Segurança
                    </CardTitle>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      Ativo
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-stone-600">
                  <ul className="list-inside list-disc space-y-2">
                    <li>Autenticação administrativa com cookie assinado (HMAC)</li>
                    <li>Upload com validação por magic bytes (WebP real)</li>
                    <li>Segredos apenas em variáveis de ambiente</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-emerald-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-stone-900">
                      <ImagePlus className="h-5 w-5 text-emerald-600" />
                      Gestão de oportunidades
                    </CardTitle>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                      Ativo
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-stone-600">
                  <ul className="list-inside list-disc space-y-2">
                    <li>Formulário administrativo com compressão no cliente</li>
                    <li>Imagens convertidas para WebP (máx. 800px, 2 MB)</li>
                    <li>Armazenamento no Vercel Blob</li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-stone-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base font-semibold text-stone-900">
                      <Store className="h-5 w-5 text-stone-500" />
                      Fluxos de negócio
                    </CardTitle>
                    <Badge variant="secondary">Fase 2+</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-stone-600">
                  <ul className="list-inside list-disc space-y-2">
                    <li>Feed público de oportunidades</li>
                    <li>Links de atribuição de distribuidores (?ref=)</li>
                    <li>Resgate e validação de códigos</li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Infraestrutura */}
        <section className="border-t border-stone-200 bg-stone-50">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-12 sm:px-6 md:grid-cols-4">
            {[
              {
                icon: Database,
                title: "Neon PostgreSQL",
                desc: "Base de dados serverless",
              },
              {
                icon: ImagePlus,
                title: "Vercel Blob",
                desc: "Storage de imagens",
              },
              {
                icon: Lock,
                title: "bcryptjs",
                desc: "Hash de PINs",
              },
              {
                icon: ShieldCheck,
                title: "Zod + file-type",
                desc: "Validação de dados",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-xl border border-stone-200 bg-white p-4"
              >
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    {item.title}
                  </p>
                  <p className="text-sm text-stone-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Rodapé fixo ao fundo */}
      <footer className="mt-auto border-t border-stone-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm text-stone-500 sm:flex-row sm:px-6">
          <p>GOMBUONE © 2026 — Campanhas e oportunidades locais</p>
          <p className="font-mono text-xs">gombuone.vercel.app</p>
        </div>
      </footer>
    </div>
  );
}
