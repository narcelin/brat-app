# Brat Olympics

A weekly game for a group chat: three objectives drop, you record proof in the
app, everyone ranks everyone else, the leaderboard updates.

Live at https://brats.anico.dev — invite-only.

```bash
npm install
vercel env pull .env.development.local
npm run dev
```

## Docs

| | |
|---|---|
| [docs/STACK.md](docs/STACK.md) | The stack, the services, and how deployment works. **Start here.** |
| [docs/RULES.md](docs/RULES.md) | How a week works, how points are scored, what's allowed |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is shipped, what is next, and what is deliberately not being built |
| [docs/TESTING.md](docs/TESTING.md) | The two test suites and why the integration one needs its own database branch |
| [docs/ISSUES.md](docs/ISSUES.md) | Open defects, and the write-ups of fixed ones |

## Commands

| | |
|---|---|
| `npm run dev` | Local dev server |
| `npm test` | Unit suite — pure functions and route handlers, no database |
| `npm run test:integration` | Integration suite — requires a disposable Neon branch |
| `npm run db:apply` | Apply `db/schema.sql` + `db/seed.sql` to the dev database |
| `vercel --prod` | Deploy to production |
