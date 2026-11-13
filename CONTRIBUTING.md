# Contributing

Thanks for wanting to help. Bug reports, theme ideas, fixes and features are all welcome.

## Quick start

```bash
git clone https://github.com/Just9OO/900LVLBot.git
cd 900LVLBot
npm install
cp .env.example .env      # add a test bot's token and your test server's ID
npm test                  # unit tests, including rendering every theme
npm run previews          # render every theme to ./previews
npm run dev               # restart the bot on file changes
```

Use a **separate test bot** and set `GUILD_ID` so commands update instantly. Never commit `.env`.

## Adding a theme

Add one line to `PRESET_DEFS` in `src/utils/themes.js`:

```js
{ id: 'neontokyo', name: 'Neon Tokyo', emoji: '🌃', description: 'Pink and cyan after dark.',
  bg: '#0B0B1A', primary: '#FF3EA5', secondary: '#00E5FF', style: 'grid' },
```

It then appears in `/theme`, `/set-theme`, `/config` and the tests automatically. Keep the total at **24 presets or fewer**, so a custom theme still fits Discord's 25-option menus. Run `npm run previews` and look at your card before opening a pull request. Try `npm run previews -- --custom "#bg,#primary,#secondary,style"` to experiment with colors.

## Adding a background style

1. Add an entry to `STYLES` in `src/utils/themes.js`.
2. Add a painter with the same name to `PAINTERS` in `src/utils/cardRenderer.js`. It receives `(ctx, w, h, theme)` and should keep the left side (avatar and text) calm.
3. Use the seeded `rng()` helper for any randomness so the artwork is identical on every render.

## Adding a command

Commands live in `src/commands/` and export `data` and `execute`. For buttons, menus and forms, also export `component()` and/or `modal()` and give every `customId` the form `<command-name>:<action>[:<args>]`. The router in `events/interactionCreate.js` uses the first part to find your command. Check permissions with `canManage()` from `utils/ui.js` inside admin handlers.

## Pull requests

- Keep each pull request focused on one change.
- Run `npm test` first. CI runs it on Node 20 and 22.
- Add new commands to the README tables and to `/help`.
- Don't include tokens, `.env` files, or `.db` files.

## Security

If you find a vulnerability, please don't open a public issue. Contact the maintainer privately through their GitHub profile.
