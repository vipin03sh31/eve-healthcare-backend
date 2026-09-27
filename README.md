# EVE Healthcare Backend API

A RESTful backend API for a **diagnostic test booking platform**, built as the EVE Healthcare SDE Intern Engineering Assignment.

This is a **backend-only** project. There is no frontend, no real payment gateway, no AI, and no Redis. The focus is on clean, maintainable API design, correct data modelling, security, and tested business logic.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture & Project Structure](#3-architecture--project-structure)
4. [Prerequisites](#4-prerequisites)
5. [Local Setup](#5-local-setup)
6. [Database Setup](#6-database-setup)
7. [Running the Application](#7-running-the-application)
8. [API Documentation](#8-api-documentation)
9. [End-to-End Example Flow](#9-end-to-end-example-flow)
10. [Database & Schema Design](#10-database--schema-design)
11. [Booking State Model](#11-booking-state-model)
12. [Payment & Webhook Idempotency](#12-payment--webhook-idempotency)
13. [Authentication & Security](#13-authentication--security)
14. [Validation & Error Handling](#14-validation--error-handling)
15. [Assumptions](#15-assumptions)
16. [Testing](#16-testing)
17. [Docker Support](#17-docker-support)
18. [What I Would Improve With More Time](#18-what-i-would-improve-with-more-time)

---

## 1. Overview

EVE Healthcare Backend provides the following capabilities:

| Feature | Description |
|---------|-------------|
| **User Authentication** | Signup and login with bcrypt-hashed passwords and JWT-based stateless auth |
| **Diagnostic Centres** | Create and browse diagnostic centres with location information |
| **Diagnostic Test Catalogue** | Manage a global catalogue of diagnostic tests |
| **Centre-Specific Pricing** | Each centre offers tests at its own price via a `CentreTest` join record |
| **Booking** | Authenticated patients book a specific centre's test offering; price is snapshotted at booking time |
| **Simulated Payment** | A mock payment endpoint returns a deterministic SUCCESS or FAILED outcome — no real payment gateway |
| **Payment Webhook** | A public webhook endpoint receives a simulated provider callback and updates payment + booking state atomically |
| **Webhook Idempotency** | Each webhook event carries a unique `eventId`; the database unique constraint ensures duplicate deliveries are safely ignored |

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| ORM | Prisma 5 |
| Database | PostgreSQL 14+ |
| Authentication | JSON Web Tokens (jsonwebtoken) |
| Password Hashing | bcryptjs |
| Testing | Jest + Supertest |
| Security middleware | Helmet, CORS |
| HTTP logging | Morgan (dev only) |
| Config | dotenv |

---

## 3. Architecture & Project Structure

The project follows a classic **layered architecture**: Routes → Controllers → Services → Prisma.

```
eve/
├── prisma/
│   ├── schema.prisma                # All 7 models, relations, constraints, indexes
│   └── migrations/
│       └── 20260926070756_init/
│           └── migration.sql        # Initial schema migration
│
├── src/
│   ├── config/
│   │   ├── database.js              # Prisma singleton client
│   │   └── index.js                 # App config + JWT_SECRET fail-fast validation
│   │
│   ├── controllers/                 # HTTP layer — reads req, calls service, sends res
│   │   ├── auth.controller.js
│   │   ├── booking.controller.js
│   │   ├── centre.controller.js
│   │   ├── health.controller.js
│   │   ├── payment.controller.js
│   │   ├── test.controller.js
│   │   └── webhook.controller.js
│   │
│   ├── middleware/
│   │   ├── authenticate.js          # JWT verification middleware
│   │   ├── errorHandler.js          # Global error handler (AppError + Prisma errors)
│   │   └── notFound.js              # 404 catch-all
│   │
│   ├── routes/
│   │   ├── index.js                 # Central router — mounts all route modules
│   │   ├── auth.routes.js
│   │   ├── booking.routes.js
│   │   ├── centre.routes.js
│   │   ├── health.routes.js
│   │   ├── payment.routes.js        # /webhook registered before authenticate
│   │   └── test.routes.js
│   │
│   ├── services/                    # Business logic — no Express req/res
│   │   ├── auth.service.js
│   │   ├── booking.service.js
│   │   ├── centre.service.js
│   │   ├── payment.service.js
│   │   ├── test.service.js
│   │   └── webhook.service.js
│   │
│   ├── utils/
│   │   ├── AppError.js              # Operational error class
│   │   ├── paymentSimulator.js      # Deterministic mock payment processor
│   │   ├── response.js              # sendSuccess / sendError / sendCreated helpers
│   │   └── validation.js            # Pure validation functions (no DB)
│   │
│   ├── __tests__/
│   │   ├── auth.test.js
│   │   ├── booking.test.js
│   │   ├── centres-tests.test.js
│   │   ├── payment.test.js
│   │   └── webhook.test.js
│   │
│   ├── app.js                       # Express app factory (no listen)
│   └── server.js                    # Entry point — binds port, graceful shutdown
│
├── .env.example                     # Environment variable template (no real secrets)
├── .env.docker.example              # Docker-specific env template
├── .gitignore
├── Dockerfile
├── docker-compose.yml
└── package.json
```

**Layer responsibilities:**

- **Routes** — declare HTTP method + path, apply middleware (e.g. `authenticate`), delegate to controllers.
- **Controllers** — validate request shape, call one service method, return the response. No DB access.
- **Services** — own all business rules: ownership checks, state guards, price snapshotting, atomic DB writes.
- **Prisma / database** — typed ORM queries; all transactions use `prisma.$transaction([...])`.
- **Utils** — pure helpers with no side effects: validation, response formatting, error class.

---

## 4. Prerequisites

- **Node.js 18+** — `node --version`
- **npm 9+** — bundled with Node
- **PostgreSQL 14+** — running locally, via Docker, or remote
- **Git** (optional, for cloning)

---

## 5. Local Setup

### Clone and install

```bash
git clone https://github.com/vipin03sh31/eve-healthcare-backend.git
cd eve-healthcare-backend
npm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your PostgreSQL credentials and a strong JWT secret:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/eve_healthcare?schema=public"
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=7d
BCRYPT_ROUNDS=10
```

> **⚠ Important — special characters in passwords**
>
> If your PostgreSQL password contains special characters (such as `@`, `#`, `!`, `%`),
> they **must be URL-encoded** in `DATABASE_URL`. For example:
>
> | Character | Encoded |
> |-----------|---------|
> | `@`       | `%40`   |
> | `#`       | `%23`   |
> | `!`       | `%21`   |
> | `%`       | `%25`   |
>
> Example: password `p@ss!word` → `DATABASE_URL="postgresql://postgres:p%40ss%21word@localhost:5432/eve_healthcare?schema=public"`

> **Generate a JWT secret:**
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
> ```

> **⚠ Security:** Never commit `.env` to version control. It is `.gitignore`d by default.

---

## 6. Database Setup

### Create the database (if it doesn't exist)

```bash
# Using psql
psql -U postgres -c "CREATE DATABASE eve_healthcare;"
```

### Generate Prisma Client

```bash
npm run prisma:generate
```

### Run migrations (development)

```bash
npm run prisma:migrate
```

This creates all tables and records the migration in `prisma/migrations/`.

### Run migrations (production / CI)

```bash
npm run prisma:migrate:prod
```

This applies existing migrations without creating new ones — safe for production.

> **`prisma migrate dev` vs `prisma migrate deploy`**
>
> | Command | Use case |
> |---------|----------|
> | `migrate dev` | Local development — creates migration files, generates client |
> | `migrate deploy` | Production / CI — applies existing migrations only, no file creation |

The repository already contains the initial migration (`20260926070756_init`). You do not need to regenerate it.

---

## 7. Running the Application

### Development (auto-reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

The server starts on `http://localhost:3000` (or the `PORT` from `.env`).

### Health check

```http
GET http://localhost:3000/api/health
```

Successful response:

```json
{
  "success": true,
  "message": "EVE Healthcare API is running",
  "data": {
    "status": "ok",
    "environment": "development",
    "timestamp": "2026-09-26T07:30:00.000Z",
    "database": "connected"
  }
}
```

`"database": "connected"` confirms a live PostgreSQL connection. If the database is unreachable it will say `"disconnected"`.

---

## 8. API Documentation

All responses use a consistent JSON envelope:

```json
{ "success": true,  "message": "...", "data": { ... } }
{ "success": false, "message": "...", "errors": [ ... ] }
```

---

### Authentication

#### `POST /api/auth/signup`

Register a new patient account.

| | |
|-|-|
| Auth | None |
| Content-Type | `application/json` |

**Request body:**

```json
{
  "name": "Aditya Sharma",
  "email": "aditya@example.com",
  "password": "Secure1234"
}
```

Password rules: minimum 8 characters, at least one letter, at least one digit.

**201 Created:**

```json
{
  "success": true,
  "message": "Account created successfully.",
  "data": {
    "token": "<JWT>",
    "user": { "id": "uuid", "name": "Aditya Sharma", "email": "aditya@example.com", "role": "PATIENT" }
  }
}
```

**Errors:** `400` (validation), `409` (email already registered)

---

#### `POST /api/auth/login`

Authenticate an existing user.

| | |
|-|-|
| Auth | None |

**Request body:**

```json
{
  "email": "aditya@example.com",
  "password": "Secure1234"
}
```

**200 OK:**

```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "token": "<JWT>",
    "user": { "id": "uuid", "name": "Aditya Sharma", "email": "aditya@example.com", "role": "PATIENT" }
  }
}
```

**Errors:** `400` (missing fields), `401` (invalid credentials — same message for wrong email and wrong password to prevent user enumeration)

---

### Diagnostic Centres

#### `GET /api/centres`

List all diagnostic centres with their active test offerings.

| | |
|-|-|
| Auth | None (public) |

**200 OK:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "City Diagnostics",
      "city": "Mumbai",
      "state": "Maharashtra",
      "address": "123 Main St",
      "phone": "+91-9876543210",
      "email": "info@citydiag.com",
      "tests": [
        { "centreTestId": "uuid", "testId": "uuid", "name": "CBC", "price": "499.00", "isActive": true }
      ]
    }
  ]
}
```

---

#### `GET /api/centres/:id`

Get a single centre by ID.

| | |
|-|-|
| Auth | None (public) |

**Errors:** `404` (centre not found)

---

#### `POST /api/centres`

Create a new diagnostic centre.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

**Request body:**

```json
{
  "name": "City Diagnostics",
  "address": "123 Main St",
  "city": "Mumbai",
  "state": "Maharashtra",
  "phone": "+91-9876543210",
  "email": "info@citydiag.com"
}
```

**201 Created** | **Errors:** `400` (validation), `401` (unauthenticated)

---

#### `POST /api/centres/:id/tests`

Add a diagnostic test to a centre at a specific price.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

**Request body:**

```json
{
  "testId": "<DiagnosticTest UUID>",
  "price": 499.00
}
```

**201 Created** | **Errors:** `400` (validation), `401`, `404` (centre or test not found), `409` (test already offered by this centre)

---

### Diagnostic Tests

#### `GET /api/tests`

List the global diagnostic test catalogue.

| | |
|-|-|
| Auth | None (public) |

---

#### `GET /api/tests/:id`

Get a single test by ID, including all centres where it is available and their prices, sorted cheapest-first.

| | |
|-|-|
| Auth | None (public) |

**200 OK:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Complete Blood Count",
    "description": "Measures different components of blood",
    "turnaround": "24h",
    "availableAt": [
      { "centreTestId": "uuid", "centreId": "uuid", "centreName": "City Diagnostics", "price": "499.00" }
    ]
  }
}
```

---

#### `POST /api/tests`

Create a new diagnostic test in the global catalogue.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

**Request body:**

```json
{
  "name": "Complete Blood Count",
  "description": "Measures different components of blood",
  "turnaround": "24h"
}
```

**201 Created** | **Errors:** `400`, `401`

---

### Bookings

#### `POST /api/bookings`

Create a booking. The authenticated user is automatically set as the patient. The booking amount is **always** taken from the selected `CentreTest.price` — the client cannot supply an amount.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

**Request body:**

```json
{
  "centreTestId": "<CentreTest UUID>",
  "scheduledAt": "2026-12-01T09:00:00.000Z",
  "notes": "Morning slot preferred"
}
```

- `centreTestId` — references a `CentreTest` record (a centre's specific test offering)
- `scheduledAt` — ISO 8601 date/time, must be in the future
- `notes` — optional

**201 Created:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "PENDING",
    "scheduledAt": "2026-12-01T09:00:00.000Z",
    "amount": "499.00",
    "user": { "id": "uuid", "name": "Aditya Sharma", "email": "aditya@example.com" },
    "centre": { "id": "uuid", "name": "City Diagnostics", "city": "Mumbai" },
    "test": { "centreTestId": "uuid", "testId": "uuid", "name": "CBC", "price": "499.00" }
  }
}
```

**Errors:** `400` (missing fields, invalid date, past date), `401`, `404` (CentreTest not found), `422` (CentreTest inactive)

---

#### `GET /api/bookings`

List all bookings belonging to the authenticated user.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

Returns only the caller's own bookings — never another user's.

---

#### `GET /api/bookings/:id`

Get a single booking by ID.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

**Authorization rules:**
- `200` — booking belongs to the caller
- `403` — booking exists but belongs to a different user (existence is not revealed via 404)
- `404` — booking does not exist

---

### Payments

#### `POST /api/payments`

Initiate a **simulated** payment for a PENDING booking.

| | |
|-|-|
| Auth | 🔒 `Authorization: Bearer <JWT>` |

**Request body:**

```json
{
  "bookingId": "<Booking UUID>"
}
```

> The `amount` field is **ignored** if provided. The amount is always taken from `Booking.amount`.

**201 Created:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "bookingId": "uuid",
    "amount": "499.00",
    "status": "SUCCESS",
    "transactionId": "sim_success_<uuid>",
    "booking": { "id": "uuid", "status": "CONFIRMED" }
  }
}
```

**Payment simulation logic** (deterministic, for testability):

| Booking amount | Result |
|----------------|--------|
| Ends in `.00` (e.g. `500.00`) | `SUCCESS` → booking becomes `CONFIRMED` |
| Any other cents (e.g. `499.50`) | `FAILED` → booking becomes `FAILED` |

**Errors:** `400` (missing bookingId), `401`, `403` (not your booking), `404` (booking not found), `409` (booking already in a terminal state, or duplicate payment)

---

#### `POST /api/payments/webhook`

Receive a simulated payment provider callback and update the payment + booking state atomically.

| | |
|-|-|
| Auth | **None** — public endpoint (external provider callback) |

**Request body:**

```json
{
  "eventId": "evt_unique_abc123",
  "eventType": "payment.success",
  "transactionId": "sim_success_<uuid>",
  "bookingId": "<Booking UUID>"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `eventId` | ✅ | Provider-unique event ID — **the idempotency key** |
| `eventType` | ✅ | `"payment.success"` or `"payment.failed"` |
| `transactionId` | ✅ | Matches `Payment.transactionId` |
| `bookingId` | ✅ | The booking being updated |

**200 OK (new event):**

```json
{
  "success": true,
  "message": "Webhook event processed successfully.",
  "data": {
    "eventId": "evt_unique_abc123",
    "eventStatus": "PROCESSED",
    "payment": { "id": "uuid", "status": "SUCCESS", "transactionId": "sim_success_..." },
    "booking": { "id": "uuid", "status": "CONFIRMED" }
  }
}
```

**200 OK (duplicate delivery — idempotent):**

```json
{
  "success": true,
  "message": "Event already processed. No changes made.",
  "data": { "eventId": "evt_unique_abc123", "status": "PROCESSED" }
}
```

**Errors:** `400` (missing/invalid fields), `404` (transactionId or bookingId not found)

---

### Health

#### `GET /api/health`

Server and database health check.

| | |
|-|-|
| Auth | None (public) |

**200 OK:**

```json
{
  "success": true,
  "message": "EVE Healthcare API is running",
  "data": {
    "status": "ok",
    "environment": "development",
    "timestamp": "2026-09-26T07:30:00.000Z",
    "database": "connected"
  }
}
```

---

## 9. End-to-End Example Flow

```
# 1. Register a patient
POST /api/auth/signup
{ "name": "Aditya", "email": "aditya@eve.com", "password": "Test1234" }
→ { token: "<JWT>", user: { id: "USER_ID", ... } }

# 2. Create a diagnostic test (use JWT)
POST /api/tests
Authorization: Bearer <JWT>
{ "name": "Complete Blood Count", "turnaround": "24h" }
→ { id: "TEST_ID" }

# 3. Create a diagnostic centre (use JWT)
POST /api/centres
Authorization: Bearer <JWT>
{ "name": "City Diagnostics", "city": "Mumbai", "state": "MH", "address": "1 MG Rd" }
→ { id: "CENTRE_ID" }

# 4. Add the test to the centre with a price (use JWT)
POST /api/centres/CENTRE_ID/tests
Authorization: Bearer <JWT>
{ "testId": "TEST_ID", "price": 500.00 }
→ { id: "CENTRE_TEST_ID", price: "500.00" }

# 5. Book the test (use JWT)
POST /api/bookings
Authorization: Bearer <JWT>
{ "centreTestId": "CENTRE_TEST_ID", "scheduledAt": "2026-12-01T09:00:00Z" }
→ { id: "BOOKING_ID", status: "PENDING", amount: "500.00" }

# 6. Initiate simulated payment (use JWT)
#    Amount 500.00 ends in .00 → SUCCESS
POST /api/payments
Authorization: Bearer <JWT>
{ "bookingId": "BOOKING_ID" }
→ { status: "SUCCESS", transactionId: "sim_success_<uuid>", booking: { status: "CONFIRMED" } }

# 7. Receive the simulated webhook callback (no JWT)
POST /api/payments/webhook
{
  "eventId":       "evt_abc123",
  "eventType":     "payment.success",
  "transactionId": "sim_success_<uuid>",
  "bookingId":     "BOOKING_ID"
}
→ { eventStatus: "PROCESSED", booking: { status: "CONFIRMED" } }

# 8. Send the same webhook again (idempotency test)
POST /api/payments/webhook   ← same body
→ { message: "Event already processed. No changes made." }

# 9. Retrieve your booking (use JWT)
GET /api/bookings/BOOKING_ID
Authorization: Bearer <JWT>
→ { status: "CONFIRMED", amount: "500.00", ... }
```

---

## 10. Database & Schema Design

Seven Prisma models cover all assignment requirements:

```
User ──────────────────────────────── many Bookings
                                            │
DiagnosticCentre ─── many CentreTests ─────┤ (via centreId)
                │                           │
                └─── many Bookings          │
                                            │
DiagnosticTest ──── many CentreTests ───────┘ (via centreTestId)
                                            │
CentreTest ─────────────────────────────────┘
  └─ contains centre-specific price
  └─ one optional Payment

Booking ─── one optional Payment
Payment ─── (belongs to Booking, @unique on bookingId)

PaymentWebhookEvent ─── eventId (@unique — idempotency key)
```

### Why price lives on `CentreTest`, not `DiagnosticTest`

The same test (e.g. CBC) can be offered at different prices by different centres. Storing `price` on the `CentreTest` join record correctly models this real-world relationship.

### Why `Booking.amount` is a separate snapshot

The `CentreTest.price` might change after a booking is made. The `Booking.amount` stores the price at the time of booking so the patient is always charged what they agreed to.

### Key constraints

| Constraint | Column | Purpose |
|------------|--------|---------|
| `@unique` | `Payment.bookingId` | One payment per booking |
| `@unique` | `PaymentWebhookEvent.eventId` | Idempotency gate |
| `@unique` | `CentreTest(centreId, testId)` | A centre cannot offer the same test twice |
| `@@index` | `Booking(userId)` | Efficient "list my bookings" query |
| `@@index` | `Booking(centreId)` | Efficient "list centre's bookings" query |

### Foreign-key delete behaviour

All relations use `onDelete: Restrict` — you cannot delete a User who has bookings, or a Centre that has active bookings. This prevents orphaned records silently.

---

## 11. Booking State Model

```
POST /api/bookings
        │
        ▼
   ┌─────────┐
   │ PENDING │  ← initial state
   └────┬────┘
        │
        │  POST /api/payments  or  POST /api/payments/webhook
        │
   ┌────┴──────┐
   │           │
   ▼           ▼
CONFIRMED    FAILED
(payment     (payment
 SUCCESS)     FAILED)

CANCELLED — reserved for future cancellation feature
```

Only `PENDING` bookings can be paid. Attempting to pay a `CONFIRMED`, `FAILED`, or `CANCELLED` booking returns `409 Conflict`.

---

## 12. Payment & Webhook Idempotency

### Simulated payment

`POST /api/payments` does not call any external gateway. The outcome is determined by the booking amount's cent value:

- Amount ends in `.00` → **SUCCESS** → booking becomes `CONFIRMED`
- Any other cents → **FAILED** → booking becomes `FAILED`

This makes both paths fully testable by controlling the `CentreTest.price`.

Both the payment record creation and the booking status update happen inside a single **`prisma.$transaction`** — they either both succeed or both roll back.

### Webhook idempotency

When `POST /api/payments/webhook` is called:

1. The service attempts to **INSERT** a `PaymentWebhookEvent` row with the supplied `eventId`.
2. `PaymentWebhookEvent.eventId` has a **database-level `@unique` constraint**.
3. If a duplicate `eventId` arrives, the `INSERT` fails with `P2002`. The service catches this and returns immediately — **zero side effects** on `Payment` or `Booking`.
4. For a new event, the service atomically updates `Payment`, `Booking`, and marks the `PaymentWebhookEvent` as `PROCESSED` in a single `prisma.$transaction`.

This insert-first pattern means concurrent duplicate deliveries are safely rejected by the database constraint — no application-level locking or queuing needed.

---

## 13. Authentication & Security

| Control | Implementation |
|---------|---------------|
| Password hashing | `bcryptjs.hash(password, rounds)` — plaintext is never stored |
| JWT signing | `jsonwebtoken.sign({ sub, email, role }, secret, { expiresIn })` |
| JWT verification | `jsonwebtoken.verify(token, secret)` in `authenticate.js` middleware |
| JWT secret | Required from `JWT_SECRET` env var — application refuses to start if missing |
| User identity | `req.user.sub` is always read from the verified JWT — never from the request body |
| Ownership | Booking and payment endpoints check `booking.userId === req.user.sub` |
| Unauthorized bookings | Returns `403` (not `404`) to avoid revealing whether a booking exists |
| Security headers | `helmet()` applied globally |
| CORS | `cors()` applied globally |
| Request logging | `morgan('dev')` in development, suppressed in test/production |
| Error messages | Stack traces and internal details never sent to clients in production |

---

## 14. Validation & Error Handling

All validation runs **before** any database access where possible.

**Validated fields:**

| Endpoint | Validated | Error |
|----------|-----------|-------|
| Signup | name required, email format, password strength (8+ chars, letter, digit) | 400 |
| Login | email + password required | 400 |
| Create centre | name, city, state, address required; email format if provided | 400 |
| Create test | name required, non-empty | 400 |
| Add test to centre | testId required, price required and non-negative | 400 |
| Create booking | centreTestId required; scheduledAt required, valid ISO date, must be future | 400 |
| Create booking | CentreTest must exist | 404 |
| Create booking | CentreTest must be active | 422 |
| Initiate payment | bookingId required, non-empty | 400 |
| Initiate payment | booking must be PENDING | 409 |
| Webhook | eventId, eventType, transactionId, bookingId all required | 400 |
| Webhook | eventType must be `payment.success` or `payment.failed` | 400 |

**Standard response envelopes:**

```jsonc
// Success
{ "success": true, "message": "...", "data": { ... } }

// Validation error
{ "success": false, "message": "Validation failed.", "errors": ["email is required.", "..."] }

// Single error
{ "success": false, "message": "Booking not found." }
```

---

## 15. Assumptions

The following assumptions were made during implementation:

1. **Payment simulation** — The assignment explicitly states not to integrate a real gateway. The simulated outcome is deterministic (based on amount cents) to keep both paths fully testable without environment-specific configuration.

2. **Centre-specific pricing** — Different diagnostic centres can offer the same test at different prices. This is modelled via the `CentreTest` join table rather than on `DiagnosticTest` directly.

3. **Booking amount snapshot** — `Booking.amount` is populated from `CentreTest.price` at booking creation time and stored separately. This protects against retroactive price changes affecting existing bookings.

4. **Webhook is public** — Real payment provider callbacks arrive server-to-server without a user JWT. No user authentication is applied to `POST /api/payments/webhook`. In production, webhook signature verification (HMAC) would be added.

5. **Webhook `eventId` is the idempotency key** — The database unique constraint on `PaymentWebhookEvent.eventId` is the authoritative duplicate-delivery guard. Application-level checks were intentionally avoided to prevent race conditions.

6. **Booking ownership returns 403** — When a user requests another user's booking, the API returns `403 Forbidden` rather than `404 Not Found`. This prevents clients from inferring the existence of bookings they do not own.

7. **User ID from JWT only** — `userId` in booking and payment creation is always read from `req.user.sub` (the verified JWT payload). Client-supplied `userId` fields are ignored.

8. **No frontend** — The assignment is backend-focused. No HTML, templates, or static file serving is included.

9. **No real payment credentials** — No Stripe, Razorpay, or PayPal API keys are required or used.

10. **Single role** — All registered users have the `PATIENT` role. Admin-level operations (creating centres, creating tests) currently accept any authenticated user. Role-based access control would be tightened in production.

---

## 16. Testing

All tests use Jest + Supertest. **Prisma is fully mocked** — no database connection is needed to run the test suite.

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage
```

### Test suites

| Suite | Tests | Covers |
|-------|-------|--------|
| `auth.test.js` | 19 | Signup, login, JWT middleware (valid/invalid/expired/missing) |
| `centres-tests.test.js` | 25 | Create centre, list, get-by-id, add test to centre (all validation + auth paths) |
| `booking.test.js` | 19 | Create booking (price snapshot, auth, validation), list, get-by-id, ownership |
| `payment.test.js` | 16 | SUCCESS/FAILED paths, amount guard, auth, state guard, duplicate payment |
| `webhook.test.js` | 20 | SUCCESS/FAILED webhook, idempotency (no side effects on duplicate), validation, not found, no-JWT |
| **Total** | **99** | |

---

## 17. Docker Support

Docker support is included as an optional bonus. It has been added to the repository but **not tested in the current environment** (Docker is not installed on the development machine).

### Files

- [`Dockerfile`](./Dockerfile) — multi-stage build (Node 20 Alpine)
- [`docker-compose.yml`](./docker-compose.yml) — PostgreSQL 16 + API service
- [`.env.docker.example`](./.env.docker.example) — Docker-specific env template

### Setup

```bash
# 1. Create the Docker env file
cp .env.docker.example .env.docker

# 2. Edit .env.docker and set a real JWT_SECRET
#    (DATABASE_URL is injected by docker-compose.yml automatically)

# 3. Build and start
docker compose up --build

# 4. In a separate terminal, run migrations
docker compose exec api npx prisma migrate deploy

# 5. Verify
curl http://localhost:3000/api/health
```

### Stop

```bash
docker compose down          # stop containers
docker compose down -v       # stop and remove the postgres volume
```

> **Note:** Docker was added but not tested in this environment. If you encounter issues, the local PostgreSQL setup in [§5 Local Setup](#5-local-setup) is the verified path.

---

## 18. What I Would Improve With More Time

The following improvements would be prioritised in a production environment:

| Improvement | Rationale |
|-------------|-----------|
| **Swagger / OpenAPI** | Auto-generated, always-in-sync API docs at `/api/docs` |
| **Role-based access control** | Restrict centre/test creation to `ADMIN` role only |
| **Pagination** | `GET /api/centres`, `/api/tests`, `/api/bookings` should support cursor or offset pagination |
| **Rate limiting** | `express-rate-limit` on auth endpoints to prevent brute-force |
| **Structured logging** | Replace `morgan` + `console.error` with `winston` or `pino` for JSON log output |
| **Webhook signature verification** | HMAC-SHA256 verification of `X-Webhook-Signature` header |
| **Webhook retry / dead-letter queue** | Background job to replay `FAILED` webhook events |
| **Integration test database** | A dedicated PostgreSQL instance for integration tests (currently all DB calls are mocked) |
| **CI/CD pipeline** | GitHub Actions: `npm test` + `prisma migrate deploy` on every PR |
| **API versioning** | `/api/v1/` prefix for forward-compatible evolution |
| **Request ID tracing** | `X-Request-Id` header injected on every request for distributed tracing |
| **Booking cancellation** | `PATCH /api/bookings/:id/cancel` endpoint to move a booking to `CANCELLED` state |

---

*Built for the EVE Healthcare SDE Intern Engineering Assignment.*
