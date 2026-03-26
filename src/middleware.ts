import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Intercepta rotas /admin, sendo exclusão a de login
    if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
        const token = request.cookies.get('auth_token')?.value;

        if (!token) {
            console.log('[Auth] Nenhum token, redirecionando para login');
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }

        const payload = await verifyToken(token);

        if (!payload) {
            console.log('[Auth] Token inválido ou expirado, redirecionando para login');
            return NextResponse.redirect(new URL('/admin/login', request.url));
        }

        // Se token valeu, prossegue normalmente
        return NextResponse.next();
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/admin/:path*'],
};
