import { handle, ok } from "@/lib/api";
import { destroySession } from "@/lib/session";

/**
 * POST, not GET: a link prefetch or an <img> pointed at a GET logout would sign
 * the user out without them asking.
 */
export async function POST() {
  return handle(async () => {
    await destroySession();
    return ok({ success: true });
  });
}
