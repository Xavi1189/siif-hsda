import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const r = await (await db()).query<{ logo: Uint8Array | null; logo_tipo: string | null }>('SELECT logo, logo_tipo FROM configuracion WHERE id = 1');
  const f = r.rows[0];
  if (!f?.logo || !f.logo_tipo) return new Response(null, { status: 404 });
  return new Response(Buffer.from(f.logo), {
    headers: {
      'Content-Type': f.logo_tipo,
      'Cache-Control': 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
