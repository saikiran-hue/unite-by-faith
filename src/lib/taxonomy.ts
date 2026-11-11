// Explicit columns: never select the 384-d embedding.
export const TAXONOMY_COLUMNS =
  'slug, label, category, description, icon_name, sort_order, subgroup, synonyms, popularity, is_active';

// Only the card fields shown for other people.
export const PUBLIC_CARD_COLUMNS = 'id, full_name, display_handle, avatar_url, headline';
