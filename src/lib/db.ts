import mongoose from "mongoose";
import { setServers as setDnsServers } from "node:dns/promises";

/**
 * Resolve DNS through Cloudflare and Google rather than whatever the machine
 * is configured with.
 *
 * A `mongodb+srv://` URI is not a hostname - the driver has to look up SRV and
 * TXT records for it first. Plenty of ISP and corporate resolvers answer those
 * with an empty result or REFUSED, which surfaces as
 * "querySrv ENOTFOUND / ENODATA" long before any connection is attempted.
 * Pinning public resolvers sidesteps that.
 *
 * Runs at module load, once per process, and is deliberately non-fatal: if the
 * runtime will not let us set resolvers, the OS defaults still work for most
 * networks and a plain `mongodb://` URI never needs SRV at all.
 */
try {
  setDnsServers(["1.1.1.1", "8.8.8.8"]);
} catch {
  // Not supported here (edge runtime, locked-down sandbox) - carry on.
}

/**
 * Cached Mongoose connection.
 *
 * Next.js reloads modules on every edit in dev and runs many concurrent
 * lambdas in production. Without this cache each of those opens a fresh
 * connection pool and Mongo eventually refuses new sockets, so the connection
 * and the in-flight promise are parked on `globalThis`.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var _mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = globalThis._mongooseCache ?? {
  conn: null,
  promise: null,
};
globalThis._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Copy .env.example to .env.local and fill it in.",
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      // Fail fast instead of silently queueing operations when disconnected.
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Clear the rejected promise so the next request retries the connection
    // rather than re-awaiting a permanently failed one.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}
