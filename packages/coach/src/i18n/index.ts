import type { Problem } from '../analysis';
import dePack from '../../language-packs/de.json' with { type: 'json' };
import enPack from '../../language-packs/en.json' with { type: 'json' };
import { phrasesFromPack, validateLanguagePack } from './pack';
import type { Language, LanguagePack, Phrases } from './types';

export * from './types';
export * from './own-texts';
export { TEXT_KEYS, validateLanguagePack, type PackValidation } from './pack';

function builtIn(value: unknown): LanguagePack {
  const { pack, warnings } = validateLanguagePack(value);
  if (!pack || warnings.length) throw new Error(`Built-in language pack is broken: ${warnings.join('; ')}`);
  return pack;
}

/** English is complete by definition and the fallback for every other pack. */
export const FALLBACK_PACK = builtIn(enPack);
export const BUILT_IN_PACKS: LanguagePack[] = [builtIn(dePack), FALLBACK_PACK];

/** Built-in packs plus packs loaded from disk (later ones replace earlier ones with the same id). */
export class LanguageRegistry {
  private readonly packs = new Map<Language, LanguagePack>(BUILT_IN_PACKS.map((p) => [p.id, p]));

  add(pack: LanguagePack): void {
    this.packs.set(pack.id, pack);
  }

  list(): LanguagePack[] {
    return [...this.packs.values()];
  }

  /** The pack that speaks a language: its own, the base language's ("pt" for "pt-BR"), else English. */
  get(id: Language): LanguagePack {
    return this.packs.get(id) ?? this.packs.get(id.split('-')[0]!) ?? FALLBACK_PACK;
  }

  /** own: the user's own texts for the language, over the pack's (checked already). */
  phrases(id: Language, own?: Record<string, string | string[]>): Phrases {
    const pack = this.get(id);
    return phrasesFromPack(own && Object.keys(own).length ? { ...pack, texts: { ...pack.texts, ...own } } : pack, FALLBACK_PACK);
  }
}

/** Phrases of a built-in pack. */
export function builtInPhrases(id: Language): Phrases {
  return new LanguageRegistry().phrases(id);
}

/** The two most important problems as one phrase. */
export function describeProblems(problems: Problem[], phrases: Phrases): string {
  return problems
    .slice(0, 2)
    .map((p) => phrases.problem(p))
    .join(phrases.and);
}
