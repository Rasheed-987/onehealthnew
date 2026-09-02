import { createServer } from "node:http";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";

import {
  HEARTBEAT_MS,
  REALTIME_PATH,
  type ReadyEvent,
} from "@/lib/realtime/events";
import { addConnection } from "@/lib/realtime/hub";
import { tokenFromUpgrade, verifySessionToken } from "@/lib/sessionToken";


const dev = process.argv.includes("--dev");
// Cast: @types/node declares NODE_ENV readonly, which is a guardrail for app
// code. Setting it before anything else loads is exactly what a launcher does.
(process.env as Record<string, string>).NODE_ENV ??= dev
  ? "development"
  : "production";

const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

void app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

 
  const wss = new WebSocketServer({ noServer: true });
  const upgradeNext = app.getUpgradeHandler();

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", `http://${req.headers.host}`);

    /*
     * Everything else upgrading on this port is Next's own HMR socket in dev.
     * Taking over `upgrade` means Next no longer sees those, so they have to be
     * handed back explicitly - simply ignoring them leaves the socket hanging
     * and fast refresh silently stops working.
     */
    if (pathname !== REALTIME_PATH) {
      void upgradeNext(req, socket, head);
      return;
    }

    void (async () => {
      /*
       * The handshake is a normal HTTP request carrying the normal session, so
       * it is authenticated exactly the way every route is - cookie for the
       * browser, bearer token for a native app. Refusing here rather than after
       * the upgrade means an unauthenticated client never gets a socket at all.
       */
      const session = await verifySessionToken(tokenFromUpgrade(req));

      if (!session) {
        console.log("[WebSocket] Handshake rejected: Invalid or missing session token");
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }

      console.log(`[WebSocket] Client connected: User ${session.userId} (${session.role})`);

      wss.handleUpgrade(req, socket, head, (ws) => {
        register(ws, session.userId, session.role);
      });
    })();
  });

  server.listen(port, () => {
    console.log(
      `> Ready on http://${hostname}:${port} (websocket on ${REALTIME_PATH})`,
    );
  });
});

/** Wires one accepted socket into the hub and keeps it alive. */
function register(ws: WebSocket, userId: string, role: string): void {
  const remove = addConnection({
    userId,
    role: role as Parameters<typeof addConnection>[0]["role"],
    send: (payload) => {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    },
  });

  // Tells the client who it is, so it can decide for itself which messages are
  // its own - see the note on `WireMessage`.
  const ready: ReadyEvent = { type: "ready", userId };
  ws.send(JSON.stringify(ready));

  /*
   * Liveness, in both directions. A dropped connection - a laptop lid, a phone
   * leaving wifi - closes no TCP socket and would otherwise sit in the register
   * forever, being written to and read by nobody. The client sends its own ping
   * on a shorter interval to keep proxies from timing the connection out.
   */
  let alive = true;
  ws.on("pong", () => {
    alive = true;
  });

  const heartbeat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, HEARTBEAT_MS * 2);

  ws.on("message", () => {
    // The client only ever pings. Receiving anything at all is proof of life;
    // nothing it could say is acted on, because every write goes through the
    // REST routes where the authorisation rules already live.
    alive = true;
  });

  const close = () => {
    clearInterval(heartbeat);
    remove();
  };

  ws.on("close", close);
  ws.on("error", close);
}
