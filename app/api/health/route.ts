import { ok } from "@/lib/http";

export function GET() {
  return ok({
    service: "75-soft",
    status: "ok",
  });
}
