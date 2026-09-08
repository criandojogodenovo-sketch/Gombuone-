import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GOMBUONE — Fase 1
  // TypeScript: NÃO ignorar erros de build (o build deve falhar se houver
  // erros de tipos — requisito de qualidade da Fase 1).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
};

export default nextConfig;
