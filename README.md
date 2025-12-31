# Nirbhoy Proxy

A simple Cloudflare Worker that acts as a secure bridge between the Next.js frontend and Supabase.

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Secrets

```bash
wrangler secret put SUPABASE_URL
# Enter: https://your-project.supabase.co

wrangler secret put SUPABASE_ANON_KEY
# Enter: your-anon-key

wrangler secret put SUPABASE_SERVICE_KEY
# Enter: your-service-role-key
```

### 3. Local Development

```bash
npm run dev
# Runs at http://localhost:8787
```

### 4. Deploy

```bash
npm run deploy
```

## Usage

Replace Supabase URL in your Next.js app with the worker URL:

```typescript
// Before
const supabaseUrl = "https://xxx.supabase.co"

// After  
const supabaseUrl = "https://nirbhoy-proxy.your-subdomain.workers.dev"
```

## Features

- ✅ CORS support for allowed origins
- ✅ Rate limiting (100 req/min per IP)
- ✅ Request forwarding to Supabase
- ✅ Health check at `/health`
# nirbhoy-proxy
