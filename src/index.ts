/**
 * Nirbhoy Proxy - Simple Bridge Worker
 * 
 * A minimal Cloudflare Worker that proxies requests to Supabase,
 * hiding the actual database URL from the frontend.
 */

interface Env {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
    SUPABASE_SERVICE_KEY: string;
    ALLOWED_ORIGINS: string;
    RATE_LIMIT_PER_MIN: string;
}

// Simple in-memory rate limiter (resets on worker restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, limit: number): boolean {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now > record.resetAt) {
        rateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
        return true;
    }

    if (record.count >= limit) {
        return false;
    }

    record.count++;
    return true;
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map(o => o.trim());

    const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info, Prefer, Range, Accept-Profile, Content-Profile",
        "Access-Control-Expose-Headers": "Content-Range, Range",
        "Access-Control-Max-Age": "86400",
    };

    // Check exact match or localhost subdomain pattern
    const isLocalhost = origin.match(/^http:\/\/(\w+\.)?localhost:\d+$/);
    const isAllowed = allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        (isLocalhost && allowedOrigins.some(o => o.includes("localhost")));

    if (isAllowed) {
        headers["Access-Control-Allow-Origin"] = origin;
        headers["Access-Control-Allow-Credentials"] = "true";
    }

    return headers;
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...headers,
        },
    });
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const corsHeaders = getCorsHeaders(request, env);

        // Handle CORS preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        // Health check
        if (url.pathname === "/health") {
            return jsonResponse({ status: "ok", timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Rate limiting
        const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";
        const rateLimit = parseInt(env.RATE_LIMIT_PER_MIN || "100", 10);

        if (!checkRateLimit(clientIP, rateLimit)) {
            return jsonResponse(
                { error: "Rate limit exceeded. Try again later." },
                429,
                corsHeaders
            );
        }

        // Proxy to Supabase
        try {
            // Build Supabase URL - strip /proxy prefix if present
            let targetPath = url.pathname;
            if (targetPath.startsWith("/proxy")) {
                targetPath = targetPath.replace("/proxy", "");
            }

            const supabaseUrl = `${env.SUPABASE_URL}${targetPath}${url.search}`;

            // Clone request headers
            const headers = new Headers(request.headers);

            // Use service key for server-side calls, anon key for client calls
            const authHeader = request.headers.get("Authorization");
            if (!authHeader) {
                headers.set("apikey", env.SUPABASE_ANON_KEY);
                headers.set("Authorization", `Bearer ${env.SUPABASE_ANON_KEY}`);
            } else {
                headers.set("apikey", env.SUPABASE_ANON_KEY);
            }

            // Forward request to Supabase
            const supabaseResponse = await fetch(supabaseUrl, {
                method: request.method,
                headers,
                body: request.method !== "GET" && request.method !== "HEAD"
                    ? await request.text()
                    : undefined,
            });

            // Clone response and add CORS headers
            const responseHeaders = new Headers(supabaseResponse.headers);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                responseHeaders.set(key, value);
            });

            return new Response(supabaseResponse.body, {
                status: supabaseResponse.status,
                statusText: supabaseResponse.statusText,
                headers: responseHeaders,
            });

        } catch (error) {
            console.error("Proxy error:", error);
            return jsonResponse(
                { error: "Proxy error", message: error instanceof Error ? error.message : "Unknown error" },
                500,
                corsHeaders
            );
        }
    },
};
