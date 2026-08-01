// =============================================================================
// Text Formatting Utilities
// =============================================================================

/**
 * Title-case a free-text label: trim, collapse internal whitespace runs to a
 * single space, then upper-case the first letter of each whitespace-separated
 * word and lower-case the rest. Unicode-aware (handles Malay/accented text)
 * via the locale-sensitive case methods.
 *
 * "nasi GORENG cina" -> "Nasi Goreng Cina"
 */
export function toTitleCase(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) =>
      word.length === 0
        ? word
        : word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase()
    )
    .join(" ");
}
