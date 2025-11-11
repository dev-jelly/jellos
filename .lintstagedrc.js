module.exports = {
  'apps/**/*.{js,jsx,ts,tsx,mjs}': ['eslint --fix', 'prettier --write'],
  'packages/**/*.{js,jsx,ts,tsx,mjs}': ['prettier --write'],
  '*.{json,md,yml,yaml}': ['prettier --write'],
  '*.{css,scss}': ['prettier --write'],
};
