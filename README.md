# Corner Shop: full-stack e-commerce store

A small but complete online store.

**Stack:** Node.js, Express, SQLite (better-sqlite3), JWT authentication, bcrypt password hashing, vanilla JavaScript front end.

## Features
- Browse, search and filter products
- Cart saved in the browser
- Register and log in (passwords hashed, JWT tokens)
- Checkout that validates price and stock on the server inside a database transaction
- Order history for each customer
- Admin role that can add products

## Run it
```bash
npm install
npm start
```
Open http://localhost:3000

Demo admin login: `admin@shop.com` / `admin123` (change this before deploying).

## API
| Method | Route | Access |
|---|---|---|
| POST | /api/auth/register | public |
| POST | /api/auth/login | public |
| GET | /api/products?q=&category= | public |
| POST | /api/products | admin |
| POST | /api/orders | logged in |
| GET | /api/orders | logged in |

## Deploy
Push to GitHub, then deploy on Render or Railway. Set `JWT_SECRET` as an environment variable. Use a persistent disk or switch to PostgreSQL, because SQLite files are lost on some hosts when they restart.

## Roadmap
- Stripe payments
- Product images and reviews
- Admin dashboard to edit and delete products
- Order status (paid, shipped, delivered)
- Automated tests
