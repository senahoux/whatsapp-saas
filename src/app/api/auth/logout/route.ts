import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
    const cookieStore = await cookies();

    // Limpa o cookie o expurgando imediatamente
    cookieStore.set({
        name: 'auth_token',
        value: '',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0 // Força expiração imediata
    });

    return NextResponse.json({ success: true, redirectUrl: '/admin/login' });
}
