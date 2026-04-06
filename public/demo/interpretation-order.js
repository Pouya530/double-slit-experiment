/**
 * Keyboard order (1–9, 0) + UI groups for interpretation selector — PROMPT-HEADER-NAV-REDESIGN.md
 */

export const INTERP_KEYBOARD_ORDER = [
  'copenhagen',
  'decoherence',
  'qbism',
  'manyWorlds',
  'bohmian',
  'rqm',
  'objectiveCollapse',
  'orchOR',
  'vonNeumannWigner',
  'hoffman',
];

export const INTERP_KEY_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export const INTERP_UI_GROUPS = [
  { label: 'Mainstream', ids: ['copenhagen', 'decoherence'] },
  { label: 'Widely held', ids: ['qbism', 'manyWorlds', 'bohmian', 'rqm'] },
  { label: 'Minority / speculative', ids: ['objectiveCollapse', 'orchOR', 'vonNeumannWigner', 'hoffman'] },
];
