import { NextResponse, type NextRequest } from 'next/server';

/**
 * Filtro rápido: sin cookie de sesión, todo lo que no sea público va a /login.
 * La validación real de la sesión (BD, expiración, rol) ocurre en el servidor en cada página y acción.
 */
const PUBLICAS = ['/login', '/instalacion', '/api/logo', '/favicon.ico', '/icon.svg'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Publicado en Vercel sin base conectada: todo muestra las instrucciones para conectarla
  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    if (pathname === '/sin-base') return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/sin-base';
    url.search = '';
    return NextResponse.rewrite(url);
  }
  if (PUBLICAS.some((p) => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  if (!req.cookies.get('siif_sesion')?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|fonts/).*)'] };
