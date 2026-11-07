# Tenancy

`@framework/tenancy` serves several customers from one application and keeps their data
apart. A tenant is resolved per request and carried through everything that request awaits.

## Setup

```ts
(createTenancyProvider<AppConfig>(), // providers: PostgreSQL tenants; export `tenants` from your schema
  http.use(
    tenancyMiddleware({
      resolvers: [subdomainResolver('example.com')], // or headerResolver(), pathResolver(), your own
      member: (principal, tenant) => isMember(principal.id, tenant.id), // required
    }),
  ));
```

Mount it after whatever installs the principal. No tenant, an unknown one or an inactive one
is a 404. **`member` is required, because a resolver only reads what the client sent,** so
without it any signed-in user could reach any tenant. `'any'` opts out explicitly.

Declare your own tenant type with `Register.tenant`, and read it with `requireTenant()`.

## Keeping rows apart

Add a tenant column and scope the repository:

```ts
class OrderRepository extends TenantScoped(BaseRepository<typeof orders>, 'tenantId') {}

defineResource(orders, { access, hidden: ['tenantId'], repository: OrderRepository });
```

Reads, updates and deletes filter on the column, creates stamp it whatever the caller sent,
and updates can't move a row to another tenant. With no tenant active, the repository throws
`TENANT_REQUIRED` rather than running unscoped. Mark the column `hidden` so clients neither
send nor see it.

`defineResource`'s `relations` load related rows directly, so scope them with a relation's
`where`, and index the tenant column.

## Schema per tenant

`runInTenantSchema(transactions, work)` runs `work` in a transaction whose `search_path` is
`tenant_<slug>`. The setting ends with the transaction, so a pooled connection can't carry it
to another request. You create those schemas and migrate them yourself for now.

## Other stores

`tenantKey('cart')` gives `tenants/<id>/cart`. Use it for cache, search and storage keys.
Nothing applies it for you, so a key built without it is shared across tenants.

`tenantJob(definition, store)` runs a job as the tenant that dispatched it. Dispatch with
`withTenant(payload)`, and never build `tenantId` from client input.

`runWithTenant(tenant, work)` covers scripts, schedules and other work outside a request.
