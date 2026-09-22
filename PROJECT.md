# Hanapipi Flower

Hanapipi Flower is a Vietnamese luxury floral e-commerce experience with an editorial, romantic-minimal visual direction. Customer-facing copy is natural Vietnamese (`vi-VN`), prices use VND, and the visible brand is always **Hanapipi Flower**.

## Architecture

- React 19, Vite 8, React Router 7, Tailwind CSS 4
- Cloudflare Worker and OpenAI Sites integration
- Cloudflare D1 with versioned SQLite migrations
- Groq concierge called server-side through the Worker only
- Oxlint and Node test runner

The migration path is React/Vite/Sites → Worker `/api/v1` → D1. Until each domain is deliberately cut over, current frontend commerce/account flows may remain static or `localStorage`-backed.

## Domain invariants

### Catalogue

The catalogue contains exactly **24 products**:

- 23 purchasable products
- 1 priceless Easter egg: `no-watering-flower`

`no-watering-flower` is priceless and non-purchasable. It must not be deleted, placed in Cart/Checkout, or recommended for purchase. Preserve its private romantic gallery and page behavior.

### AI

Groq may only be called server-side through the Worker. Secrets must never enter the browser bundle.

### Payments

Payments remain **MOCK**. Do not process, transmit, log, or store real card or banking information.
