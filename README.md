# C&C — Calm & Curious Minds

A complete black-and-white luxury shopping website demo with customer/admin roles, brand filtering, dedicated product pages, cart/wishlist persistence, and checkout.

## Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Environment variables
- `PORT` (default `3000`)
- `JWT_SECRET` (recommended in production)
- `STRIPE_SECRET_KEY` (optional flag for payment mode messaging)

## What is included
- OTP-style auth (demo OTP returned by API)
- Role-aware users (`customer`, `admin`)
- Featured brands filter
- Explore collections under 10 stock
- Limited drops shown as single-quantity urgency
- Dedicated product page with up to 4 images + swipe gestures
- Add to cart, buy now, wishlist
- Cart overlay with item image + name and reopen-on-click
- Per-user persisted cart/wishlist
- Admin order listing endpoint

## API overview
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `GET /api/products?brand=&category=&limited=`
- `GET /api/products/:id`
- `GET /api/me`
- `POST /api/wishlist/:productId`
- `POST /api/cart`
- `DELETE /api/cart/:productId`
- `POST /api/checkout`
- `GET /api/admin/orders`

## Deploy quickly
1. Push this repository to GitHub.
2. Create a web service on Render or Railway.
3. Start command: `npm start`.
4. Add env vars (`JWT_SECRET`, optional `STRIPE_SECRET_KEY`).
5. Deploy.
