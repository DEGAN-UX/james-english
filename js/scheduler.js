export function createSessionPlan({ set, words, stats, reviewBudget, random = Math.random, mode }) {
  const currentWords = set.wordIds.map(id => words.find(word => word.id === id)).filter(Boolean);
  const shuffled = [...currentWords];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  const queue = shuffled.map(word => ({ wordId: word.id, target: word.text, kind: 'weekly' }));
  const plan = { queue, plannedAt: new Date().toISOString(), mode, setId: set.id };
  if (mode === 'arcade') return { ...plan, nextBudget: reviewBudget };

  const eligible = words.filter(word => {
    if (set.wordIds.includes(word.id)) return false;
    const evidence = stats[`${word.id}:${mode}`];
    return evidence && (evidence.firstMisses > 0 || evidence.consecutiveIndependentSessions < 3);
  });
  eligible.sort((left, right) => {
    const leftStats = stats[`${left.id}:${mode}`];
    const rightStats = stats[`${right.id}:${mode}`];
    return (rightStats.firstMisses * 2 + rightStats.attempts) - (leftStats.firstMisses * 2 + leftStats.attempts);
  });

  let nextBudget = reviewBudget;
  let reviewCount = 0;
  if (eligible.length) {
    nextBudget += currentWords.length / 9;
    reviewCount = Math.min(eligible.length, Math.floor(nextBudget));
    nextBudget -= reviewCount;
  } else {
    nextBudget = 0;
  }
  const reviews = eligible.slice(0, reviewCount).map(word => ({ wordId: word.id, target: word.text, kind: 'review' }));
  for (let index = 0; index < reviews.length; index += 1) {
    const position = Math.min(queue.length - 1, Math.floor(((index + 1) * queue.length) / (reviews.length + 1)));
    queue.splice(position, 0, reviews[index]);
  }
  return { ...plan, nextBudget };
}

export function wordSetKey(wordIds) {
  return JSON.stringify([...wordIds].sort());
}

export function sessionWordSetKey(session) {
  return wordSetKey(session.queue.filter(item => item.kind === 'weekly').map(item => item.wordId));
}

export function typedWholeSet(session, set) {
  if (session.mode !== 'typing' || session.setId !== set.id || !set.wordIds.length ||
      sessionWordSetKey(session) !== wordSetKey(set.wordIds)) return false;

  const typedWords = new Set(session.queue.filter(item => item.submissions.some(attempt =>
    attempt.mode === 'typing' && attempt.correct && !attempt.answerRevealed
  )).map(item => item.wordId));
  return set.wordIds.every(id => typedWords.has(id));
}

// Arcade difficulty per word: 6 letters on screen the first time, 7 after a good round, 8 after another.
export const ARCADE_LETTERS_BASE = 6;
export const ARCADE_MAX_LEVEL = 2;
export const ARCADE_WRONG_SHOT_LIMIT = 4;

export function arcadeLetterCount(level = 0) {
  return ARCADE_LETTERS_BASE + Math.max(0, Math.min(ARCADE_MAX_LEVEL, Number(level) || 0));
}

export function nextArcadeLevel(level = 0, wrongShots = 0) {
  const current = Math.max(0, Math.min(ARCADE_MAX_LEVEL, Number(level) || 0));
  return wrongShots < ARCADE_WRONG_SHOT_LIMIT ? Math.min(ARCADE_MAX_LEVEL, current + 1) : current;
}

export function nextRequiredIndex(answer, target) {
  const typed = [...answer];
  const expected = [...target];
  let matched = 0;
  while (matched < typed.length && matched < expected.length && typed[matched].toLowerCase() === expected[matched].toLowerCase()) matched += 1;
  return Math.min(matched, Math.max(0, expected.length - 1));
}

export function isNextRequiredLetter(answer, target, letter) {
  const expected = [...target];
  const answerLength = [...answer].length;
  if (!expected.length || answerLength >= expected.length) return false;
  const expectedLetter = expected[nextRequiredIndex(answer, target)];
  return expectedLetter.toLocaleLowerCase('en-GB') === letter.toLocaleLowerCase('en-GB');
}