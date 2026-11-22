import './appearance.css';
import catalog from './catalog.json' with { type: 'json' };

const byName = new Map(
  catalog.flatMap((theme) => [theme.id, ...theme.names].map((name) => [name, theme] as const)),
);

/** Only a known public title (or an ID from the library) can select a static material. */
export function campaignTheme(name: string) {
  return byName.get(name);
}

export function campaignAppearance(name: string) {
  const theme = campaignTheme(name);
  return theme ? { 'data-campaign-theme': theme.id, 'data-lettering': theme.lettering } : {};
}
