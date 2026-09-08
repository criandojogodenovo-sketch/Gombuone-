// GOMBUONE — POST /api/upload/image
//
// Upload seguro de imagens (WebP, máx. 2 MB) para o Vercel Blob.
//
// SEGURANÇA (regras da Fase 1):
// - BLOB_READ_WRITE_TOKEN é usado APENAS aqui (server-side, runtime Node).
//   O token NUNCA é exposto ao cliente.
// - NÃO confiamos no MIME type enviado pelo navegador: validamos os
//   MAGIC BYTES com `file-type` (um .txt renomeado para .webp é rejeitado).
// - Limite de 2 MB verificado duas vezes (File.size e buffer final).
// - O nome do ficheiro é SEMPRE gerado no servidor (crypto.randomUUID()).
//   Qualquer nome/path fornecido pelo cliente é ignorado → não existe
//   superfície para path traversal.

import { NextRequest, NextResponse } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { put } from "@vercel/blob";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/validators";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  // 1) Autenticação administrativa (verificação completa)
  const authed = await verifySessionToken(
    req.cookies.get(ADMIN_COOKIE_NAME)?.value
  );
  if (!authed) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // 2) FormData com o ficheiro
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Corpo do pedido inválido (FormData esperado)" },
      { status: 400 }
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Ficheiro não enviado (campo "file" em falta)' },
      { status: 400 }
    );
  }

  // 3) Limite de tamanho (2 MB)
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: `Ficheiro excede o limite de 2 MB (recebido: ${(file.size / 1024 / 1024).toFixed(2)} MB)`,
      },
      { status: 400 }
    );
  }

  // 4) Leitura e validação por MAGIC BYTES (não confiar no Content-Type)
  const buffer = Buffer.from(await file.arrayBuffer());

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Ficheiro vazio" }, { status: 400 });
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "Ficheiro excede o limite de 2 MB" },
      { status: 400 }
    );
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || detected.mime !== "image/webp") {
    return NextResponse.json(
      {
        error:
          "O ficheiro não é um WebP válido (validação por magic bytes falhou)",
        detected: detected?.mime ?? "desconhecido",
      },
      { status: 400 }
    );
  }

  // 5) Nome gerado no servidor — o nome do cliente é intencionalmente IGNORADO
  const filename = `${crypto.randomUUID()}.webp`;

  // 6) Upload para o Vercel Blob (server-side apenas)
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error("[upload] BLOB_READ_WRITE_TOKEN não configurado");
    return NextResponse.json(
      { error: "Storage de imagens não configurado no servidor" },
      { status: 500 }
    );
  }

  try {
    const blob = await put(filename, buffer, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    });

    return NextResponse.json(
      { url: blob.url, size: buffer.byteLength, pathname: filename },
      { status: 201 }
    );
  } catch (e) {
    console.error("[upload] Erro no Vercel Blob:", e);
    return NextResponse.json(
      { error: "Falha ao guardar a imagem no storage" },
      { status: 500 }
    );
  }
}
