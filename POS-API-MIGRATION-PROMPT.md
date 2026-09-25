# Task: Wire Tablet POS to the standalone RASIDIFY-POS-API (same migration already done on Web POS)

## Background

The Web POS app (`D:\SHAHZAD\Rasidify 2.0\rasidify_pos`, Angular) used to call the dashboard's
invoicing API (`rasidify-api\repo-rasidify-invoicing_api\rasidify_api`, aka "the dashboard API")
directly for everything — the same "chatty" pattern the Tablet POS still uses today (single
`Config.API_URL` in `app/config.ts` → `https://api.rasidify.com/api`, one shared `axios` instance
in `app/services/api.ts`).

Between 2026-09-18 and 2026-09-24 that was replaced with a **separate, purpose-built backend**:

```
D:\SHAHZAD\Rasidify 2.0\RASIDIFY-POS-API
```

This is now a **fully standalone** ASP.NET Core (.NET 9) project — as of 2026-09-24 it has **zero
project-reference dependency** on the dashboard API (`rasidify_invoicing_api`). It has its own
copy of the whole `Services/`/`Models/`/`DBHelper/`/`SqlParamFactory/` layer (same namespaces on
purpose, `rasidify_invoicing_api.*`, so nothing upstream had to change), builds and publishes
independently, and is deployed live at `https://pos-api.rasidify.com/api`.

**Your job**: do the equivalent client-side migration for the Tablet POS (React Native/Expo,
`D:\SHAHZAD\Rasidify 2.0\rasidify-pos-tablet`) — point every endpoint below at
`RASIDIFY-POS-API` instead of the dashboard API, consolidating the old chatty per-screen call
pattern the same way Web POS's was. **Do not touch `RASIDIFY-POS-API` itself** unless you find a
genuine backend gap (see "If you find a gap" below) — it is a real deployed service other apps
depend on.

Read `D:\SHAHZAD\Rasidify 2.0\RASIDIFY-POS-APIS\POS-API-Plan.md` first — the original design doc
for this backend (endpoint shapes, why each consolidation exists, security decisions).

## Why this matters (carry this reasoning into the tablet app)

The Web POS migration wasn't just "change the base URL" — it fixed a real class of bugs along the
way that you should watch for here too:
- **Chatty calls**: `pages.component.ts`'s `ngOnInit` used to fire ~10+ separate dashboard calls
  (`user/get` x3, branch/tax/order-types/order-states/accounts/payment-methods/currencies/
  tax-settings/table-layout as 9 separate calls, plus a per-product-click config call). The POS
  API's `GET /pos/session/bootstrap?branchId=` and `GET /pos/catalog/menu` collapse almost all of
  that into 2 calls, with product variants/modifiers/combos/bundles inlined on each product so
  there's **no per-product-click network call** needed either.
- **Missing session caching**: `getPosBootstrap()` needed `shareReplay` caching (one fetch per
  session, invalidated on login/logout/device-switch) — and `getPosMenu()` was initially missed
  and kept refetching every screen re-entry until caught later. Check whatever the tablet app's
  equivalent of "re-mount on every screen navigation" is and cache accordingly.
- **Flattened response shape**: `/pos/catalog/menu` nests each product's own fields under a
  `product` key (`{product:{...}, variants, modifierGroups, comboGroups, comboItems,
  bundleItems}`) — Web POS had to flatten this (`{...item.product, variants, ...}`) to match its
  existing flat `Product` model. Check what shape the tablet app's product model expects and
  flatten/adapt similarly — don't assume the old dashboard `products/ALL` flat shape is what this
  endpoint returns.

## Full endpoint inventory to migrate (all live at `https://pos-api.rasidify.com/api`)

Auth (public, no JWT required for these two):
- `POST /pos/device/authenticate` — one-time device onboarding (DeviceCode → AuthenticatedCode)
- `POST /pos/device-login` — daily passcode login (DeviceUniqueID + AuthenticatedCode + Passcode)
- `POST /pos/login` — direct username/password login path (if the tablet app uses that flow too)

Session/catalog (JWT required from here down):
- `GET /pos/session/bootstrap?branchId=` — user/brand, branch, taxes, tax-settings, order
  types/states, active shift, table layout, currencies (static), payment methods, account types.
  Cache for session lifetime, invalidate on login/logout/device-switch.
- `GET /pos/catalog/menu` — categories + products with variants/modifierGroups/modifiers/
  comboGroups/comboItems/bundleItems all inlined. Cache for session lifetime.
- `GET /pos/catalog/stock` — lightweight `{productID, inHandQty}` only, no modifier/combo
  fan-out. Use for post-checkout inventory refresh — merge into existing product list by
  productID, don't replace the whole list (that would drop the inlined modifier/combo data).
- `GET /pos/customers`
- `POST /pos/customers` — create customer (moved from dashboard's `/invoicing/create/customer`
  on 2026-09-24)

Orders (Sell screen / checkout):
- `GET /pos/orders?status=&page=&pageSize=&search=&orderTypeID=&shiftID=`
- `GET /pos/order/{id}`
- `POST /pos/order/create` — checkout. Signs ZATCA inline where applicable and returns the real
  QR straight on the response (`invoice.zatcaQrCode` / `data.zatcaQrCode`) — no separate round
  trip needed for the receipt in the common case.
- `PUT /pos/order/{invoiceID}` — update (e.g. table transfer, note changes)
- `POST /pos/order/{invoiceId}/zatca/sign` — re-sign fallback for when create()'s inline QR
  didn't come back (async submission queue case)
- `POST /pos/invoice/payment/create` — record a payment against an invoice. **This is the one
  that was easiest to miss** — order creation moved on 2026-09-19 but payment recording was
  still silently hitting the dashboard API until caught on 2026-09-24. Audit the tablet app
  for the equivalent and make sure it's included in this pass, not left behind.

Shifts (full lifecycle, all under `/pos/shift...`):
- `GET /pos/shift/active`
- `POST /pos/shift/start`
- `POST /pos/shift/{id}/end`
- `GET /pos/shift/{id}/summary`
- `POST /pos/shift/{id}/cash-entry`
- `POST /pos/shift/{shiftID}/link-invoice/{invoiceID}`
- `GET /pos/shifts?dateFrom=&dateTo=&branchID=&statusID=&page=&pageSize=`
- `GET /pos/shift/{id}/zreport`

Tables (if the tablet app has table management for dine-in):
- table layout is bundled inside `/pos/session/bootstrap`, but live per-action table calls
  (occupy/release/transfer) — check `rasidify_pos`'s `table.service.ts` for the exact routes it
  still calls (some table actions were deliberately left calling a dashboard endpoint,
  `/table/layout/{branchId}`, since it needs to be live/uncached, not bundled into bootstrap —
  confirm whether that one has a POS-API equivalent yet or still needs one).

## Reference implementation (read these before writing tablet code)

- `D:\SHAHZAD\Rasidify 2.0\rasidify_pos\src\app\core\services\auth.service.ts` — device
  auth/login flow, session-cache invalidation on login/logout/switchDevice
- `D:\SHAHZAD\Rasidify 2.0\rasidify_pos\src\app\core\services\lookup.service.ts` — bootstrap +
  menu caching pattern (`shareReplay`)
- `D:\SHAHZAD\Rasidify 2.0\rasidify_pos\src\app\core\services\shift.service.ts`
- `D:\SHAHZAD\Rasidify 2.0\rasidify_pos\src\app\core\services\invoice.service.ts` — orders +
  payment
- `D:\SHAHZAD\Rasidify 2.0\rasidify_pos\src\app\pages\pages.component.ts` — `_flattenMenuProducts`
  (product shape flattening), `reloadProductsBackground` (stock refresh merge pattern)
- Backend source of truth for every route/DTO shape: `RASIDIFY-POS-API\Controllers\*.cs`

## Tablet app's current state (starting point)

- Single `Config.API_URL` in `app/config.ts`, single shared `axios` instance in
  `app/services/api.ts` (JWT attached via request interceptor from `pos_token` in SecureStore,
  401 handling clears token). You'll need a second `posApi` axios instance (or a second baseURL
  config) pointed at `https://pos-api.rasidify.com/api`, same interceptor pattern.
- Existing services to migrate/extend: `app/services/authService.ts`, `deviceService.ts`,
  `orderService.ts`, `productCatalogService.ts`, `productService.ts`, `shiftService.ts`,
  `tableService.ts`. Check each against the endpoint inventory above — some calls move wholesale,
  some (like payment) may not exist as a dedicated call yet and need to be added.

## If you find a gap in RASIDIFY-POS-API itself

Some endpoint the tablet app needs might not exist yet on `RASIDIFY-POS-API` (the web migration
was scoped to what Web POS needed, e.g. no dedicated live table-occupy/release/transfer endpoint
was confirmed above). If so:
1. Check the dashboard API (`rasidify-api\repo-rasidify-invoicing_api\rasidify_api\Controllers`)
   for the equivalent existing endpoint.
2. Port it into `RASIDIFY-POS-API\Controllers` **verbatim** (same pattern as every controller
   already there — copy the logic, same `IDapperService`/service calls, same route shape prefixed
   under `/pos/...` if it needs disambiguating from the dashboard's copy).
3. If it needs services not yet registered in `RASIDIFY-POS-API\Helper\ServiceRegistration.cs`,
   add them — check the service's constructor dependencies first; most already exist as source
   files there (from the 2026-09-24 standalone copy), likely just not wired into DI yet.
4. `dotnet build` in `RASIDIFY-POS-API` to confirm 0 errors before considering it done.
5. Tell the user what you added and why — this is shared production infrastructure, not something
   to add silently.

## Explicitly do NOT do

- Do not modify `D:\SHAHZAD\Rasidify 2.0\rasidify-pos-mobile` (the existing production Mobile POS
  — read-only reference per `instruction.md`/`AGENTS.md`).
- Do not modify `rasidify_pos` (Web POS) — it's done, this task is tablet-only.
- Do not commit/push unless explicitly asked.
- Do not guess at UI — this task is entirely about swapping the data layer under the existing (or
  in-progress) Tablet POS UI, not changing screens.

## Deliverable

For each migrated area: confirm it builds/type-checks (`npx tsc --noEmit` or whatever this
project's check command is — see `package.json` scripts), and give the user a summary of what
moved, what's still on the dashboard API and why (if anything is intentionally left, mirror the
Web POS pattern of documenting *why*, not just doing it silently), and what needs live device
testing since none of this can be verified without a real tablet/emulator + backend hitting the
real Azure SQL DB.
