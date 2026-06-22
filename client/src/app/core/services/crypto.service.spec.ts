import { beforeEach, describe, expect, it } from 'vitest';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
    let svc: CryptoService;

    beforeEach(() => {
        svc = new CryptoService();
    });

    describe('AES-GCM encrypt / decrypt', () => {
        it('decrypts ciphertext to the original plaintext', async () => {
            const key = await svc.generateKey();
            const { ciphertext, iv } = await svc.encrypt('hello world', key);

            const result = await svc.decrypt(ciphertext, iv, key);

            expect(result).toBe('hello world');
        });

        it('produces a different ciphertext each call (fresh IV)', async () => {
            const key = await svc.generateKey();
            const first = await svc.encrypt('same text', key);
            const second = await svc.encrypt('same text', key);

            expect(first.ciphertext).not.toBe(second.ciphertext);
        });

        it('throws when the wrong key is used to decrypt', async () => {
            const key = await svc.generateKey();
            const wrongKey = await svc.generateKey();
            const { ciphertext, iv } = await svc.encrypt('secret', key);

            await expect(svc.decrypt(ciphertext, iv, wrongKey)).rejects.toThrow();
        });
    });

    describe('ECDH wrapListKey / unwrapListKey', () => {
        it('unwraps the list key with the matching private key', async () => {
            const originalKey = await svc.generateKey();
            const { publicKeyB64, privateKey } = await svc.generateEcdhKeypair();

            const bundle = await svc.wrapListKey(originalKey, publicKeyB64);
            const recovered = await svc.unwrapListKey(bundle.wrappedKey, bundle.senderPublicKey, privateKey);

            expect(recovered).toBe(originalKey);
        });

        it('fails when a different private key attempts unwrap', async () => {
            const originalKey = await svc.generateKey();
            const { publicKeyB64 } = await svc.generateEcdhKeypair();
            const { privateKey: wrongPrivate } = await svc.generateEcdhKeypair();

            const bundle = await svc.wrapListKey(originalKey, publicKeyB64);

            await expect(svc.unwrapListKey(bundle.wrappedKey, bundle.senderPublicKey, wrongPrivate)).rejects.toThrow();
        });
    });

    describe('ECDH wrapPayload / unwrapPayload', () => {
        it('unwraps the payload with the matching private key', async () => {
            const { publicKeyB64, privateKey } = await svc.generateEcdhKeypair();
            const plaintext = JSON.stringify({ foo: 'bar', count: 42 });

            const { encryptedPayload, iv, senderPublicKey } = await svc.wrapPayload(plaintext, publicKeyB64);
            const result = await svc.unwrapPayload(encryptedPayload, iv, senderPublicKey, privateKey);

            expect(result).toBe(plaintext);
        });

        it('fails when a different private key attempts unwrap', async () => {
            const { publicKeyB64 } = await svc.generateEcdhKeypair();
            const { privateKey: wrongPrivate } = await svc.generateEcdhKeypair();

            const { encryptedPayload, iv, senderPublicKey } = await svc.wrapPayload('data', publicKeyB64);

            await expect(svc.unwrapPayload(encryptedPayload, iv, senderPublicKey, wrongPrivate)).rejects.toThrow();
        });

        it('produces different ciphertext each call for the same plaintext', async () => {
            const { publicKeyB64 } = await svc.generateEcdhKeypair();
            const first = await svc.wrapPayload('same', publicKeyB64);
            const second = await svc.wrapPayload('same', publicKeyB64);

            expect(first.encryptedPayload).not.toBe(second.encryptedPayload);
        });
    });

    describe('sha256Hex', () => {
        it('produces the correct SHA-256 hex digest for the empty string', async () => {
            const result = await svc.sha256Hex('');
            expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        });

        it('returns a 64-character hex string', async () => {
            const result = await svc.sha256Hex('anything');
            expect(result).toHaveLength(64);
            expect(result).toMatch(/^[0-9a-f]+$/);
        });
    });

    describe('URL-safe base64', () => {
        it('toUrlSafeB64 replaces + with -, / with _, and strips padding', () => {
            const result = svc.toUrlSafeB64('abc+/def==');
            expect(result).toBe('abc-_def');
            expect(result).not.toContain('+');
            expect(result).not.toContain('/');
            expect(result).not.toContain('=');
        });

        it('round-trips a value whose length needs padding restoration', () => {
            // 'abc+/d==' → strip → 'abc-_d' (6 chars, 6 % 4 = 2, adds '==')
            const original = 'abc+/d==';
            const urlSafe = svc.toUrlSafeB64(original);
            const restored = svc.fromUrlSafeB64(urlSafe);
            expect(restored).toBe(original);
        });

        it('round-trips real crypto output (AES key) without data loss', async () => {
            const key = await svc.generateKey();
            const urlSafe = svc.toUrlSafeB64(key);
            const restored = svc.fromUrlSafeB64(urlSafe);
            expect(restored).toBe(key);
        });
    });

    describe('bufToB64 / b64ToBuf', () => {
        it('round-trips arbitrary bytes', () => {
            const bytes = new Uint8Array([0, 1, 127, 128, 255]);
            const b64 = svc.bufToB64(bytes);
            const result = svc.b64ToBuf(b64);
            expect(Array.from(result)).toEqual([0, 1, 127, 128, 255]);
        });
    });
});
