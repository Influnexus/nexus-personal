// Tamil (\u0ba4\u0bae\u0bbf\u0bb4\u0bcd) \u2014 Nexus Personal.
// NOTE: Tamil strings are pending a verified native-speaker translation pass. To avoid shipping
// machine-mangled script, this locale currently inherits the English source strings via the
// per-key fallback in the translator. Selecting Tamil works end-to-end; strings render in English
// until the reviewed Tamil dictionary is dropped in here (same keys as en.ts). Ask Nexus still
// responds in Tamil because the AI layer is driven by the language directive, not this file.
import en from './en';

const ta: Record<string, string> = { ...en };

export default ta;
