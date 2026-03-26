import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { cookies } from 'next/headers';

const getSecretKey = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error('FATAL: A variável de ambiente JWT_SECRET é obrigatória e não foi configurada.');
    }
    return new TextEncoder().encode(secret);
};

/**
 * Assina um payload JWT
 */
export async function signToken(payload: JWTPayload) {
    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h') // Sessão de 1 dia para o Admin
        .sign(getSecretKey());
}

/**
 * Verifica um token JWT
 */
export async function verifyToken(token: string) {
    try {
        const { payload } = await jwtVerify(token, getSecretKey());
        return payload;
    } catch (error) {
        return null;
    }
}


/**
 * Resgata e checa o token JWT dos cookies HTTP Only (Safe/Server Side)
 */
export async function getSession() {
    // Acesso ao cookie em App Router
    const cookieStore = await cookies();
    const token = cookieStore.get('auth_token')?.value;

    if (!token) return null;

    return await verifyToken(token);
}
