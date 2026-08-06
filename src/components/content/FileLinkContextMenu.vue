<template>
  <div
    v-if="visible"
    ref="menuRef"
    class="file-link-context-menu"
    :style="menuStyle"
    @click.stop
  >
    <button type="button" class="file-link-context-menu-item" @click="openBrowse">
      Open link
    </button>
    <button type="button" class="file-link-context-menu-item" @click="copyLink">
      Copy link
    </button>
    <button
      v-if="editUrl"
      type="button"
      class="file-link-context-menu-item"
      @click="openEdit"
    >
      Edit file
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { copyTextToClipboard } from '../../utils/clipboard'

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  browseUrl: string
  editUrl: string
}>()

const emit = defineEmits<{
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)

const menuStyle = computed(() => ({
  left: `${String(props.x)}px`,
  top: `${String(props.y)}px`,
}))

function closeMenu(): void {
  emit('close')
}

function openBrowse(): void {
  const href = props.browseUrl
  closeMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

function openEdit(): void {
  const href = props.editUrl
  closeMenu()
  if (!href || href === '#') return
  window.open(href, '_blank', 'noopener,noreferrer')
}

async function copyLink(): Promise<void> {
  const href = props.browseUrl
  closeMenu()
  if (!href || href === '#') return

  try {
    await copyTextToClipboard(href)
  } catch {
    // Clipboard writes can be blocked by browser permissions; keep the context action best-effort.
  }
}

function onPointerDown(event: PointerEvent): void {
  if (!props.visible) return
  const menu = menuRef.value
  if (!menu) {
    closeMenu()
    return
  }
  const target = event.target
  if (target instanceof Node && menu.contains(target)) return
  closeMenu()
}

function onBlur(): void {
  closeMenu()
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  closeMenu()
}

watch(() => props.visible, (visible) => {
  if (visible) {
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('keydown', onKeydown, true)
  } else {
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('keydown', onKeydown, true)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onPointerDown, true)
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('keydown', onKeydown, true)
})
</script>

<style scoped>
@reference "tailwindcss";

.file-link-context-menu {
  @apply fixed z-[1100] flex min-w-36 flex-col gap-0.5 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl;
}

.file-link-context-menu-item {
  @apply block w-full rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900;
}
</style>
