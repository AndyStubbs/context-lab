# Authentication overview

Clients authenticate with short-lived access tokens and a long-lived refresh token.

## Token refresh

Access tokens expire after 15 minutes. Call `POST /auth/refresh` with the refresh token to get
a new access token. Refresh tokens rotate on every use.

## Error codes

| Code | Meaning |
| ---- | ------- |
| `AUTH_EXPIRED` | The access token has expired. Refresh it. |
| `AUTH_REVOKED` | The refresh token was revoked. Sign in again. |

## Setup

### Install

Install the client library with `npm install @example/auth`.

## Upgrade

### Install

Upgrading from v1 needs a clean install: remove the old package first.
