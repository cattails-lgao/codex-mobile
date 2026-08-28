import { ref } from 'vue'
import {
  getSkillsList,
  listHooks,
  type SkillInfo,
  type UiHooksListEntry,
} from '../api/codexGateway'

const RECENT_SKILLS_LOAD_REUSE_MS = 2000

export interface DesktopCatalogsDeps {
  getSelectedCwd: () => string
}

export function createDesktopCatalogs(deps: DesktopCatalogsDeps) {
  const installedSkills = ref<SkillInfo[]>([])
  const hooksList = ref<UiHooksListEntry[]>([])
  const isHooksLoading = ref(false)
  let refreshSkillsPromise: Promise<void> | null = null
  let refreshHooksPromise: Promise<void> | null = null
  let hasLoadedSkills = false
  let hasLoadedHooks = false
  let lastSkillsLoadAt = 0
  let lastSkillsLoadKey = ''

  async function refreshSkills(options: { force?: boolean } = {}): Promise<void> {
    const selectedCwd = deps.getSelectedCwd().trim()
    const skillsLoadKey = selectedCwd || '__global__'
    if (refreshSkillsPromise) {
      await refreshSkillsPromise
      return
    }
    if (
      options.force !== true &&
      hasLoadedSkills &&
      lastSkillsLoadKey === skillsLoadKey &&
      Date.now() - lastSkillsLoadAt < RECENT_SKILLS_LOAD_REUSE_MS
    ) {
      return
    }

    refreshSkillsPromise = (async () => {
      try {
        installedSkills.value = await getSkillsList(selectedCwd ? [selectedCwd] : undefined)
        hasLoadedSkills = true
        lastSkillsLoadAt = Date.now()
        lastSkillsLoadKey = skillsLoadKey
      } catch {
        // Keep the previous skills while the endpoint is temporarily unavailable.
      } finally {
        refreshSkillsPromise = null
      }
    })()

    await refreshSkillsPromise
  }

  async function refreshHooks(options: { force?: boolean } = {}): Promise<void> {
    if (refreshHooksPromise) {
      await refreshHooksPromise
      return
    }
    if (options.force !== true && hasLoadedHooks) return

    isHooksLoading.value = true
    refreshHooksPromise = (async () => {
      try {
        hooksList.value = await listHooks()
        hasLoadedHooks = true
      } catch {
        // Keep the previous hooks while the endpoint is temporarily unavailable.
      } finally {
        isHooksLoading.value = false
        refreshHooksPromise = null
      }
    })()

    await refreshHooksPromise
  }

  return {
    hooksList,
    installedSkills,
    isHooksLoading,
    refreshHooks,
    refreshSkills,
  }
}
