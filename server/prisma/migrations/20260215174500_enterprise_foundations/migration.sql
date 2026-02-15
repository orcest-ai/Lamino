-- AlterTable
ALTER TABLE "api_keys" ADD COLUMN "name" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "scopes" TEXT;
ALTER TABLE "api_keys" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "api_keys" ADD COLUMN "revokedAt" DATETIME;

-- CreateTable
CREATE TABLE "teams" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "teams_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "team_workspaces" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teamId" INTEGER NOT NULL,
    "workspaceId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_workspaces_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "team_workspaces_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "uuid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'system',
    "teamId" INTEGER,
    "createdBy" INTEGER,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_templates_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "prompt_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "prompt_template_versions" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "prompt" TEXT NOT NULL,
    "changelog" TEXT,
    "createdBy" INTEGER,
    "approvedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prompt_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prompt_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "prompt_template_versions_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "prompt_template_versions_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eventType" TEXT NOT NULL DEFAULT 'chat_completion',
    "userId" INTEGER,
    "workspaceId" INTEGER,
    "teamId" INTEGER,
    "apiKeyId" INTEGER,
    "chatId" INTEGER,
    "threadId" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "mode" TEXT,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER,
    "metadata" TEXT,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usage_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usage_events_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usage_events_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "usage_policies" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT NOT NULL DEFAULT 'system',
    "teamId" INTEGER,
    "workspaceId" INTEGER,
    "userId" INTEGER,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "rules" TEXT NOT NULL DEFAULT '{}',
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "usage_policies_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usage_policies_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usage_policies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "usage_policies_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "teams_slug_key" ON "teams"("slug");
CREATE INDEX "teams_createdBy_idx" ON "teams"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_teamId_userId_key" ON "team_members"("teamId", "userId");
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_workspaces_teamId_workspaceId_key" ON "team_workspaces"("teamId", "workspaceId");
CREATE INDEX "team_workspaces_teamId_idx" ON "team_workspaces"("teamId");
CREATE INDEX "team_workspaces_workspaceId_idx" ON "team_workspaces"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_uuid_key" ON "prompt_templates"("uuid");
CREATE UNIQUE INDEX "prompt_templates_teamId_slug_key" ON "prompt_templates"("teamId", "slug");
CREATE INDEX "prompt_templates_teamId_idx" ON "prompt_templates"("teamId");
CREATE INDEX "prompt_templates_createdBy_idx" ON "prompt_templates"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_template_versions_templateId_version_key" ON "prompt_template_versions"("templateId", "version");
CREATE INDEX "prompt_template_versions_templateId_idx" ON "prompt_template_versions"("templateId");
CREATE INDEX "prompt_template_versions_createdBy_idx" ON "prompt_template_versions"("createdBy");
CREATE INDEX "prompt_template_versions_approvedBy_idx" ON "prompt_template_versions"("approvedBy");

-- CreateIndex
CREATE INDEX "usage_events_eventType_idx" ON "usage_events"("eventType");
CREATE INDEX "usage_events_occurredAt_idx" ON "usage_events"("occurredAt");
CREATE INDEX "usage_events_userId_idx" ON "usage_events"("userId");
CREATE INDEX "usage_events_workspaceId_idx" ON "usage_events"("workspaceId");
CREATE INDEX "usage_events_teamId_idx" ON "usage_events"("teamId");
CREATE INDEX "usage_events_apiKeyId_idx" ON "usage_events"("apiKeyId");

-- CreateIndex
CREATE INDEX "usage_policies_scope_idx" ON "usage_policies"("scope");
CREATE INDEX "usage_policies_teamId_idx" ON "usage_policies"("teamId");
CREATE INDEX "usage_policies_workspaceId_idx" ON "usage_policies"("workspaceId");
CREATE INDEX "usage_policies_userId_idx" ON "usage_policies"("userId");
CREATE INDEX "usage_policies_createdBy_idx" ON "usage_policies"("createdBy");
