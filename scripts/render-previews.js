#!/usr/bin/env node
/**
 * Renders sample cards to ./previews so you can look at themes without Discord.
 *
 *   npm run previews                                  every preset + the gallery sheet
 *   npm run previews -- --custom "#101820,#FF5733,#00AAFF,grid"
 *                                                     try a custom palette: bg,primary,secondary[,style]
 */
const fs = require('fs');
const path = require('path');
const R = require('../src/utils/cardRenderer');
const T = require('../src/utils/themes');

const out = path.join(__dirname, '..', 'previews');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const i = process.argv.indexOf('--custom');
  if (i !== -1) {
    const [bg, primary, secondary, style = 'aurora'] = (process.argv[i + 1] || '').split(',').map(s => s.trim());
    const colors = [bg, primary, secondary].map(T.parseColor);
    if (colors.some(c => !c)) {
      console.error('Usage: npm run previews -- --custom "#bg,#primary,#secondary[,style]"');
      console.error('Styles:', [...T.STYLE_IDS].join(', '));
      process.exit(1);
    }
    const theme = T.buildTheme({ id: 'custom', name: 'Custom', bg: colors[0], primary: colors[1], secondary: colors[2], style });
    const file = path.join(out, 'custom.png');
    fs.writeFileSync(file, await R.generateThemePreview(theme));
    console.log('Wrote', file);
    return;
  }

  for (const theme of T.listPresets()) {
    fs.writeFileSync(path.join(out, `${theme.id}.png`), await R.generateThemePreview(theme));
    console.log('•', theme.name);
  }
  fs.writeFileSync(path.join(out, 'all-themes.png'), await R.generateThemeSheet({ theme_id: T.DEFAULT_THEME_ID }));
  console.log(`\nDone — see ${out}`);
})();
