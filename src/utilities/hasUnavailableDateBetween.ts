export function hasUnavailableDateBetween(
  unavailableDates: string[],
  start: Date,
  end: Date,
): boolean {
  return unavailableDates.some((dateStr) => {
    const date = new Date(dateStr)
    return date > start && date <= end
  })
}
