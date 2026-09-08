"use client";

// GOMBUONE — Formulário de criação de oportunidades (Fase 1)
//
// Fluxo de imagem (conforme especificação):
//   Browser → seleção → Canvas redimensiona (máx. 800px largura, mantém
//   aspect ratio) → converte para WebP (qualidade ~80%) →
//   URL.revokeObjectURL() → POST /api/upload/image (FormData com WebP) →
//   servidor valida magic bytes + tamanho → Vercel Blob → URL pública →
//   POST /api/admin/opportunities com imageUrl.

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  ImagePlus,
  Loader2,
  RefreshCw,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import {
  createOpportunitySchema,
  MAX_UPLOAD_BYTES,
} from "@/lib/validators";

type CompanyOption = { id: string; name: string; slug: string };

// ---------- Compressão no cliente (Canvas → WebP) ----------

const MAX_WIDTH = 800;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Não foi possível carregar a imagem selecionada."));
    img.src = src;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    // toBlob assíncrono; devolve null se o formato não for suportado
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Redimensiona para máx. 800px de largura (mantendo o aspect ratio) e
 * converte para WebP com qualidade inicial de 0.8.
 * Se o resultado ainda exceder 2 MB, reduz a qualidade progressivamente.
 * IMPORTANTE: revoga o ObjectURL no fim (finally) para evitar memory leaks.
 */
async function compressImage(
  file: File
): Promise<{ blob: Blob; width: number; height: number; quality: number }> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);

    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "O seu navegador não suporta Canvas (necessário para comprimir a imagem)."
      );
    }
    ctx.drawImage(img, 0, 0, width, height);

    let quality = 0.8;
    let blob = await canvasToBlob(canvas, "image/webp", quality);

    // Fallback progressivo se ainda exceder o limite de 2 MB
    while (blob && blob.size > MAX_UPLOAD_BYTES && quality > 0.3) {
      quality = Math.max(0.3, quality - 0.15);
      blob = await canvasToBlob(canvas, "image/webp", quality);
    }

    if (!blob) {
      throw new Error(
        "Falha na conversão para WebP — o navegador pode não suportar este formato."
      );
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `Mesmo após compressão, a imagem excede 2 MB (${formatBytes(blob.size)}). Escolha uma imagem mais simples.`
      );
    }

    return { blob, width, height, quality };
  } finally {
    // OBRIGATÓRIO: libertar o ObjectURL para evitar memory leaks
    URL.revokeObjectURL(objectUrl);
  }
}

// ---------- Slug a partir do título (pt: remove acentos) ----------

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// ---------- Componente ----------

type ImageState =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "compressing" }
  | {
      kind: "ready";
      blob: Blob;
      previewUrl: string;
      originalSize: number;
      width: number;
      height: number;
      quality: number;
    };

export function NewOpportunityForm({ companies }: { companies: CompanyOption[] }) {
  const router = useRouter();

  // Campos do formulário
  const [companyId, setCompanyId] = useState<string>(companies[0]?.id ?? "");
  const [title, setTitle] = useState("");
  // Slug: estado derivado — automática a partir do título até o utilizador editar
  const [slugManual, setSlugManual] = useState<string | null>(null);
  const slug = slugManual ?? slugify(title);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [status, setStatus] = useState<"DRAFT" | "ACTIVE">("DRAFT");

  // Imagem
  const [image, setImage] = useState<ImageState>({ kind: "empty" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado de submissão
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Libertar o preview ao desmontar (evita memory leaks)
  useEffect(() => {
    return () => {
      if (image.kind === "ready") URL.revokeObjectURL(image.previewUrl);
    };
  }, []);

  const onFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      setError(null);
      const file = e.target.files?.[0];
      if (!file) return;

      // Limpar preview anterior
      setImage((prev) => {
        if (prev.kind === "ready") URL.revokeObjectURL(prev.previewUrl);
        return { kind: "compressing" };
      });

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setImage({
          kind: "error",
          message: "Tipo de imagem não suportado. Use JPEG, PNG ou WebP.",
        });
        return;
      }

      try {
        const result = await compressImage(file);
        const previewUrl = URL.createObjectURL(result.blob);
        setImage({
          kind: "ready",
          blob: result.blob,
          previewUrl,
          originalSize: file.size,
          width: result.width,
          height: result.height,
          quality: result.quality,
        });
        toast.success("Imagem comprimida no navegador", {
          description: `WebP · máx. 800px · qualidade ${Math.round(result.quality * 100)}%`,
        });
      } catch (err) {
        setImage({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Erro inesperado ao comprimir a imagem.",
        });
      } finally {
        // Permitir selecionar o mesmo ficheiro de novo
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    []
  );

  const removeImage = useCallback(() => {
    setImage((prev) => {
      if (prev.kind === "ready") URL.revokeObjectURL(prev.previewUrl);
      return { kind: "empty" };
    });
  }, []);

  // ---------- Submissão ----------

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (image.kind !== "ready") {
      setError("Selecione e comprima uma imagem antes de submeter.");
      return;
    }

    // Data de validade: fim do dia em Luanda (UTC+1) → 22:59:59Z
    const validUntilDate = validUntil
      ? new Date(`${validUntil}T22:59:59.000Z`)
      : null;

    const payload = {
      title,
      description,
      slug,
      imageUrl: "placeholder", // será substituída pela URL do Blob após upload
      location: location || undefined,
      validUntil: validUntilDate,
      companyId,
      status,
    };

    // Validação instantânea no cliente (mesmo esquema Zod do servidor,
    // SEM imageUrl — a URL do Blob só existe após o upload; o servidor
    // valida a imageUrl final de forma autoritativa).
    const { imageUrl: _placeholder, ...rest } = payload;
    const clientCheck = createOpportunitySchema
      .omit({ imageUrl: true })
      .safeParse(rest);
    if (!clientCheck.success) {
      const first = clientCheck.error.issues[0];
      setError(
        `${first?.path.join(".") ? `${first.path.join(".")}: ` : ""}${first?.message}`
      );
      return;
    }

    // 1) Upload da imagem comprimida
    setUploading(true);
    let imageUrl = "";
    try {
      const fd = new FormData();
      fd.append("file", image.blob, "imagem.webp");

      const uploadRes = await fetch("/api/upload/image", {
        method: "POST",
        body: fd,
      });

      if (!uploadRes.ok) {
        const data = (await uploadRes.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? `Falha no upload da imagem (HTTP ${uploadRes.status}).`
        );
      }

      const uploadData = (await uploadRes.json()) as { url: string };
      imageUrl = uploadData.url;
      toast.success("Imagem guardada no Vercel Blob");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro no upload da imagem."
      );
      setUploading(false);
      return;
    }
    setUploading(false);

    // 2) Criação da oportunidade
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, imageUrl }),
      });

      if (res.ok) {
        const data = (await res.json()) as { opportunity: { title: string } };
        toast.success("Oportunidade criada", {
          description: data.opportunity.title,
        });
        router.push("/admin");
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        data?.error ?? `Falha ao criar a oportunidade (HTTP ${res.status}).`
      );
    } catch {
      setError("Erro de rede ao criar a oportunidade.");
    } finally {
      setSubmitting(false);
    }
  }

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const busy = uploading || submitting;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Coluna esquerda: dados */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Dados da oportunidade</CardTitle>
            <CardDescription>
              Informação visível no feed público (Fase 2).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company">Empresa</Label>
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="company">
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Título</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Desconto de 20% no almoço"
                maxLength={100}
                required
              />
              <p className="text-xs text-stone-500">
                {title.length}/100 caracteres (mínimo 3)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlugManual(e.target.value)}
                placeholder="gerada-automaticamente-do-titulo"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                title="Apenas letras minúsculas, números e hífens"
                required
              />
              <p className="text-xs text-stone-500">
                Apenas letras minúsculas, números e hífens. Gerada
                automaticamente a partir do título (editável).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva a oportunidade em 10 a 500 caracteres…"
                maxLength={500}
                rows={4}
                required
              />
              <p className="text-xs text-stone-500">
                {description.length}/500 caracteres (mínimo 10)
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">
                  Localização{" "}
                  <span className="text-stone-400">(opcional)</span>
                </Label>
                <Input
                  id="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Luanda, Angola"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="validUntil">Válida até</Label>
                <Input
                  id="validUntil"
                  type="date"
                  value={validUntil}
                  min={tomorrow}
                  onChange={(e) => setValidUntil(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Estado</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as "DRAFT" | "ACTIVE")}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">
                    Rascunho (não visível no futuro feed)
                  </SelectItem>
                  <SelectItem value="ACTIVE">Ativa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Coluna direita: imagem */}
        <Card className="border-stone-200">
          <CardHeader>
            <CardTitle>Imagem da oportunidade</CardTitle>
            <CardDescription>
              É comprimida no navegador (máx. 800px, WebP ~80%) antes do
              upload. Limite de 2 MB após compressão.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              id="image-upload"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFileChange}
              className="sr-only"
              aria-label="Selecionar imagem"
            />

            {image.kind === "empty" && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 p-10 text-stone-500 transition-colors hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-600"
              >
                <ImagePlus className="h-10 w-10" />
                <span className="text-sm font-medium">
                  Clique para selecionar uma imagem
                </span>
                <span className="text-xs">
                  JPEG, PNG ou WebP · comprimida automaticamente
                </span>
              </button>
            )}

            {image.kind === "compressing" && (
              <div className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/50 p-10 text-emerald-700">
                <Loader2 className="h-10 w-10 animate-spin" />
                <span className="text-sm font-medium">
                  A comprimir a imagem (Canvas → WebP)…
                </span>
              </div>
            )}

            {image.kind === "error" && (
              <div className="space-y-3">
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{image.message}</AlertDescription>
                </Alert>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full"
                >
                  <ImagePlus className="h-4 w-4" />
                  Tentar outra imagem
                </Button>
              </div>
            )}

            {image.kind === "ready" && (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                  <img
                    src={image.previewUrl}
                    alt="Pré-visualização da imagem comprimida"
                    className="max-h-64 w-full object-contain"
                  />
                </div>
                <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
                  <p className="flex items-center gap-1.5 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Compressão concluída
                  </p>
                  <p className="mt-1 text-emerald-700">
                    {formatBytes(image.originalSize)} →{" "}
                    <strong>{formatBytes(image.blob.size)}</strong> ·{" "}
                    {image.width}×{image.height}px · WebP{" "}
                    {Math.round(image.quality * 100)}%
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Trocar imagem
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeImage}
                    className="text-red-600 hover:text-red-700"
                  >
                    Remover
                  </Button>
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed text-stone-500">
              A imagem é enviada para o servidor apenas após submeter o
              formulário. O servidor valida magic bytes (WebP real) e o
              limite de 2 MB antes de guardar no Vercel Blob.
            </p>
          </CardContent>
          <CardFooter className="text-xs text-stone-500">
            Fluxo: Canvas → WebP → <code>/api/upload/image</code> → Blob →{" "}
            <code>/api/admin/opportunities</code>
          </CardFooter>
        </Card>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={busy}
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={busy || image.kind !== "ready"}
        >
          {uploading ? (
            <>
              <UploadCloud className="h-4 w-4 animate-bounce" />
              A carregar imagem…
            </>
          ) : submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              A criar oportunidade…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" />
              Criar oportunidade
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
