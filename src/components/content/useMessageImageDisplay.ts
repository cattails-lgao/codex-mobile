import { ref } from 'vue'

export interface MessageImageDisplayDeps {
  isVideo: (url: string) => boolean
}

export function createMessageImageDisplay(deps: MessageImageDisplayDeps) {
  const { isVideo } = deps

  const modalImageUrl = ref('')
  const modalIsVideo = ref(false)
  const markdownImageFailureVersion = ref(0)
  const failedMarkdownImages = ref(new Set<string>())

  function markdownImageKey(messageId: string, blockIndex: number): string {
    return `${messageId}:${blockIndex}`
  }

  function isMarkdownImageFailed(messageId: string, blockIndex: number): boolean {
    return failedMarkdownImages.value.has(markdownImageKey(messageId, blockIndex))
  }

  function onMarkdownImageError(messageId: string, blockIndex: number): void {
    const next = new Set(failedMarkdownImages.value)
    next.add(markdownImageKey(messageId, blockIndex))
    failedMarkdownImages.value = next
    markdownImageFailureVersion.value += 1
  }

  function openImageModal(imageUrl: string): void {
    modalImageUrl.value = imageUrl
    modalIsVideo.value = isVideo(imageUrl)
  }

  function closeImageModal(): void {
    modalImageUrl.value = ''
    modalIsVideo.value = false
  }

  return {
    modalImageUrl,
    modalIsVideo,
    markdownImageFailureVersion,
    isMarkdownImageFailed,
    onMarkdownImageError,
    openImageModal,
    closeImageModal,
  }
}