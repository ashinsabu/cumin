/**
 * ItemRow — a compact, reusable item row for table/list views.
 * Used by: EpicModal, BacklogView, AllItemsView, SprintView (future).
 *
 * All interactive badges (status, priority) are self-contained — they call
 * context directly, so the parent just needs to provide `item` and `onSelect`.
 */
import type { Item } from '../../types'
import { formatEstimate } from '../../hooks/useFormat'
import { ItemStatusBadge } from './ItemStatusBadge'
import { ItemPriorityBadge } from './ItemPriorityBadge'

export interface ItemRowColumns {
  id?: boolean
  priority?: boolean
  title?: boolean        // always shown
  epic?: boolean
  estimate?: boolean
  spill?: boolean
  status?: boolean
  inStatus?: boolean     // time in status bar (future)
}

interface Props {
  item: Item
  onSelect?: (item: Item) => void
  columns?: ItemRowColumns
  compact?: boolean      // tighter vertical padding
  editableStatus?: boolean
  editablePriority?: boolean
}

const DEFAULT_COLUMNS: ItemRowColumns = {
  id: true,
  priority: true,
  title: true,
  epic: true,
  estimate: true,
  spill: true,
  status: true,
}

export function ItemRow({
  item,
  onSelect,
  columns = DEFAULT_COLUMNS,
  compact = false,
  editableStatus = true,
  editablePriority = true,
}: Props) {
  const py = compact ? 'py-1.5' : 'py-2.5'
  const epicColor = item.epic_color ?? '#6b7280'

  return (
    <div
      className={`flex items-center gap-3 px-4 ${py} border-b border-line last:border-0 transition-colors ${
        onSelect ? 'cursor-pointer hover:bg-surface' : ''
      }`}
      onClick={() => onSelect?.(item)}
    >
      {columns.id && (
        <span className="text-xs font-mono text-accent shrink-0 w-14 truncate">{item.display_id}</span>
      )}

      {columns.priority && (
        <ItemPriorityBadge item={item} editable={editablePriority} />
      )}

      {columns.title && (
        <span className="text-sm text-ink flex-1 truncate min-w-0">{item.title}</span>
      )}

      {columns.epic && item.epic_name && (
        <span
          className="text-xs font-semibold px-1.5 py-0.5 rounded shrink-0 hidden sm:inline"
          style={{
            backgroundColor: epicColor + '18',
            color: epicColor,
            border: `1px solid ${epicColor}25`,
          }}
        >
          {item.epic_name.toUpperCase()}
        </span>
      )}

      {columns.estimate && item.estimate_minutes && (
        <span className="text-xs text-ghost shrink-0">{formatEstimate(item.estimate_minutes)}</span>
      )}

      {columns.spill && (item.sprints?.length ?? 0) > 1 && (
        <span className={`text-xs font-medium px-1 py-0.5 rounded shrink-0 ${
          (item.sprints!.length - 1) >= 3
            ? 'bg-red-500/10 text-red-400'
            : (item.sprints!.length - 1) === 2
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-line text-dim'
        }`}>
          ↻{item.sprints!.length - 1}
        </span>
      )}

      {columns.status && (
        <ItemStatusBadge item={item} editable={editableStatus} />
      )}
    </div>
  )
}
