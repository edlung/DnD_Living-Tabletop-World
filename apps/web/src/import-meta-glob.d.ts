/**
 * The one bundler feature the client uses beyond plain ES modules: Vite's eager
 * `import.meta.glob` (URL maps of the GPT-made UI kit, `visual/ui-kit.ts`). Declared here
 * instead of pulling in `vite/client`, whose ambient module types would overlap the stylesheet
 * declaration.
 */
interface ImportMeta {
  glob<T>(
    pattern: string,
    options: { readonly eager: true; readonly query: '?url'; readonly import: 'default' },
  ): Record<string, T>;
}
