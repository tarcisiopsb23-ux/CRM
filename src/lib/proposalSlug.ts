// src/lib/proposalSlug.ts
import type { SupabaseClient } from '@supabase/supabase-js';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LENGTH = 10;

function randomSlug(): string {
  let result = '';
  const array = new Uint8Array(SLUG_LENGTH);
  crypto.getRandomValues(array);
  for (const byte of array) {
    result += ALPHABET[byte % ALPHABET.length];
  }
  return result;
}

/**
 * Gera um public_slug único para a tabela proposals.
 * P2: nunca retorna um slug que já exista na tabela.
 */
export async function generateUniqueSlug(
  supabase: SupabaseClient,
  maxAttempts = 5
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    const slug = randomSlug();
    const { count } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .eq('public_slug', slug);
    if (count === 0) return slug;
  }
  throw new Error('Não foi possível gerar slug único após ' + maxAttempts + ' tentativas');
}
