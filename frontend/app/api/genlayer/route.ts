import { STUDIO_NEXT_CHAIN_ID, STUDIO_NEXT_RPC_URL } from "@/lib/dissent/network";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_RPC_BODY_BYTES = 1_000_000;

function responseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  headers.set("cache-control", "no-store");
  const retryAfter = upstream.headers.get("retry-after");
  if (retryAfter) headers.set("retry-after", retryAfter);
  return headers;
}

async function forward(body: string): Promise<Response> {
  try {
    const upstream = await fetch(STUDIO_NEXT_RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      cache: "no-store",
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: responseHeaders(upstream),
    });
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32098, message: "GenLayer RPC upstream unavailable." } },
      { status: 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  if (!body || new TextEncoder().encode(body).byteLength > MAX_RPC_BODY_BYTES) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid RPC request." } },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
  return forward(body);
}

export async function GET(): Promise<Response> {
  const id = 1;
  const upstream = await forward(JSON.stringify({
    jsonrpc: "2.0",
    id,
    method: "eth_chainId",
    params: [],
  }));
  let chainId: number | null = null;
  let rpcOk = false;
  try {
    const payload = await upstream.clone().json() as { result?: unknown };
    if (typeof payload.result === "string" && /^0x[0-9a-fA-F]+$/.test(payload.result)) {
      chainId = Number(BigInt(payload.result));
      rpcOk = upstream.ok && chainId === STUDIO_NEXT_CHAIN_ID;
    }
  } catch {
    rpcOk = false;
  }
  return Response.json(
    {
      ok: rpcOk,
      upstreamStatus: upstream.status,
      chainId,
      expectedChainId: STUDIO_NEXT_CHAIN_ID,
    },
    { status: rpcOk ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
