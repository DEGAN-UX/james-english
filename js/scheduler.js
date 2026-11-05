export function createSessionPlan({ set, words, stats, reviewBudget, random = Math.random, mode }) {
  const currentWords = set.wordIds.map(id => words.find(word => word.id === id)).filter(Boolean);
  const shuffled = [...currentWords];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

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
  const queue = shuffled.map(word => ({ wordId: word.id, target: word.text, kind: 'weekly' }));
  const reviews = eligible.slice(0, reviewCount).map(word => ({ wordId: word.id, target: word.text, kind: 'review' }));
  for (let index = 0; index < reviews.length; index += 1) {
    const position = Math.min(queue.length - 1, Math.floor(((index + 1) * queue.length) / (reviews.length + 1)));
    queue.splice(position, 0, reviews[index]);
  }
  return { queue, nextBudget, plannedAt: new Date().toISOString(), mode, setId: set.id };
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