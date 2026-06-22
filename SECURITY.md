# Security & Threat Model

## What the server knows

GhostList is designed so that the server cannot read user content. The following table is an honest accounting of what the server does and does not have access to.

| Data | Server access |
|---|---|
| List content (items, names, chat messages) | **Never** — always AES-256-GCM ciphertext |
| Encryption keys | **Never** — keys are generated on-device and never transmitted to the server |
| User identities | **Never** — no accounts, no email addresses, no passwords |
| List existence | **Yes** — a list ID (UUID) and its creation timestamp exist in the database |
| TTL / expiry config | **Yes** — the configured lifetime of a list is stored in plaintext |
| Anonymous device identifiers | **Yes** — opaque client-generated strings used to route presence and read receipts; not linked to any real identity |
| Member count per list | **Yes** — derived from the member roster rows |
| Approximate geographic region | **Yes** — the `Accept-Language` header is sampled for aggregate locale statistics; individual records are not retained |
| Connection timing | **Yes** — standard server logs include IP addresses and request timestamps |

The server's zero-knowledge property is specifically about **content confidentiality**: an attacker with full database access cannot reconstruct any user-visible text, media, or list structure.

---

## Cryptographic design

- **Symmetric encryption**: AES-256-GCM. A unique key is derived per list using `window.crypto.subtle`.
- **Key exchange**: ECDH (P-256). When sharing a list, an ephemeral key pair is generated client-side. The wrapped key travels through the server as opaque ciphertext and is deleted after retrieval (one-time relay).
- **Key material at rest**: Keys exist only in the browser's in-memory state or, if the user opts in to persistence, in the platform's encrypted local storage (IndexedDB). They are never sent to the server.
- **IV/nonce**: A fresh 96-bit random nonce is generated for every encrypt operation. Nonces are stored alongside ciphertexts.

---

## Trust boundaries

```
[Client device]  ──plaintext──►  [Crypto layer]  ──ciphertext──►  [Server / DB]
                                      ▲
                                      │
                              Key never crosses
                              this boundary
```

The boundary that must never be crossed: **plaintext content must not reach the server, and keys must not leave the client**. Any change that violates this is a critical security bug regardless of intent.

---

## Known attack surface

### Enumeration
List IDs are UUIDs (v7, time-ordered). An attacker cannot enumerate all lists by brute force, but a targeted leak of a list ID exposes the existence of that list (not its content). List IDs should be treated as secrets and shared only via the app's share flow.

### Denial of service
The server accepts unauthenticated writes. Rate limiting is applied per IP address at the API layer (sliding window). SignalR connections are rate-limited at the hub filter layer per connection. There is no global circuit breaker; a sustained volumetric attack could exhaust database connections. Mitigation at the infrastructure layer (WAF, upstream rate limiting via nginx/CDN) is expected.

### Share relay abuse
The ECDH key-exchange relay (`/api/share`) stores ephemeral payloads in memory with a 5-minute TTL and deletes them on first read (one-time pickup). An attacker who races the legitimate recipient can steal the relay payload, but they would receive only the wrapped key ciphertext — decrypting it requires the recipient's private key, which never leaves the device. The share relay endpoint is rate-limited per IP.

### Metadata inference
The server knows that a list exists and how many members it has. An observer with database access can infer social graph information (which device IDs co-appear on which lists) even though content is encrypted. This is a known and accepted limitation of the current architecture.

### Server-side compromise
If the server is fully compromised, an attacker could serve a malicious client that exfiltrates keys before encryption. GhostList does not currently use Subresource Integrity (SRI) or a strict CSP that would prevent this. Protection against a compromised server is outside the current threat model.

### SignalR relay
Whisper messages are relayed by the server as opaque ciphertext blobs. The server cannot read them, but it can observe their timing and size. Ephemeral media (image/audio/video) relayed via SignalR is held in memory only for the duration of the relay — it is not persisted.

---

## Out of scope

- Protection against a compromised client device
- Side-channel attacks on the client-side crypto implementation
- Traffic analysis / timing correlation at the network level
- Key management after a device is lost or stolen (no remote wipe)

---

## Reporting a vulnerability

If you discover a vulnerability, please open a private security advisory on GitHub rather than a public issue.
