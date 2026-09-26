# Auth v2 specification

- Access token lifetime: 15 minutes.
- Refresh tokens are single use and rotate on every refresh.
- Revoked refresh tokens return `AUTH_REVOKED`.
