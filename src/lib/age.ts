/**
 * Exact age when the full date of birth is known; a year-precision
 * estimate (no month/day to compare against) when only the birth year is
 * known. Returns null if neither is available.
 */
export function calculateAge(dob: string | null | undefined, birthYear?: number | null): number | null {
  if (dob) {
    const birthDate = new Date(dob)
    if (Number.isNaN(birthDate.getTime())) return null

    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const hasHadBirthdayThisYear =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
    if (!hasHadBirthdayThisYear) age -= 1

    return age >= 0 ? age : null
  }

  if (birthYear) {
    const age = new Date().getFullYear() - birthYear
    return age >= 0 ? age : null
  }

  return null
}