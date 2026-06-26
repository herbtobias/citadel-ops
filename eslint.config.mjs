// @ts-check
// Citadel Ops — ESLint flat config.
// Extends the Nuxt-generated preset (.nuxt/eslint.config.mjs); Prettier owns
// formatting (stylistic rules disabled in nuxt.config). Run `npm run lint`.
import withNuxt from './.nuxt/eslint.config.mjs'
import prettier from 'eslint-config-prettier'

export default withNuxt({
  rules: {
    // Pragmatic defaults for an evolving codebase — warn, don't block, on the
    // common churn patterns; real errors still fail CI.
    'vue/multi-word-component-names': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
})
  .prepend({
    // Never lint generated / vendored output.
    ignores: [
      '.nuxt/**',
      '.output/**',
      '.data/**',
      'dist/**',
      'node_modules/**',
      'drizzle/**',
      'site/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
    ],
  })
  // Last word: turn off every rule that conflicts with Prettier formatting.
  .append(prettier)
