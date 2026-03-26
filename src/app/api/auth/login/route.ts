import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { verifyPassword } from '@/lib/password';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'E-mail e senha são obrigatórios' }, { status: 400 });
        }

        // TODO (Limitação Temporária Fase 2):
        // A model User possui restrição @@unique([clinicId, email]).
        // Como nossa UI de admin atual não solicita o "slug da clínica" no formulário de login,
        // usamos findFirst para pegar a primeira ocorrência global deste e-mail.
        // Na Fase 3 (multi-tenant real com gestão hierárquica), o login listará as clínicas 
        // disponíveis para aquele e-mail ou pedirá o ID da clínica na tela de login.
        const user = await prisma.user.findFirst({
            where: { email }
        });

        if (!user || !verifyPassword(password, user.passwordHash)) {
            return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
        }

        // Gerar JWT associando clinicId daquele adm logado
        const token = await signToken({
            userId: user.id,
            clinicId: user.clinicId,
            role: user.role
        });

        // Definir cookie da sessão
        const cookieStore = await cookies();
        cookieStore.set({
            name: 'auth_token',
            value: token,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
            maxAge: 60 * 60 * 24 // Duração de 1 dia na sessão
        });

        return NextResponse.json({ success: true, redirectUrl: '/admin/conversations' });
    } catch (error) {
        console.error('[AUTH_LOGIN_ERROR]', error);
        return NextResponse.json({ error: 'Erro interno ao processar login' }, { status: 500 });
    }
}
