# Fix tasks view flash/flicker on auto-update

Fix tasks view flash/flicker on auto-update

## Description

The tasks list view visibly flashes or flickers when it auto-updates via WebSocket events. This likely happens because the component re-renders the entire list when new data arrives, causing a brief flash as the DOM is replaced.

## Steps to reproduce

1. Navigate to `/tasks`
2. Have tasks running or state transitions occurring
3. Observe the list flickering as updates arrive

## Possible causes

- Full list re-render on each WebSocket event (no stable keys or diffing)
- Loading state briefly shown during data refresh
- Zustand store update triggering unmount/remount of list items
- Race between WebSocket updates and historical data fetch (see prior fix in 547098f for log deduplication — similar pattern may apply here)

## Acceptance criteria

- Task list updates smoothly without visible flash
- Individual task cards update in-place when their state changes
- No layout shift when tasks are added or removed

---

_Optio Task ID: 8ae54510-7225-41d6-8e03-23658f76c6ea_
