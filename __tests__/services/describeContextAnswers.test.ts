import { describeContextAnswers } from '@/lib/contextQuestions/index';

/**
 * Unit tests for `describeContextAnswers` — the helper that turns a family's
 * submitted context answers (questionId → answerValue *codes*) into
 * human-readable { question, answer } pairs for the chat confirmation bubble.
 *
 * Background: the agent flow used to echo raw codes
 * ("Application context: saturated_switching, low_lt_10khz, yes"), which is
 * cryptic. This helper resolves each code to its question text + option label so
 * the user always sees what each selection was about.
 */
describe('describeContextAnswers', () => {
  it('resolves a B6 BJT flow to full question + label pairs, in question order', () => {
    const result = describeContextAnswers('B6', {
      operating_mode: 'saturated_switching',
      switching_frequency: 'low_lt_10khz',
      automotive: 'yes',
    });

    expect(result).toEqual([
      {
        question: 'What is the operating mode of this BJT?',
        answer: 'Saturated switching (digital logic driver, relay driver, solenoid driver, LED driver)',
      },
      {
        question: 'What is the switching frequency?',
        answer: 'Low frequency (<10kHz) — relay drivers, solenoid drivers, LED drivers',
      },
      {
        question: 'Is this an automotive application?',
        answer: 'Yes — automotive (AEC-Q101 required)',
      },
    ]);
  });

  it('keeps the answer meaningful even when the option label is bare (B5 MOSFET automotive=no)', () => {
    // The B5 automotive 'no' option has label 'No' — proving the question text
    // is what carries the meaning, not the (bare) label.
    const result = describeContextAnswers('B5', { automotive: 'no' });

    expect(result).toEqual([
      { question: 'Is this an automotive application?', answer: 'No' },
    ]);
  });

  it('follows priority/question order regardless of answer object key order', () => {
    const result = describeContextAnswers('B6', {
      automotive: 'no',
      operating_mode: 'saturated_switching',
    });

    expect(result.map((r) => r.question)).toEqual([
      'What is the operating mode of this BJT?',
      'Is this an automotive application?',
    ]);
  });

  it('skips empty / whitespace-only answers', () => {
    const result = describeContextAnswers('B6', {
      operating_mode: 'saturated_switching',
      automotive: '   ',
    });

    expect(result).toEqual([
      {
        question: 'What is the operating mode of this BJT?',
        answer: 'Saturated switching (digital logic driver, relay driver, solenoid driver, LED driver)',
      },
    ]);
  });

  it('falls back to the raw value for a free-text / unknown option code', () => {
    const result = describeContextAnswers('B6', {
      operating_mode: 'My custom free-text answer',
    });

    expect(result).toEqual([
      { question: 'What is the operating mode of this BJT?', answer: 'My custom free-text answer' },
    ]);
  });

  it('does not throw for an unknown family and falls back to questionId → value', () => {
    const result = describeContextAnswers('NOT_A_FAMILY', { some_q: 'some_val' });

    expect(result).toEqual([{ question: 'some_q', answer: 'some_val' }]);
  });

  it('returns an empty array when there are no answers', () => {
    expect(describeContextAnswers('B6', {})).toEqual([]);
  });
});
