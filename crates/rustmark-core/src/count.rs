//! Phase 2 word count.
//!
//! 字数 is the number of Unicode extended grapheme clusters (UAX #29) that
//! contain at least one scalar outside Unicode White_Space.
//!
//! This is not dictionary segmentation and not a split on spaces. A family
//! emoji is one 字. A letter plus a combining mark is one 字. Spaces and
//! newlines are not 字. The status bar keeps the separate scalar 字符 count.

use unicode_segmentation::UnicodeSegmentation;

pub fn count_words(text: &str) -> usize {
    text.graphemes(true)
        .filter(|grapheme| !grapheme.chars().all(char::is_whitespace))
        .count()
}

pub fn count_scalars(text: &str) -> usize {
    text.chars().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn words_are_extended_graphemes_without_whitespace() {
        assert_eq!(count_words(""), 0);
        assert_eq!(count_words(" \n\t"), 0);
        assert_eq!(count_words("你好"), 2);
        assert_eq!(count_words("a b"), 2);
        assert_eq!(count_scalars("a b"), 3);
        assert_eq!(count_words("字 数"), 2);
        assert_eq!(count_words("e\u{0301}"), 1);
        assert_eq!(count_scalars("e\u{0301}"), 2);
        let family = "\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}\u{200D}\u{1F466}";
        assert_eq!(count_words(family), 1);
        assert!(count_scalars(family) > 1);
    }
}
