# C&C — Calm & Curious Minds

Black-and-white themed luxury shopping platform with role-based authentication, brand filtering, limited drops, wishlist/cart persistence per user, and checkout flows.

## Features implemented
- Featured Brands are clickable and filter all products for that brand.
- Explore Collections only shows items with stock under 10.
- Limited Drops display as single-quantity urgency inventory.
- Product detail modal supports 4 images and includes Add to Cart, Buy Now, Wishlist.
- Wishlist and cart are persisted per logged-in user on backend (`data/db.json`).
- Buy Now checks out one item immediately; Cart supports multi-item checkout.
- Community section removed.
- OTP-style login/register (demo OTP returned in API response).
- Admin APIs for product/order management.
- Stripe payment-intent support when `STRIPE_SECRET_KEY` is configured.

## Run locally
```bash
npm install
npm run dev
```
Open `http://localhost:3000`.

## Environment variables
- `PORT` (default `3000`)
- `JWT_SECRET`
- `STRIPE_SECRET_KEY` (optional but required for real Stripe payments)

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
- `POST /api/admin/products` (admin)
- `GET /api/admin/orders` (admin)

## Make it live
### Option A: Render/Railway (quick)
1. Push this repo to GitHub.
2. Create a new Web Service on Render or Railway.
3. Set start command: `npm start`.
4. Add environment variables (`JWT_SECRET`, `STRIPE_SECRET_KEY`).
5. Deploy and test auth/cart/checkout.

### Option B: Vercel + separate API host
- Host frontend on Vercel and backend on Render/Railway.
- Update frontend API base URL for production.

## Real payment gateway checklist
1. Create Stripe account and enable live mode.
2. Set `STRIPE_SECRET_KEY` in production.
3. Add Stripe Elements on frontend for card confirmation.
4. Add webhook endpoint to mark orders `paid` only after `payment_intent.succeeded`.
5. Use HTTPS domain and secure cookie/session settings.

