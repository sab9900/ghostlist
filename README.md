# 👻 Ghost List

> Shared lists that vanish into thin air. The server knows nothing.

Ghost List is an end-to-end encrypted, real-time shared list and chat app. Lists are encrypted on-device before they ever touch the server — no accounts, no plaintext, no metadata. Just ciphertext the server can never read.

---

## How it works

When you create a list, a random AES-256-GCM key is generated in your browser. That key never leaves your device. Everything — list items, chat messages, list names — is encrypted with it before being sent. When you share a list with someone, the key travels directly between devices via an ephemeral ECDH relay, never through the server in readable form.

The server stores blobs. It has no idea what's in them.

```
Your device                    Server                    Their device
──────────                     ──────                    ────────────
[plaintext]                                              [plaintext]
    │                                                        ▲
    ▼  AES-256-GCM                                AES-256-GCM │
[ciphertext] ─────────────► [ciphertext] ────────────► [ciphertext]
                              (stored)
```

---

## Features

- **Zero-knowledge** — server stores only encrypted blobs, no auth, no user data
- **Real-time sync** — changes appear instantly via SignalR WebSockets
- **Shared lists** — invite others by sharing a link or scanning a QR code
- **Chat per list** — every list has a built-in encrypted chat
- **PWA + native** — installable as a web app or runs natively on iOS/Android via Capacitor
- **Dark & light mode** — follows system appearance
- **No account required** — ever

---

## Tech stack

| Layer | Technology |
|---|---|
| Client | Angular 22, NgRx Signals, TypeScript |
| Crypto | Web Crypto API — AES-256-GCM + ECDH |
| Realtime | SignalR (`@microsoft/signalr`) |
| Native | Capacitor 7 (iOS + Android) |
| Server | .NET 10, MediatR, Entity Framework Core |
| Database | PostgreSQL |
| Infra | Docker, nginx, Coolify |
| CI | GitHub Actions → GHCR |

---

## Project structure

```
ghostlist/
├── client/               # Angular PWA + Capacitor
│   ├── src/app/
│   │   ├── api/          # SignalR hub + REST service
│   │   ├── core/         # Models, crypto, storage
│   │   ├── features/     # Lists, list-detail, join, settings
│   │   └── store/        # NgRx Signal Store
│   └── Dockerfile
├── server/
│   ├── GhostList.Domain/
│   ├── GhostList.Application/   # MediatR commands + queries
│   ├── GhostList.Infrastructure/ # EF Core, PostgreSQL
│   └── GhostList.WebApi/        # Controllers, SignalR hub
│       └── Dockerfile
├── docker-compose.yml           # Local dev
├── docker-compose.coolify.yml   # Production (image-based)
└── .github/workflows/ci.yml
```

---

## Running locally

**Prerequisites:** Node.js 24+, .NET 10 SDK, PostgreSQL

```bash
# Clone
git clone https://github.com/sab9900/ghostlist.git
cd ghostlist

# Client
cd client
npm install --legacy-peer-deps
npm start             # http://localhost:4200

# Server (separate terminal)
cd server/GhostList.WebApi
# Set connection string in appsettings.Development.json (not committed)
dotnet run            # http://localhost:5000
```

Or with Docker:

```bash
cp .env.example .env
# Edit .env with your DB credentials
docker compose -f docker-compose.standalone.yml up
```

---

## Deployment

The CI pipeline builds both Docker images on every push to `main` and pushes them to GHCR. Coolify pulls and deploys via webhook.

```
push to main
    │
    ├── .NET tests
    ├── Angular build check
    │
    └── (if green) build + push images to ghcr.io/sab9900/ghostlist-{server,client}
                        │
                        └── trigger Coolify webhook → deploy
```

### Environment variables (production)

| Variable | Description |
|---|---|
| `DB_CONNECTION_STRING` | Npgsql connection string: `Host=...;Database=...;Username=...;Password=...` |

---

## Security model

- Encryption keys are generated client-side and **never sent to the server**
- Key sharing uses ECDH: a fresh key pair per share session, ephemeral relay via server (ciphertext only), key derived via HKDF
- The server has no authentication — it can't know who created what
- All data at rest on the server is AES-256-GCM ciphertext
- Lists have configurable TTLs; a background worker purges expired data

---

## License

GNU General Public License v3.0 — see [LICENSE](LICENSE)
