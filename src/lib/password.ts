import crypto from 'crypto';

/**
 * Hash seguro de senha via Scrypt (nativo Node.js)
 */
export function hashPassword(password: string): string {
    // Cria um salt aleatório
    const salt = crypto.randomBytes(16).toString('hex');
    // Deriva a chave com scryptSync
    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    // Retorna hash combinado "salt:key"
    return `${salt}:${derivedKey}`;
}

/**
 * Validação de senha frente ao hash gerado
 */
export function verifyPassword(password: string, hash: string): boolean {
    if (!hash || !hash.includes(':')) return false;

    const [salt, key] = hash.split(':');
    if (!salt || !key) return false;

    const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
    return key === derivedKey;
}
