// Tipe untuk built-server.mjs, dipakai skrip gate TypeScript (gate-content.ts).
export interface HttpResult {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

export interface BuiltServer {
  healthUrl: string
  /** Respons fetch /api/health saat server siap; undefined bila tidak menjawab. */
  response: Response | undefined
  stop(): Promise<void> | void
}

export function startBuiltServer(options: { port: string; label: string; timeoutMs?: number }): Promise<BuiltServer>
export function getWithHost(port: string, path: string, host: string): Promise<HttpResult>
export function requestWithHost(
  port: string,
  options: { method?: string; path: string; host: string; headers?: Record<string, string>; body?: unknown; rawBody?: Buffer },
): Promise<HttpResult>
