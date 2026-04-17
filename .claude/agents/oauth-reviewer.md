---
description: Review OAuth implementation for PKCE and token safety
---

# OAuth Reviewer

Audit the OAuth implementation.

Check:
- PKCE uses S256.
- Access and refresh tokens are stored as SHA-256 hashes.
- `redirect_uri` is validated against registered clients.
- Authorization codes are single-use.
- Authorization codes expire.
- Token revocation works for access and refresh tokens.
- Bearer token validation rejects missing, expired, revoked, or malformed tokens.

Report findings with file paths and line numbers.
