export function damerauLevenshtein(leftText, rightText) {
  const left = [...leftText];
  const right = [...rightText];
  const matrix = Array.from({ length: left.length + 1 }, () =>
    Array(right.length + 1).fill(0)
  );

  for (let row = 0; row <= left.length; row += 1) matrix[row][0] = row;
  for (let column = 0; column <= right.length; column += 1) matrix[0][column] = column;

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
      if (
        row > 1 && column > 1 &&
        left[row - 1] === right[column - 2] &&
        left[row - 2] === right[column - 1]
      ) {
        matrix[row][column] = Math.min(matrix[row][column], matrix[row - 2][column - 2] + 1);
      }
    }
  }
  return matrix[left.length][right.length];
}

export function classifyAnswer(answer, target) {
  if (answer === target) return { kind: 'correct', distance: 0, message: 'Correct!' };
  if (answer.toLocaleLowerCase('en-GB') === target.toLocaleLowerCase('en-GB')) {
    return { kind: 'case', distance: 0, message: 'Nearly! Check the capital letter.' };
  }
  const distance = damerauLevenshtein(answer.toLocaleLowerCase('en-GB'), target.toLocaleLowerCase('en-GB'));
  if (distance === 1 || (distance === 2 && target.length >= 6)) {
    return { kind: 'near', distance, message: 'Nearly! Let’s look at the letters together.' };
  }
  return { kind: 'support', distance, message: 'Good try. Let’s look together.' };
}

export function canAutoConfirmAnswer(answer, target) {
  return answer === target;
}

export function alignLetters(answer, target) {
  const source = [...answer];
  const expected = [...target];
  const costs = Array.from({ length: source.length + 1 }, () => Array(expected.length + 1).fill(0));
  for (let i = 0; i <= source.length; i += 1) costs[i][0] = i;
  for (let j = 0; j <= expected.length; j += 1) costs[0][j] = j;
  for (let i = 1; i <= source.length; i += 1) {
    for (let j = 1; j <= expected.length; j += 1) {
      costs[i][j] = Math.min(
        costs[i - 1][j] + 1,
        costs[i][j - 1] + 1,
        costs[i - 1][j - 1] + (source[i - 1].toLocaleLowerCase('en-GB') === expected[j - 1].toLocaleLowerCase('en-GB') ? 0 : 1)
      );
      if (i > 1 && j > 1 && source[i - 1].toLowerCase() === expected[j - 2].toLowerCase() && source[i - 2].toLowerCase() === expected[j - 1].toLowerCase()) {
        costs[i][j] = Math.min(costs[i][j], costs[i - 2][j - 2] + 1);
      }
    }
  }
  const aligned = [];
  let row = source.length;
  let column = expected.length;
  while (row || column) {
    if (row && column && source[row - 1].toLowerCase() === expected[column - 1].toLowerCase() && costs[row][column] === costs[row - 1][column - 1]) {
      aligned.unshift({ answer: source[--row], target: expected[--column], state: 'same' });
    } else if (row > 1 && column > 1 && source[row - 1].toLowerCase() === expected[column - 2].toLowerCase() && source[row - 2].toLowerCase() === expected[column - 1].toLowerCase() && costs[row][column] === costs[row - 2][column - 2] + 1) {
      aligned.unshift({ answer: source[row - 1], target: expected[column - 1], state: 'swap' });
      aligned.unshift({ answer: source[row - 2], target: expected[column - 2], state: 'swap' });
      row -= 2;
      column -= 2;
    } else if (row && column && costs[row][column] === costs[row - 1][column - 1] + 1) {
      aligned.unshift({ answer: source[--row], target: expected[--column], state: 'different' });
    } else if (row && costs[row][column] === costs[row - 1][column] + 1) {
      aligned.unshift({ answer: source[--row], target: '', state: 'extra' });
    } else {
      aligned.unshift({ answer: '', target: expected[--column], state: 'missing' });
    }
  }
  return aligned;
}

export function validateWord(text) {
  if (!/^[A-Za-z]+$/.test(text)) return 'Use English letters only, with no spaces or punctuation.';
  return '';
}