/**
 * Declaraciones de tipos ambientales para Supabase Edge Functions (Deno Runtime).
 * Permiten que el servidor de TypeScript del IDE resuelva tipos globales (Deno, Request)
 * y el especificador de módulo npm: incluso si la extensión de Deno no está activa.
 */

declare namespace Deno {
  interface Env {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): Record<string, string>;
  }

  const env: Env;

  type ServeHandler = (req: Request) => Response | Promise<Response>;

  interface ServeOptions {
    port?: number;
    hostname?: string;
    signal?: AbortSignal;
    onListen?: (params: { port: number; hostname: string }) => void;
    onError?: (error: unknown) => Response | Promise<Response>;
  }

  function serve(handler: ServeHandler): void;
  function serve(options: ServeOptions, handler: ServeHandler): void;
}

declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js';
}
