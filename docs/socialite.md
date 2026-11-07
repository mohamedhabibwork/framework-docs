# Social login

`@framework/socialite` signs users in through Google, GitHub, Apple or any OAuth 2
provider you define. It reuses `@framework/auth`: a social login ends in the same
session cookie as a password login, and identities link to your `users` table rather
than a second one.

## Setup

Export the table from your schema so Drizzle Kit generates its migration:

```ts
export { socialAccounts } from '@framework/socialite';
```

Add the config section, the provider and the routes:

```ts
// config
socialite: {
  providers: {
    google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET },
    github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET },
    apple: { clientId: 'com.example.web', teamId: '...', keyId: '...', privateKey: env.APPLE_P8 },
  },
  redirects: {
    google: 'https://app.example.com/api/v1/auth/social/google/callback',
    github: 'https://app.example.com/api/v1/auth/social/github/callback',
    apple: 'https://app.example.com/api/v1/auth/social/apple/callback',
  },
  successRedirect: '/welcome',
  failureRedirect: '/login',
  twoStepRedirect: '/login/two-step',
},

// providers, after the auth provider
createSocialiteProvider<AppConfig>(),

// routes
http.route('/api/v1/auth/social', socialiteRoutes({ session: config.auth.session, config: config.socialite }));
```

Validate the section with `socialiteConfigSchema`. It only accepts paths on your own
site for the three redirects, so a login can't become an open redirect. A configured
provider with no redirect or no driver fails boot.

## Routes

| Route                     | Purpose                                                                     |
| ------------------------- | --------------------------------------------------------------------------- |
| `GET /:provider/redirect` | Start a login                                                               |
| `GET /:provider/callback` | The provider returns here (`POST` for form-post providers such as Apple)    |
| `POST /:provider/link`    | Link the provider to the signed-in user                                     |
| `DELETE /:provider/link`  | Unlink it. If it was their only way in, they recover through password reset |

Every outcome redirects. A failure lands on `failureRedirect` with `?error=` and one
of these fixed codes:

| Code                  | Meaning                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `invalid_state`       | The flow didn't start in this browser, expired, or was already used |
| `provider_denied`     | The user declined, or the provider returned no code                 |
| `provider_error`      | The provider refused the exchange or couldn't be reached            |
| `email_in_use`        | A local account has this email and they may not be linked           |
| `email_unverified`    | The provider gave no verified email to register with                |
| `registration_closed` | `registration` is off and this identity has no account              |
| `already_linked`      | This identity belongs to another user                               |
| `two_step_required`   | The user has two-step login and `twoStepRedirect` isn't set         |

## How an identity becomes a user

1. **Already linked:** that user signs in.
2. **An account has the same email:** this fails with `email_in_use`, unless
   `linkByEmail` is on and both the provider and the local account verified the
   address. Then they're linked.
3. **Otherwise:** a new user is created if `registration` is on and the provider
   verified the email. Its password is random, so it signs in through the provider
   or password recovery.

**Leave `linkByEmail` off unless you trust your providers' verification.** Linking on
an email hands the local account to whoever controls that address at the provider.
Requiring both sides to be verified stops the two common attacks: claiming an address
at a provider that doesn't verify it, and pre-registering a local account for someone
else's address to keep its password after they link.

Users who want both can sign in and `POST /:provider/link`, which needs no email match.

**Two-step login still applies.** A user with TOTP on gets no session. They land on
`twoStepRedirect#challenge=...`, and your page sends that challenge and their code to
the auth package's two-step endpoint. Without a `twoStepRedirect`, these users can't
use social login.

Provider tokens aren't stored. They're used once to read the identity.

**Run with `auth.session.secure` on in production.** It gives the state cookie the
`__Host-` prefix, which stops a sibling subdomain planting one to force a login or a
link. Without it, the flow trusts any cookie sent to this host.

## Provider notes

- **Google:** uses PKCE, and `email_verified` from its userinfo endpoint.
- **GitHub:** uses PKCE. The email comes from `/user/emails`, because the public
  profile's address is free text. The default scopes include `user:email`.
- **Apple:** posts its callback cross-site, so its state cookie is `SameSite=None;
  Secure`, and the site must be on HTTPS. The identity comes from a signed id token,
  which carries no name, so the email stands in.

The built-in drivers have only run against a local stand-in for each provider, so
try each against the real service before relying on it.

## Custom providers

```ts
const gitlab = defineSocialDriver({
  name: 'gitlab',
  usesPkce: true,
  redirectUrl: ({ state, redirectUri, codeChallenge }) => `https://gitlab.com/oauth/authorize?...`,
  exchangeCode: async ({ code, redirectUri, codeVerifier }) => ({ accessToken: '...' }),
  fetchUser: async (accessToken) => ({
    id: '...',
    name: '...',
    email: '...',
    emailVerified: true, // only if the provider really verified it
    avatarUrl: null,
    raw: {},
  }),
});

createSocialiteProvider<AppConfig>({ drivers: [gitlab] });
```

List it under `socialite.providers` and `redirects` like the others. `emailVerified`
decides who can register and link, so never default it to `true`. To stop a request
safely, throw `FrameworkError('SOCIAL_PROVIDER_FAILED', ...)`, which reaches the user
as `provider_error`.

`socialite:providers` lists what's configured, without its secrets.
