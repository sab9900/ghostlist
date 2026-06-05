import { Injectable } from '@angular/core';

export interface EncryptedPayload {
    ciphertext: string;
    iv: string;
}

export interface WrappedKeyBundle {
    wrappedKey: string;
    senderPublicKey: string;
}

const HKDF_INFO = new TextEncoder().encode('GhostList key exchange v1');

@Injectable({ providedIn: 'root' })
export class CryptoService {

    async generateKey(): Promise<string> {
        const key = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt'],
        );
        return this.exportRawB64(key);
    }

    async encrypt(plaintext: string, keyB64: string): Promise<EncryptedPayload> {
        const key = await this.importAesKey(keyB64);
        const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
        const buf = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            new TextEncoder().encode(plaintext),
        );
        return { ciphertext: this.bufToB64(buf), iv: this.bufToB64(iv) };
    }

    async decrypt(ciphertextB64: string, ivB64: string, keyB64: string): Promise<string> {
        const key = await this.importAesKey(keyB64);
        const buf = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: this.b64ToBuf(ivB64) },
            key,
            this.b64ToBuf(ciphertextB64),
        );
        return new TextDecoder().decode(buf);
    }

    async generateEcdhKeypair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
        const keypair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveBits'],
        );
        const publicKeyB64 = this.bufToB64(
            await crypto.subtle.exportKey('raw', keypair.publicKey),
        );
        return { publicKeyB64, privateKey: keypair.privateKey };
    }

    async wrapListKey(listKeyB64: string, receiverPublicKeyB64: string): Promise<WrappedKeyBundle> {

        const senderKeypair = await crypto.subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            ['deriveBits'],
        );

        const receiverPubKey = await this.importEcdhPublicKey(receiverPublicKeyB64);
        const wrapKey = await this.deriveAesKwKey(senderKeypair.privateKey, receiverPubKey, 'wrapKey');

        const listKey = await this.importAesKey(listKeyB64, true);
        const wrappedBuf = await crypto.subtle.wrapKey('raw', listKey, wrapKey, 'AES-KW');

        return {
            wrappedKey: this.bufToB64(wrappedBuf),
            senderPublicKey: this.bufToB64(
                await crypto.subtle.exportKey('raw', senderKeypair.publicKey),
            ),
        };
    }

    async unwrapListKey(
        wrappedKeyB64: string,
        senderPublicKeyB64: string,
        receiverPrivateKey: CryptoKey,
    ): Promise<string> {
        const senderPubKey = await this.importEcdhPublicKey(senderPublicKeyB64);
        const unwrapKey = await this.deriveAesKwKey(receiverPrivateKey, senderPubKey, 'unwrapKey');

        const aesKey = await crypto.subtle.unwrapKey(
            'raw',
            this.b64ToBuf(wrappedKeyB64),
            unwrapKey,
            'AES-KW',
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt'],
        );

        return this.exportRawB64(aesKey);
    }

    private async deriveAesKwKey(
        privateKey: CryptoKey,
        publicKey: CryptoKey,
        usage: 'wrapKey' | 'unwrapKey',
    ): Promise<CryptoKey> {
        const sharedBits = await crypto.subtle.deriveBits(
            { name: 'ECDH', public: publicKey },
            privateKey,
            256,
        );

        const hkdfKey = await crypto.subtle.importKey(
            'raw',
            sharedBits,
            'HKDF',
            false,
            ['deriveKey'],
        );

        return crypto.subtle.deriveKey(
            {
                name: 'HKDF',
                hash: 'SHA-256',
                salt: new Uint8Array(32),
                info: HKDF_INFO,
            },
            hkdfKey,
            { name: 'AES-KW', length: 256 },
            false,
            [usage],
        );
    }

    private importAesKey(keyB64: string, extractable = false): Promise<CryptoKey> {
        return crypto.subtle.importKey(
            'raw',
            this.b64ToBuf(keyB64),
            { name: 'AES-GCM' },
            extractable,
            ['encrypt', 'decrypt'],
        );
    }

    private importEcdhPublicKey(keyB64: string): Promise<CryptoKey> {
        return crypto.subtle.importKey(
            'raw',
            this.b64ToBuf(keyB64),
            { name: 'ECDH', namedCurve: 'P-256' },
            false,
            [],
        );
    }

    private async exportRawB64(key: CryptoKey): Promise<string> {
        return this.bufToB64(await crypto.subtle.exportKey('raw', key));
    }

    bufToB64(buf: ArrayBuffer | Uint8Array): string {
        const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
        let binary = '';
        const CHUNK = 8192;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
        const binary = atob(b64);
        const buf = new ArrayBuffer(binary.length);
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }
}
