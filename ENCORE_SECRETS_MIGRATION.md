# Encore Secrets Migration Status

**Status**: IN PROGRESS
**Started**: 2025-10-15
**Target**: Production-Ready Secret Management

---

## Migration Overview

Vaporform is migrating from `process.env` environment variables to Encore's built-in secrets manager for production-grade secret management with:
- Encrypted storage
- Environment-specific secrets (local/dev/prod)
- Built-in secret rotation
- Access control

Additionally, user-provided API keys are being encrypted at rest using PostgreSQL's pgcrypto extension.

---

## Completed Work

### Phase 1: Infrastructure ✅ COMPLETED

1. **Created `shared/secrets.ts`**
   - Centralized Encore secret definitions
   - 11 secrets defined (8 required, 3 optional)
   - Type-safe access throughout codebase
   - Comprehensive documentation

2. **Created `shared/config-validator.ts`**
   - Startup validation for all required secrets
   - Fail-fast with actionable error messages
   - Configuration status reporting
   - Integration ready for all services

3. **Created User Secret Encryption Migrations**
   - `users/migrations/4_enable_pgcrypto.up.sql` - Enable PostgreSQL encryption
   - `users/migrations/5_encrypt_user_secrets.up.sql` - Add encrypted column
   - Backward-compatible migration strategy

4. **Updated `users/secrets.ts`**
   - Automatic encryption of new user API keys
   - Automatic migration from plain text to encrypted storage
   - Decryption on read with Encore secret encryption key
   - Production-ready implementation

### Phase 2: Critical Service Migrations ✅ COMPLETED

5. **Migrated `shared/clerk-auth.ts`**
   - Uses `clerkSecretKey()` instead of `process.env.CLERK_SECRET_KEY`
   - Uses `clerkPublishableKey()` with dynamic JWKS URL derivation
   - Uses `clerkWebhookSecret()` for webhook verification
   - No hardcoded values

6. **Migrated `ai/agent-api.ts`**
   - Uses `anthropicAPIKey()` from Encore secrets as fallback
   - Uses `getUserAnthropicKey()` for encrypted user keys (priority)
   - Removed raw database query, using encrypted helper function

7. **Migrated `ai/project-generator.ts`**
   - Uses `anthropicAPIKey()` from Encore secrets as fallback
   - Uses encrypted `getUserAnthropicKey()` for user keys
   - Consistent with agent-api.ts pattern

8. **Created `scripts/setup-local-secrets.sh`** ✅
   - Interactive script for local development setup
   - Validates all required secrets
   - Supports optional secrets
   - Provides clear guidance and examples

---

## Remaining Work

### Phase 3: Additional Service Migrations

#### High Priority

9. **ai/terminal-agent-api.ts** - Anthropic API key usage
10. **vector/qdrant-manager.ts** - OpenAI + Qdrant configuration
11. **vfs/gridfs.ts** - MongoDB URI
12. **workspace/daytona-manager.ts** - Daytona credentials
13. **users/webhook.ts** - Clerk webhook secret
14. **organizations/webhook.ts** - Clerk webhook secret

#### Medium Priority

15. **shared/constants.ts** - BASE_DOMAIN and other config
16. Service initialization files - Add config validation calls

### Phase 4: Cleanup & Documentation

17. **Update `.env.example`** - Migration guide pointing to Encore secrets
18. **Update `CLAUDE.md`** - Complete Encore secrets documentation
19. **Update `README.md`** - Setup instructions with secrets
20. **Remove `.env` from production deployments** - Optional, keep for backward compat during transition

### Phase 5: Testing & Validation

21. **Test all services with Encore secrets**
22. **Verify encryption/decryption of user secrets**
23. **Test secret rotation procedures**
24. **Validate production deployment flow**

---

## Files Modified

### New Files (4)
- `shared/secrets.ts` - Encore secret definitions
- `shared/config-validator.ts` - Startup validation
- `scripts/setup-local-secrets.sh` - Local setup helper
- `ENCORE_SECRETS_MIGRATION.md` - This document

### Modified Files (5)
- `users/secrets.ts` - Encryption/decryption implementation
- `shared/clerk-auth.ts` - Encore secrets migration
- `ai/agent-api.ts` - Encore secrets + encrypted user keys
- `ai/project-generator.ts` - Encore secrets + encrypted user keys
- `users/migrations/` - pgcrypto setup (2 new migrations)

### Files To Modify (10 remaining)
- `ai/terminal-agent-api.ts`
- `vector/qdrant-manager.ts`
- `vfs/gridfs.ts`
- `workspace/daytona-manager.ts`
- `users/webhook.ts`
- `organizations/webhook.ts`
- `shared/constants.ts`
- `.env.example`
- `CLAUDE.md`
- `README.md`

---

## Secret Inventory

### Required Secrets (8)

| Secret Name | Purpose | Format | Validated |
|-------------|---------|--------|-----------|
| `ClerkSecretKey` | Clerk backend auth | `sk_test_...` / `sk_live_...` | ✅ |
| `ClerkPublishableKey` | Clerk frontend auth | `pk_test_...` / `pk_live_...` | ✅ |
| `ClerkWebhookSecret` | Webhook verification | `whsec_...` | ✅ |
| `AnthropicAPIKey` | Claude API (system fallback) | `sk-ant-...` | ✅ |
| `OpenAIAPIKey` | Vector embeddings | `sk-...` | ✅ |
| `MongoDBURI` | GridFS file storage | `mongodb://...` | ✅ |
| `QdrantURL` | Vector database | `http(s)://...` | ✅ |
| `UserSecretEncryptionKey` | User API key encryption | min 32 chars | ✅ |

### Optional Secrets (3)

| Secret Name | Purpose | Default |
|-------------|---------|---------|
| `QdrantAPIKey` | Qdrant authentication | None (if auth disabled) |
| `DaytonaAPIKey` | Workspace management | None (feature disabled) |
| `DaytonaAPIURL` | Daytona endpoint | `https://app.daytona.io/api` |

---

## Setup Instructions

### Local Development

```bash
# 1. Run the interactive setup script
./scripts/setup-local-secrets.sh

# OR manually set secrets:
encore secret set --type local ClerkSecretKey
encore secret set --type local ClerkPublishableKey
encore secret set --type local ClerkWebhookSecret
encore secret set --type local AnthropicAPIKey
encore secret set --type local OpenAIAPIKey
encore secret set --type local MongoDBURI
encore secret set --type local QdrantURL
encore secret set --type local UserSecretEncryptionKey

# 2. Optional secrets
encore secret set --type local DaytonaAPIKey
encore secret set --type local DaytonaAPIURL

# 3. Start infrastructure
./quick-start.sh

# 4. Run Encore with secrets
encore run
```

### Production Deployment

```bash
# Set production secrets via Encore CLI
encore secret set --type prod ClerkSecretKey
encore secret set --type prod ClerkPublishableKey
encore secret set --type prod ClerkWebhookSecret
encore secret set --type prod AnthropicAPIKey
encore secret set --type prod OpenAIAPIKey
encore secret set --type prod MongoDBURI
encore secret set --type prod QdrantURL
encore secret set --type prod UserSecretEncryptionKey

# Optional
encore secret set --type prod QdrantAPIKey
encore secret set --type prod DaytonaAPIKey
encore secret set --type prod DaytonaAPIURL

# Deploy
encore deploy
```

---

## Security Improvements

### Before Migration
- ❌ Secrets stored in `.env` files (plain text)
- ❌ User API keys stored in PostgreSQL as plain text
- ❌ No secret rotation
- ❌ Manual secret management
- ❌ Risk of committing secrets to git

### After Migration
- ✅ Secrets managed by Encore (encrypted)
- ✅ User API keys encrypted with pgcrypto (AES-256)
- ✅ Built-in secret rotation support
- ✅ Environment-specific secrets (local/dev/prod)
- ✅ Zero risk of exposing secrets in code
- ✅ Centralized secret access control

---

## Migration Checklist

### Infrastructure
- [x] Create `shared/secrets.ts`
- [x] Create `shared/config-validator.ts`
- [x] Create pgcrypto migrations
- [x] Update `users/secrets.ts` with encryption

### Services
- [x] `shared/clerk-auth.ts`
- [x] `ai/agent-api.ts`
- [x] `ai/project-generator.ts`
- [ ] `ai/terminal-agent-api.ts`
- [ ] `vector/qdrant-manager.ts`
- [ ] `vfs/gridfs.ts`
- [ ] `workspace/daytona-manager.ts`
- [ ] `users/webhook.ts`
- [ ] `organizations/webhook.ts`

### Documentation
- [x] Create setup script
- [x] Create migration status doc (this file)
- [ ] Update `.env.example`
- [ ] Update `CLAUDE.md`
- [ ] Update `README.md`

### Testing
- [ ] Test local development setup
- [ ] Test all API endpoints
- [ ] Verify user secret encryption/decryption
- [ ] Test secret rotation
- [ ] Validate production deployment

---

## Rollback Plan

If issues arise during migration:

1. **Keep `.env` files as backup** during transition period
2. **Database rollback**: Run down migrations to revert pgcrypto changes
3. **Code rollback**: Revert to commit before migration started
4. **Gradual migration**: Can migrate service-by-service if needed

---

## Next Steps

1. **Complete remaining service migrations** (6 files)
2. **Add startup validation** to all services
3. **Update documentation** (3 files)
4. **Test complete migration**
5. **Deploy to staging** for validation
6. **Deploy to production** with monitoring

---

## Support

For questions or issues:
- Review `CLAUDE.md` for architecture details
- Check `shared/secrets.ts` for secret definitions
- Run `./scripts/setup-local-secrets.sh` for guided setup
- Consult Encore docs: https://encore.dev/docs/primitives/secrets

---

**Last Updated**: 2025-10-15
**Next Review**: After Phase 3 completion
