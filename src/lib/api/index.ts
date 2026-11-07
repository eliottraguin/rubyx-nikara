import { createHttpClient } from "./http";
import type { ApiClient } from "./types";

export * from "./types";

let client: ApiClient | null = null;

/**
 * Point d'accès unique à l'API. NEXT_PUBLIC_API_MODE=mock|http (défaut : mock).
 * Le mock est chargé dynamiquement pour ne pas alourdir le mode http.
 */
export async function loadApi(): Promise<ApiClient> {
  if (client) return client;
  if (process.env.NEXT_PUBLIC_API_MODE === "http") {
    client = createHttpClient();
  } else {
    const { createMockClient } = await import("@/mocks/client");
    client = createMockClient();
  }
  return client;
}

export const isMockMode = () => process.env.NEXT_PUBLIC_API_MODE !== "http";
