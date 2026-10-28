export type SpilloverPreview = { count: number; done: number; total: number }

/** Plain-language summary for the close-sprint dialog. Must never claim "all done" for an empty sprint. */
export function sprintCloseMessage({ count, done, total }: SpilloverPreview): string {
  const plural = (n: number) => `${n} item${n === 1 ? '' : 's'}`
  if (total === 0) return 'This sprint has no items — nothing to carry over.'
  if (count === 0) return `All ${plural(total)} done — nothing will carry over.`
  return `${plural(count)} will carry over to the next sprint; ${done} of ${total} done stay in this one.`
}
