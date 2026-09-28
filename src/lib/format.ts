export const years = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "–" : v.toFixed(digits)

export const signed = (v: number | null | undefined, digits = 1) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "–"
  const text = Math.abs(v).toFixed(digits)
  if (Number(text) === 0) return text
  return v > 0 ? `+${text}` : `−${text}`
}

/** Years per year as months, one decimal. */
export const months = (perYear: number) => Math.round(perYear * 12 * 10) / 10

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
export const words = (n: number) => WORDS[n] ?? String(n)
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
