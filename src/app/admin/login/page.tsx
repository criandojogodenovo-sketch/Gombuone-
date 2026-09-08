"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Eye, EyeOff, Lock, Loader2 } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError("Introduza a senha administrativa.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        data?.error ??
          "Não foi possível autenticar. Verifique a senha e tente novamente."
      );
    } catch {
      setError("Erro de rede. Verifique a ligação e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2"
        aria-label="Voltar à página inicial"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 font-mono text-xl font-bold text-white">
          G
        </span>
        <span className="font-mono text-xl font-bold tracking-tight text-stone-900">
          GOMBUONE
        </span>
      </Link>

      <Card className="w-full max-w-sm border-stone-200 shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <Lock className="h-5 w-5 text-emerald-600" />
            Painel administrativo
          </CardTitle>
          <CardDescription>
            Introduza a senha master para gerir oportunidades.
          </CardDescription>
        </CardHeader>

        <form onSubmit={onSubmit}>
          <CardContent className="space-y-4">
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="password">Senha administrativa</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                  aria-label={
                    showPassword ? "Ocultar senha" : "Mostrar senha"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-stone-500">
                Acesso protegido por cookie de sessão assinado (HttpOnly).
              </p>
            </div>
          </CardContent>

          <CardFooter className="mt-6 flex flex-col gap-3">
            <Button
              type="submit"
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  A autenticar…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
            <Link
              href="/"
              className="text-center text-sm text-stone-500 underline-offset-4 hover:text-stone-700 hover:underline"
            >
              Voltar à página inicial
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
