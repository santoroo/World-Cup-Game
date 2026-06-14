import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Mounts the multiplayer WebSocket server onto Vite's own dev HTTP server (path
 * `/ws`), so the whole game lives on a single origin. That means one Cloudflare
 * tunnel pointed at the dev URL exposes both the app and the realtime server to
 * friends over the internet — no LAN, no second port, no extra process.
 *
 * The server module is loaded through Vite's SSR pipeline (ssrLoadModule), which
 * transpiles its TypeScript and keeps `ws` external — no bundling fragility.
 */
function multiplayerServer(): PluginOption {
  return {
    name: 'copa-multiplayer-server',
    apply: 'serve',
    async configureServer(server) {
      if (!server.httpServer) return; // not in middleware mode
      try {
        const mod = await server.ssrLoadModule('/server/gameServer.ts');
        // The dev server is a plain http.Server (no http2/https here).
        (mod as { attachGameServer: (s: import('node:http').Server) => void }).attachGameServer(
          server.httpServer as unknown as import('node:http').Server,
        );
      } catch (err) {
        server.config.logger.error(`[copa] failed to start multiplayer server: ${String(err)}`);
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), multiplayerServer()],
  server: {
    port: 5173,
    open: true,
    // Accept the public hostname a tunnel (Cloudflare/ngrok) presents, so the
    // app + /ws can be reached over the internet. The server still only binds to
    // localhost — friends reach it through the tunnel, never your LAN.
    allowedHosts: true,
  },
});
