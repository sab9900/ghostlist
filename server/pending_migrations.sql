-- Pending migrations — run once against ghostlist_dev
-- Check which are already applied first:
-- SELECT "MigrationId" FROM "__EFMigrationsHistory" WHERE "MigrationId" IN ('20260701000000_AddNemesis', '20260701100000_AddItemPriority');

-- ── 20260701100000_AddItemPriority ─────────────────────────────────────────
ALTER TABLE "GhostListItems"
    ADD COLUMN IF NOT EXISTS "Priority" integer NOT NULL DEFAULT 0;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260701100000_AddItemPriority', '9.0.0')
ON CONFLICT DO NOTHING;

-- ── 20260701000000_AddNemesis ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "NemesisExpenses" (
    "Id"                          uuid         NOT NULL,
    "GhostListId"                 uuid         NOT NULL,
    "EncryptedPayload"            text         NOT NULL,
    "PayloadInitializationVector" text         NOT NULL,
    "EncryptedReceiptKey"         varchar(100),
    "ReceiptBlobKey"              varchar(500),
    "Status"                      integer      NOT NULL,
    "CreatedAt"                   timestamptz  NOT NULL,
    "CreatedByDeviceId"           varchar(64),
    "CreatedByUserId"             varchar(64),
    CONSTRAINT "PK_NemesisExpenses" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_NemesisExpenses_GhostLists_GhostListId"
        FOREIGN KEY ("GhostListId") REFERENCES "GhostLists"("Id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "NemesisVerifications" (
    "Id"                uuid        NOT NULL,
    "ExpenseId"         uuid        NOT NULL,
    "VerifiedByUserId"  varchar(64) NOT NULL,
    "VerifiedAt"        timestamptz NOT NULL,
    CONSTRAINT "PK_NemesisVerifications" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_NemesisVerifications_NemesisExpenses_ExpenseId"
        FOREIGN KEY ("ExpenseId") REFERENCES "NemesisExpenses"("Id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "NemesisSettlements" (
    "Id"                          uuid        NOT NULL,
    "GhostListId"                 uuid        NOT NULL,
    "EncryptedPayload"            text        NOT NULL,
    "PayloadInitializationVector" text        NOT NULL,
    "IsPaidByPayer"               boolean     NOT NULL,
    "IsConfirmedByReceiver"       boolean     NOT NULL,
    "PaidAt"                      timestamptz,
    "ConfirmedAt"                 timestamptz,
    "PayerDeviceId"               varchar(64),
    "PayerUserId"                 varchar(64),
    "CreatedAt"                   timestamptz NOT NULL,
    CONSTRAINT "PK_NemesisSettlements" PRIMARY KEY ("Id"),
    CONSTRAINT "FK_NemesisSettlements_GhostLists_GhostListId"
        FOREIGN KEY ("GhostListId") REFERENCES "GhostLists"("Id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IX_NemesisExpenses_GhostListId_CreatedAt"
    ON "NemesisExpenses" ("GhostListId", "CreatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "IX_NemesisVerifications_ExpenseId_VerifiedByUserId"
    ON "NemesisVerifications" ("ExpenseId", "VerifiedByUserId");

CREATE INDEX IF NOT EXISTS "IX_NemesisSettlements_GhostListId"
    ON "NemesisSettlements" ("GhostListId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260701000000_AddNemesis', '9.0.0')
ON CONFLICT DO NOTHING;

-- ── 20260701100001_AddNotifyOnNemesis ──────────────────────────────────────
ALTER TABLE "DeviceSubscriptions"
    ADD COLUMN IF NOT EXISTS "NotifyOnNemesis" boolean NOT NULL DEFAULT TRUE;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260701100000_AddNotifyOnNemesis', '9.0.0')
ON CONFLICT DO NOTHING;
INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260701100001_AddNotifyOnNemesis', '9.0.0')
ON CONFLICT DO NOTHING;

-- ── 20260701200000_AddUserIdToDeviceSubscriptions ──────────────────────────
ALTER TABLE "DeviceSubscriptions"
    ADD COLUMN IF NOT EXISTS "UserId" character varying(64);

CREATE INDEX IF NOT EXISTS "IX_DeviceSubscriptions_UserId"
    ON "DeviceSubscriptions" ("UserId");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260701200000_AddUserIdToDeviceSubscriptions', '9.0.0')
ON CONFLICT DO NOTHING;

-- ── 20260718120000_AddNemesisSoftDelete ────────────────────────────────────
ALTER TABLE "NemesisExpenses"
    ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone;

ALTER TABLE "NemesisSettlements"
    ADD COLUMN IF NOT EXISTS "DeletedAt" timestamp with time zone;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20260718120000_AddNemesisSoftDelete', '9.0.0')
ON CONFLICT DO NOTHING;
