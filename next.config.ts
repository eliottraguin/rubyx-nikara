import type { NextConfig } from "next";

// Un seul point d'entrée navigateur : le front appelle `/api` en même origine, Next le réécrit vers l'API FastAPI.
// RUBIX_API_URL est lue à la compilation / au démarrage de `next` (défaut : API locale).
const apiUrl = (process.env.RUBIX_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
