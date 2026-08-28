import { computed, ref } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import type { UiProjectGroup } from '../../types/codex'

type PendingProjectDrag = {
  projectName: string
  fromIndex: number
  startClientX: number
  startClientY: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
}

type ActiveProjectDrag = {
  projectName: string
  fromIndex: number
  pointerOffsetY: number
  groupLeft: number
  groupWidth: number
  groupHeight: number
  groupOuterHeight: number
  ghostTop: number
  dropTargetIndexFull: number | null
}

type DragPointerSample = {
  clientX: number
  clientY: number
}

const DRAG_START_THRESHOLD_PX = 4
const PROJECT_GROUP_EXPANDED_GAP_PX = 6

export function projectProjectedDropIndex(
  dropTargetIndexFull: number | null,
  fromIndex: number,
  groupsLength: number,
): number | null {
  if (dropTargetIndexFull === null || groupsLength === 0) return null

  const boundedDropIndex = Math.max(0, Math.min(dropTargetIndexFull, groupsLength))
  const projectedIndex = boundedDropIndex > fromIndex ? boundedDropIndex - 1 : boundedDropIndex
  const boundedProjectedIndex = Math.max(0, Math.min(projectedIndex, groupsLength - 1))
  return boundedProjectedIndex === fromIndex ? null : boundedProjectedIndex
}

export interface ProjectDragAndDropDeps {
  getGroups: () => UiProjectGroup[]
  getFilteredGroups: () => UiProjectGroup[]
  isSearchActive: () => boolean
  isCollapsed: (projectName: string) => boolean
  getElevatedProjectName: () => string
  onReorderProject: (projectName: string, toIndex: number) => void
  closeProjectMenu: () => void
}

export function createProjectDragAndDrop(deps: ProjectDragAndDropDeps) {
  const {
    getGroups,
    getFilteredGroups,
    isSearchActive,
    isCollapsed,
    getElevatedProjectName,
    onReorderProject,
    closeProjectMenu,
  } = deps

  const groupsContainerRef = ref<HTMLElement | null>(null)
  const pendingProjectDrag = ref<PendingProjectDrag | null>(null)
  const activeProjectDrag = ref<ActiveProjectDrag | null>(null)
  let pendingDragPointerSample: DragPointerSample | null = null
  let dragPointerRafId: number | null = null
  const suppressNextProjectToggleId = ref('')
  const measuredHeightByProject = ref<Record<string, number>>({})
  const projectGroupElementByName = new Map<string, HTMLElement>()
  const projectNameByElement = new WeakMap<HTMLElement, string>()
  const projectGroupResizeObserver =
    typeof window !== 'undefined'
      ? new ResizeObserver((entries) => {
          for (const entry of entries) {
            const element = entry.target as HTMLElement
            const projectName = projectNameByElement.get(element)
            if (!projectName) continue
            updateMeasuredProjectHeight(projectName, element)
          }
        })
      : null

  const dragProjectNames = (): string =>
    activeProjectDrag.value?.projectName ?? pendingProjectDrag.value?.projectName ?? ''

  function updateMeasuredProjectHeight(projectName: string, element: HTMLElement): void {
    const nextHeight = element.getBoundingClientRect().height
    if (!Number.isFinite(nextHeight) || nextHeight <= 0) return

    const previousHeight = measuredHeightByProject.value[projectName]
    if (previousHeight !== undefined && Math.abs(previousHeight - nextHeight) < 0.5) {
      return
    }

    measuredHeightByProject.value = {
      ...measuredHeightByProject.value,
      [projectName]: nextHeight,
    }
  }

  function setProjectGroupRef(projectName: string, element: Element | ComponentPublicInstance | null): void {
    const previousElement = projectGroupElementByName.get(projectName)
    if (previousElement && previousElement !== element && projectGroupResizeObserver) {
      projectGroupResizeObserver.unobserve(previousElement)
    }

    const htmlElement =
      element instanceof HTMLElement
        ? element
        : element && '$el' in element && element.$el instanceof HTMLElement
          ? element.$el
          : null

    if (htmlElement) {
      projectGroupElementByName.set(projectName, htmlElement)
      projectNameByElement.set(htmlElement, projectName)
      updateMeasuredProjectHeight(projectName, htmlElement)
      projectGroupResizeObserver?.observe(htmlElement)
      return
    }

    if (previousElement) {
      projectGroupResizeObserver?.unobserve(previousElement)
    }

    projectGroupElementByName.delete(projectName)
  }

  function getProjectOuterHeight(projectName: string): number {
    const measuredHeight = measuredHeightByProject.value[projectName] ?? 0
    const drag = activeProjectDrag.value
    const dragHeight = drag?.projectName === projectName ? drag.groupHeight : null
    const baseHeight = dragHeight ?? measuredHeight
    const gap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
    return Math.max(0, baseHeight + gap)
  }

  const projectedDropProjectIndex = computed<number | null>(() => {
    const drag = activeProjectDrag.value
    if (!drag) return null
    return projectProjectedDropIndex(drag.dropTargetIndexFull, drag.fromIndex, getGroups().length)
  })

  const layoutProjectOrder = computed<string[]>(() => {
    const groups = isSearchActive() ? getFilteredGroups() : getGroups()
    const names = groups.map((group) => group.projectName)
    const drag = activeProjectDrag.value
    const projectedIndex = projectedDropProjectIndex.value

    if (!drag || projectedIndex === null) {
      return names
    }

    const next = [...names]
    const [movedProject] = next.splice(drag.fromIndex, 1)
    if (!movedProject) {
      return names
    }
    next.splice(projectedIndex, 0, movedProject)
    return next
  })

  const layoutTopByProject = computed<Record<string, number>>(() => {
    const topByProject: Record<string, number> = {}
    let currentTop = 0

    for (const projectName of layoutProjectOrder.value) {
      topByProject[projectName] = currentTop
      currentTop += getProjectOuterHeight(projectName)
    }

    return topByProject
  })

  const groupsContainerStyle = computed<Record<string, string>>(() => {
    let totalHeight = 0
    for (const projectName of layoutProjectOrder.value) {
      totalHeight += getProjectOuterHeight(projectName)
    }

    return {
      height: `${Math.max(0, totalHeight)}px`,
    }
  })

  function onProjectHandleMouseDown(event: MouseEvent, projectName: string): void {
    if (event.button !== 0) return
    if (isSearchActive()) return
    if (pendingProjectDrag.value || activeProjectDrag.value) return

    const groups = getGroups()
    const fromIndex = groups.findIndex((group) => group.projectName === projectName)
    const projectGroupElement = projectGroupElementByName.get(projectName)
    if (fromIndex < 0 || !projectGroupElement) return

    const groupRect = projectGroupElement.getBoundingClientRect()
    const groupGap = isCollapsed(projectName) ? 0 : PROJECT_GROUP_EXPANDED_GAP_PX
    pendingProjectDrag.value = {
      projectName,
      fromIndex,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pointerOffsetY: event.clientY - groupRect.top,
      groupLeft: groupRect.left,
      groupWidth: groupRect.width,
      groupHeight: groupRect.height,
      groupOuterHeight: groupRect.height + groupGap,
    }

    event.preventDefault()
    bindProjectDragListeners()
  }

  function bindProjectDragListeners(): void {
    window.addEventListener('mousemove', onProjectDragMouseMove)
    window.addEventListener('mouseup', onProjectDragMouseUp)
    window.addEventListener('keydown', onProjectDragKeyDown)
  }

  function unbindProjectDragListeners(): void {
    window.removeEventListener('mousemove', onProjectDragMouseMove)
    window.removeEventListener('mouseup', onProjectDragMouseUp)
    window.removeEventListener('keydown', onProjectDragKeyDown)
  }

  function onProjectDragMouseMove(event: MouseEvent): void {
    pendingDragPointerSample = {
      clientX: event.clientX,
      clientY: event.clientY,
    }
    scheduleProjectDragPointerFrame()
  }

  function onProjectDragMouseUp(event: MouseEvent): void {
    processProjectDragPointerSample({
      clientX: event.clientX,
      clientY: event.clientY,
    })

    const drag = activeProjectDrag.value
    if (drag && projectedDropProjectIndex.value !== null) {
      const currentProjectIndex = getGroups().findIndex((group) => group.projectName === drag.projectName)
      if (currentProjectIndex >= 0) {
        const toIndex = projectedDropProjectIndex.value
        if (toIndex !== currentProjectIndex) {
          onReorderProject(drag.projectName, toIndex)
        }
      }
    }

    resetProjectDragState({ preserveToggleSuppression: Boolean(drag) })
  }

  function onProjectDragKeyDown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return
    if (!pendingProjectDrag.value && !activeProjectDrag.value) return

    event.preventDefault()
    resetProjectDragState()
  }

  function resetProjectDragState(options: { preserveToggleSuppression?: boolean } = {}): void {
    if (dragPointerRafId !== null) {
      window.cancelAnimationFrame(dragPointerRafId)
      dragPointerRafId = null
    }
    pendingDragPointerSample = null
    pendingProjectDrag.value = null
    activeProjectDrag.value = null
    if (!options.preserveToggleSuppression) {
      suppressNextProjectToggleId.value = ''
    }
    unbindProjectDragListeners()
  }

  function scheduleProjectDragPointerFrame(): void {
    if (dragPointerRafId !== null) return

    dragPointerRafId = window.requestAnimationFrame(() => {
      dragPointerRafId = null
      if (!pendingDragPointerSample) return

      const sample = pendingDragPointerSample
      pendingDragPointerSample = null
      processProjectDragPointerSample(sample)
    })
  }

  function processProjectDragPointerSample(sample: DragPointerSample): void {
    const pending = pendingProjectDrag.value
    if (!activeProjectDrag.value && pending) {
      const deltaX = sample.clientX - pending.startClientX
      const deltaY = sample.clientY - pending.startClientY
      const distance = Math.hypot(deltaX, deltaY)
      if (distance < DRAG_START_THRESHOLD_PX) {
        return
      }

      closeProjectMenu()
      suppressNextProjectToggleId.value = pending.projectName
      activeProjectDrag.value = {
        projectName: pending.projectName,
        fromIndex: pending.fromIndex,
        pointerOffsetY: pending.pointerOffsetY,
        groupLeft: pending.groupLeft,
        groupWidth: pending.groupWidth,
        groupHeight: pending.groupHeight,
        groupOuterHeight: pending.groupOuterHeight,
        ghostTop: sample.clientY - pending.pointerOffsetY,
        dropTargetIndexFull: null,
      }
    }

    if (!activeProjectDrag.value) return
    updateProjectDropTarget(sample)
  }

  function updateProjectDropTarget(sample: DragPointerSample): void {
    const drag = activeProjectDrag.value
    if (!drag) return

    drag.ghostTop = sample.clientY - drag.pointerOffsetY
    if (!isPointerInProjectDropZone(sample)) {
      drag.dropTargetIndexFull = null
      return
    }

    const cursorY = sample.clientY
    const groupsContainer = groupsContainerRef.value
    if (!groupsContainer) {
      drag.dropTargetIndexFull = null
      return
    }

    const groups = getGroups()
    const containerRect = groupsContainer.getBoundingClientRect()
    const projectIndexByName = new Map(groups.map((group, index) => [group.projectName, index]))
    const nonDraggedProjectNames = groups
      .map((group) => group.projectName)
      .filter((projectName) => projectName !== drag.projectName)

    let accumulatedTop = 0
    let nextDropTarget = groups.length

    for (const projectName of nonDraggedProjectNames) {
      const originalIndex = projectIndexByName.get(projectName)
      if (originalIndex === undefined) continue

      const groupOuterHeight = getProjectOuterHeight(projectName)
      const groupMiddleY = containerRect.top + accumulatedTop + groupOuterHeight / 2
      if (cursorY < groupMiddleY) {
        nextDropTarget = originalIndex
        break
      }

      accumulatedTop += groupOuterHeight
    }

    drag.dropTargetIndexFull = nextDropTarget
  }

  function isPointerInProjectDropZone(sample: DragPointerSample): boolean {
    const groupsContainer = groupsContainerRef.value
    if (!groupsContainer) return false

    const bounds = groupsContainer.getBoundingClientRect()
    const xInBounds = sample.clientX >= bounds.left && sample.clientX <= bounds.right
    const yInBounds = sample.clientY >= bounds.top - 32 && sample.clientY <= bounds.bottom + 32
    return xInBounds && yInBounds
  }

  function isDraggingProject(projectName: string): boolean {
    return activeProjectDrag.value?.projectName === projectName
  }

  function projectGroupStyle(projectName: string): Record<string, string> | undefined {
    const drag = activeProjectDrag.value
    const targetTop = layoutTopByProject.value[projectName] ?? 0
    const shouldElevateForMenu = getElevatedProjectName() === projectName

    if (!drag || drag.projectName !== projectName) {
      return {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        zIndex: shouldElevateForMenu ? '40' : '1',
        transform: `translate3d(0, ${targetTop}px, 0)`,
        willChange: 'transform',
        transition: 'transform 180ms ease',
      }
    }

    return {
      position: 'fixed',
      top: '0',
      left: `${drag.groupLeft}px`,
      width: `${drag.groupWidth}px`,
      height: `${drag.groupHeight}px`,
      zIndex: '50',
      pointerEvents: 'none',
      transform: `translate3d(0, ${drag.ghostTop}px, 0)`,
      willChange: 'transform',
      transition: 'transform 0ms linear',
    }
  }

  function takeToggleSuppression(projectName: string): boolean {
    if (suppressNextProjectToggleId.value === projectName) {
      suppressNextProjectToggleId.value = ''
      return true
    }
    return false
  }

  function pruneProjectGroups(projectNames: string[]): void {
    const dragProjectName = dragProjectNames()
    if (dragProjectName && !projectNames.includes(dragProjectName)) {
      resetProjectDragState()
    }

    const projectNameSet = new Set(projectNames)
    const nextMeasuredHeights = Object.fromEntries(
      Object.entries(measuredHeightByProject.value).filter(([projectName]) => projectNameSet.has(projectName)),
    ) as Record<string, number>

    if (Object.keys(nextMeasuredHeights).length !== Object.keys(measuredHeightByProject.value).length) {
      measuredHeightByProject.value = nextMeasuredHeights
    }
  }

  function dispose(): void {
    for (const element of projectGroupElementByName.values()) {
      projectGroupResizeObserver?.unobserve(element)
    }
    projectGroupElementByName.clear()
    resetProjectDragState()
  }

  return {
    groupsContainerRef,
    groupsContainerStyle,
    setProjectGroupRef,
    isDraggingProject,
    projectGroupStyle,
    onProjectHandleMouseDown,
    takeToggleSuppression,
    pruneProjectGroups,
    dispose,
  }
}