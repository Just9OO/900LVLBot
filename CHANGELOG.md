# Changelog

## 2.0.0

### Added
- **Theme system**: 17 presets (Inferno, Sunset, Midnight, Ocean, Synthwave, Toxic, Cyberpunk, Sakura, Royal, Aurora, Frost, Amethyst, Matrix, Mocha, Carbon, Classic, Daylight), each with its own background artwork. Every card follows the server theme.
- **Custom themes**: `/custom-theme` builds a theme from three colors (background, primary, secondary) and one of 12 background styles. Text color is chosen automatically and accent colors are adjusted so cards stay readable. Includes an interactive editor with presets as starting points, a colors form and a random palette button.
- `/theme` gallery with an overview sheet, per-theme previews and one-click apply for admins.
- `/set-theme` with autocomplete.
- `/config` control panel: XP & rates, level-up messages, appearance, filters. Menus, buttons and forms.
- Level-up announcement modes (card, embed, plain text, off) and a custom message with `{user}`, `{username}`, `{level}`, `{type}`, `{role}`, `{server}`. Mentions are restricted so announcements can never ping `@everyone` or roles.
- Configurable text-XP cooldown (5–600 s).
- Leaderboard cards show member avatars and have Text / Voice toggle buttons.
- Interactive `/help` with sections; `/stats` shows a text and voice podium.
- `npm test` (unit tests) and `npm run previews` (render themes without Discord).
- `.env.example`.

### Changed
- Cards, embeds and leaderboards are all driven by the theme.
- XP maths moved to `utils/xpMath.js` so it can be used without opening the database.
- Interactions are routed by `command:action:args` custom IDs; commands own their own button, menu and modal handlers.
- Level-up announcements for text and voice share one implementation.
- Role badges on cards have emoji stripped (they rendered as boxes on hosts without an emoji font).
- Uses `flags: MessageFlags.Ephemeral` instead of the deprecated `ephemeral` option.
- `package.json` lists `better-sqlite3` (the library the code actually uses); `discord.js` minimum raised to 14.16.3.
- README rewritten, including a corrected XP table.

### Removed
- `/set-card-color`: replaced by `/custom-theme` and `/config`. Servers that had customised colors are migrated to an equivalent custom theme named *Migrated*.
- The `duration` option of `/leaderboard`: rankings were always all-time.

### Migration
The database upgrades itself on first start (new columns only; nothing is deleted).
