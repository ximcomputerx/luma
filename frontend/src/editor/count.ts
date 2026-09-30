const whitespace = /^\p{White_Space}+$/u;

type GraphemeSegmenter = {
  segment: (text: string) => Iterable<{ segment: string }>;
};

type SegmenterCtor = new (locales: undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter;

/**
 * 字数：Unicode 扩展字素里，至少含一个非空白标量的个数。
 * 不是分词，也不是按空格切开。和状态栏的“字符”（标量）分开计。
 */
export function countWords(text: string): number {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: SegmenterCtor }).Segmenter;
  if (Segmenter) {
    const segmenter = new Segmenter(undefined, { granularity: "grapheme" });
    let count = 0;
    for (const part of segmenter.segment(text)) {
      if (!whitespace.test(part.segment)) {
        count += 1;
      }
    }
    return count;
  }
  return Array.from(text).filter((char) => !whitespace.test(char)).length;
}
