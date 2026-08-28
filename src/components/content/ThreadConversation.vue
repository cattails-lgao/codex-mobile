<template>
  <section class="conversation-root" @contextmenu.capture="onConversationContextMenu">
    <p v-if="isLoading" class="conversation-loading">{{ t('Loading messages...') }}</p>

    <p
      v-else-if="messages.length === 0 && pendingRequests.length === 0 && !liveOverlay"
      class="conversation-empty"
    >
      {{ t('No messages in this thread yet.') }}
    </p>

    <ul v-else ref="conversationListRef" class="conversation-list" @scroll="onConversationScroll">
      <li v-if="hasMoreAbove" class="conversation-load-more">
        <button
          type="button"
          class="load-more-button"
          :disabled="isLoadingMore || isLoadingPersistedAbove"
          @click="loadMoreAbove"
        >
          {{ isLoadingMore || isLoadingPersistedAbove ? t('Loading…') : t('Load earlier messages') }}
        </button>
      </li>
      <li v-if="hasColdTurns" class="conversation-load-more conversation-warm-collapse">
        <button type="button" class="load-more-button" :disabled="isLoadingMore" @click="nextColdPage">
          {{ t('Load earlier ({n} turns)', { n: coldTurnCount }) }}
        </button>
      </li>
      <ThreadTurn
        v-for="turn in renderTurns"
        :key="turn.key"
        :turn-key="turn.key"
        :warm="turn.warm"
        :warm-items="turn.warmItems"
        :request="turn.request"
        :process-items="turn.processItems"
        :final-item="turn.finalItem"
        :file-change-anchor-ids="turn.fileChangeAnchorIds"
      >
        <template #warm-card="{ warm }">
          <li
            :id="questionAnchorId(warm.turn)"
            class="conversation-item conversation-item-warm-card"
            data-role="system"
            data-message-type="warmTurn"
          >
            <div class="message-row" data-role="system">
              <div class="message-stack" data-role="system">
                <WarmTurnCard
                  :user-text="warm.userText"
                  :assistant-preview="warm.assistantPreview"
                  :tool-count="warm.toolCount"
                  :expanded="warm.expanded"
                  @toggle="toggleWarmTurn(warm.turn)"
                />
              </div>
            </div>
          </li>
        </template>
        <template #file-change="{ anchorMessageId }">
          <div class="message-row" data-role="system" data-message-type="fileChange">
            <div class="message-stack" data-role="system">
              <FileChangeSummaryBlock
                v-if="isFileChangeSummaryVisible(readAnchoredFileChangeSummaryById(anchorMessageId))"
                :summary="readAnchoredFileChangeSummaryById(anchorMessageId)"
                :expanded="isFileChangeSummaryExpandedById(anchorMessageId)"
                :cwd="props.cwd"
                :actionable="isFileChangeActionable(readAnchoredFileChangeSummaryById(anchorMessageId))"
                :action-status="fileChangeActionStatus(readAnchoredFileChangeSummaryById(anchorMessageId))"
                :action-error-text="fileChangeActionErrorText(readAnchoredFileChangeSummaryById(anchorMessageId))"
                :next-action="fileChangeNextAction(readAnchoredFileChangeSummaryById(anchorMessageId))"
                :action-label="fileChangeActionLabel(readAnchoredFileChangeSummaryById(anchorMessageId))"
                @toggle="toggleFileChangeSummaryById(anchorMessageId)"
                @open-diff="openDiffViewer(readAnchoredFileChangeSummaryById(anchorMessageId), $event)"
                @request-action="requestFileChangeAction(readAnchoredFileChangeSummaryById(anchorMessageId), $event)"
                @request-file-action="requestFileChangeFileAction(readAnchoredFileChangeSummaryById(anchorMessageId), $event)"
              />
            </div>
          </div>
        </template>
        <template #default="{ item, section }">
        <template v-for="message in [item.message]" :key="message.id">
      <template v-if="isFoldStart(message)">
      <li
        class="conversation-item conversation-item-fold"
        data-role="system"
        data-message-type="processFold"
      >
        <div class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <ProcessFold
              :label="foldLabelFor(message)"
              :running="foldRunningFor(message)"
              :has-outside-content="foldHasOutsideFor(message)"
            >
              <template v-for="toolItem in aggregatedFoldItemsFor(message)" :key="toolItemKey(toolItem)">
                <ToolBatchBlock
                  v-if="toolItem.type === 'batch'"
                  :kind="toolItem.kind"
                  :messages="toolItem.messages"
                />
                <template v-else>
                  <template v-for="foldMessage in [toolItem.message]" :key="foldMessage.id">
                    <template
                      v-if="!hiddenGroupedCommandIds.has(foldMessage.id) && !hiddenFileChangeMessageIds.has(foldMessage.id)"
                    >
                      <div v-if="isCommandMessage(foldMessage)" class="work-block-list">
                        <WorkBlockItem
                          v-for="(cmd, cmdIndex) in getWorkBlockCommands(foldMessage)"
                          :key="`work-cmd-${cmd.id}`"
                          :command="cmd"
                          :step-index="cmdIndex"
                          :expanded="isCommandExpanded(cmd)"
                          :compact="isCommandCompact(cmd)"
                          :output-condensed="isCommandOutputCondensed(cmd)"
                          @toggle="toggleCommandExpand(cmd)"
                        />
                      </div>
                      <ToolCallRow v-else-if="isToolCallMessage(foldMessage)" :message="foldMessage" />
                      <ReasoningBlock
                        v-else-if="isReasoningMessage(foldMessage)"
                        :message="foldMessage"
                        :expanded="isReasoningExpanded(foldMessage)"
                        :content-html="renderMarkdownBlocksAsHtml(foldMessage.text)"
                        @toggle="toggleReasoningExpand(foldMessage)"
                      />
                    </template>
                  </template>
                </template>
              </template>
            </ProcessFold>
          </div>
        </div>
      </li>
      </template>
      <template
        v-else-if="!isFoldMember(message)
          && !hiddenGroupedCommandIds.has(message.id)
          && !hiddenFileChangeMessageIds.has(message.id)
          && !(isWorkedMessage(message) && hiddenWorkedTurnIds.has(message.turnId ?? ''))"
      >
      <li
        :id="messageAnchorId(message)"
        class="conversation-item"
        :class="{
          'conversation-item-request': section === 'request',
          'conversation-item-process': section === 'process' || item.presentation === 'process',
          'conversation-item-final': section === 'final' || item.presentation === 'final-assistant',
          'conversation-item-plan': item.presentation === 'plan',
        }"
        :data-role="message.role"
        :data-message-type="message.messageType || ''"
      >
        <div v-if="isCompactionPendingMessage(message)" class="message-row thread-compaction-row" data-role="system">
          <div class="thread-compaction-inline thread-compaction-inline--pending" role="status">
            <span class="thread-compaction-spinner" aria-hidden="true" />
            <span>{{ t('Compacting thread context…') }}</span>
          </div>
        </div>
        <div v-else-if="isCompactionDoneMessage(message)" class="message-row thread-compaction-row" data-role="system">
          <div class="thread-compaction-inline thread-compaction-inline--done" role="status">{{ t('Context compacted') }}</div>
        </div>
        <div v-else-if="isCommandMessage(message)" class="message-row" data-role="system">
          <div class="message-stack" data-role="system">
            <div class="work-block-list">
              <WorkBlockItem
                v-for="(cmd, cmdIndex) in getWorkBlockCommands(message)"
                :key="`work-cmd-${cmd.id}`"
                :command="cmd"
                :step-index="cmdIndex"
                :expanded="isCommandExpanded(cmd)"
                :compact="isCommandCompact(cmd)"
                :output-condensed="isCommandOutputCondensed(cmd)"
                @toggle="toggleCommandExpand(cmd)"
              />
            </div>
          </div>
        </div>

        <ToolCallRow v-else-if="isToolCallMessage(message)" :message="message" />

        <div
          v-else-if="isFileChangeMessage(message)"
          class="message-row"
          :data-role="message.role"
          :data-message-type="message.messageType || ''"
        >
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <FileChangeSummaryBlock
                v-if="isFileChangeSummaryVisible(readStandaloneFileChangeSummary(message))"
                :summary="readStandaloneFileChangeSummary(message)"
                :expanded="isFileChangeSummaryExpanded(message)"
                :cwd="props.cwd"
                :actionable="isFileChangeActionable(readStandaloneFileChangeSummary(message))"
                :action-status="fileChangeActionStatus(readStandaloneFileChangeSummary(message))"
                :action-error-text="fileChangeActionErrorText(readStandaloneFileChangeSummary(message))"
                :next-action="fileChangeNextAction(readStandaloneFileChangeSummary(message))"
                :action-label="fileChangeActionLabel(readStandaloneFileChangeSummary(message))"
                @toggle="toggleFileChangeSummary(message)"
                @open-diff="openDiffViewer(readStandaloneFileChangeSummary(message), $event)"
                @request-action="requestFileChangeAction(readStandaloneFileChangeSummary(message), $event)"
                @request-file-action="requestFileChangeFileAction(readStandaloneFileChangeSummary(message), $event)"
              />
            </article>
          </div>
        </div>

        <div v-else-if="item.presentation === 'plan'" class="message-row" data-role="system" data-message-type="plan">
          <div class="message-stack" data-role="system">
            <article class="thread-plan-record">
              <div class="thread-plan-record-header">{{ t('Plan') }}</div>
              <p v-if="readPlanData(message)?.explanation" class="thread-plan-record-explanation">{{ readPlanData(message)?.explanation }}</p>
              <ol v-if="readPlanData(message)?.steps.length" class="thread-plan-record-steps">
                <li v-for="(step, stepIndex) in readPlanData(message)?.steps" :key="`${message.id}-plan-${stepIndex}`" :data-status="step.status">
                  <span class="thread-plan-record-marker" aria-hidden="true">{{ planStepCopyMarker(step.status) }}</span>
                  <span>{{ step.step }}</span>
                </li>
              </ol>
            </article>
          </div>
        </div>
        <div v-else class="message-row" :class="{ 'message-row-final': item.presentation === 'final-assistant' }" :data-role="message.role" :data-message-type="message.messageType || ''">
          <div class="message-stack" :data-role="message.role">
            <article class="message-body" :data-role="message.role">
              <ul
                v-if="message.images && message.images.length > 0"
                class="message-image-list"
                :class="{ 'message-generated-image-list': message.messageType === 'imageView' }"
                :data-role="message.role"
              >
                <li v-for="imageUrl in message.images" :key="imageUrl" class="message-image-item">
                  <button class="message-image-button" type="button" @click="openImageModal(imageUrl)">
                    <video
                      v-if="isVideoMediaUrl(imageUrl)"
                      class="message-image-preview message-video-preview"
                      :class="{ 'message-generated-image-preview': message.messageType === 'imageView' }"
                      :src="imageUrl"
                      controls
                      preload="metadata"
                    />
                    <img
                      v-else
                      class="message-image-preview"
                      :class="{ 'message-generated-image-preview': message.messageType === 'imageView' }"
                      :src="imageUrl"
                      :alt="message.messageType === 'imageView' ? 'Generated image' : 'Message image preview'"
                      loading="lazy"
                    />
                  </button>
                </li>
              </ul>

              <div v-if="message.fileAttachments && message.fileAttachments.length > 0" class="message-file-attachments">
                <span v-for="att in message.fileAttachments" :key="`${message.id}:${att.path}`" class="message-file-chip">
                  <span class="message-file-chip-icon">📄</span>
                  <a
                    class="message-file-link message-file-chip-name"
                    :href="toBrowseUrl(att.path)"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="att.path"
                  >
                    {{ att.label }}
                  </a>
                </span>
              </div>

              <div v-if="message.skills && message.skills.length > 0" class="message-skill-attachments">
                <a
                  v-for="skill in message.skills"
                  :key="`${message.id}:${skill.path}`"
                  class="message-skill-chip"
                  :href="toBrowseUrl(skill.path)"
                  :title="skill.path"
                >
                  <span class="message-skill-chip-prefix">{{ t('Skill') }}</span>
                  <span class="message-skill-chip-name">{{ skill.name }}</span>
                </a>
              </div>

              <article v-if="message.text.length > 0" class="message-card" :data-role="message.role">
                <div v-if="message.isAutomationRun" class="automation-message-label">
                  <span>Sent via automation</span>
                  <code v-if="message.automationDisplayName">{{ message.automationDisplayName }}</code>
                </div>
                <div v-if="message.messageType === 'worked'" class="work-summary-wrap" aria-live="polite">
                  <p class="work-summary-text">{{ message.text }}</p>
                </div>
                <ReasoningBlock
                  v-else-if="isReasoningMessage(message)"
                  :message="message"
                  :expanded="isReasoningExpanded(message)"
                  :content-html="renderMarkdownBlocksAsHtml(message.text)"
                  @toggle="toggleReasoningExpand(message)"
                />
                <div
                  v-else
                  class="message-text-flow"
                  v-memo="[message.id, message.text, props.cwd, highlightCacheVersion, markdownImageFailureVersion]"
                >
                  <template v-for="(block, blockIndex) in getMessageBlocks(message)" :key="`block-${blockIndex}`">
                    <p v-if="block.kind === 'paragraph'" class="message-text">
                      <MessageInlineContent :segments="getInlineSegments(block.value)" :to-browse-url="toBrowseUrl" />
                    </p>
                    <component
                      :is="headingTag(block.level)"
                      v-else-if="block.kind === 'heading'"
                      class="message-heading"
                      :class="headingClass(block.level)"
                    >
                      <MessageInlineContent :segments="getInlineSegments(block.value)" :to-browse-url="toBrowseUrl" />
                    </component>
                    <blockquote v-else-if="block.kind === 'blockquote'" class="message-blockquote">
                      <MessageInlineContent :segments="getInlineSegments(block.value)" :to-browse-url="toBrowseUrl" />
                    </blockquote>
                    <ul v-else-if="block.kind === 'unorderedList'" class="message-list message-list-unordered">
                      <li v-for="(item, itemIndex) in block.items" :key="`ul-${blockIndex}-${itemIndex}`" class="message-list-item">
                        <div class="message-list-item-content" v-html="renderListItemContentAsHtml(item)" />
                      </li>
                    </ul>
                    <ul v-else-if="block.kind === 'taskList'" class="message-list message-task-list">
                      <li v-for="(item, itemIndex) in block.items" :key="`task-${blockIndex}-${itemIndex}`" class="message-task-item">
                        <span class="message-task-checkbox" :data-checked="item.checked">{{ item.checked ? '☑' : '☐' }}</span>
                        <div class="message-list-item-text">
                          <MessageInlineContent :segments="getInlineSegments(item.text)" :to-browse-url="toBrowseUrl" />
                        </div>
                      </li>
                    </ul>
                    <ol
                      v-else-if="block.kind === 'orderedList'"
                      class="message-list message-list-ordered"
                      :start="block.start"
                    >
                      <li v-for="(item, itemIndex) in block.items" :key="`ol-${blockIndex}-${itemIndex}`" class="message-list-item">
                        <div class="message-list-item-content" v-html="renderListItemContentAsHtml(item)" />
                      </li>
                    </ol>
                    <div v-else-if="block.kind === 'table'" class="message-table-wrap">
                      <table class="message-table">
                        <thead>
                          <tr>
                            <th
                              v-for="(cell, cellIndex) in block.headers"
                              :key="`th-${blockIndex}-${cellIndex}`"
                              class="message-table-head-cell"
                              :style="{ textAlign: block.alignments[cellIndex] ?? 'left' }"
                            >
                              <MessageInlineContent :segments="getInlineSegments(cell)" :to-browse-url="toBrowseUrl" />
                            </th>
                          </tr>
                        </thead>
                        <tbody v-if="block.rows.length > 0">
                          <tr v-for="(row, rowIndex) in block.rows" :key="`tr-${blockIndex}-${rowIndex}`" class="message-table-body-row">
                            <td
                              v-for="(cell, cellIndex) in row"
                              :key="`td-${blockIndex}-${rowIndex}-${cellIndex}`"
                              class="message-table-cell"
                              :style="{ textAlign: block.alignments[cellIndex] ?? 'left' }"
                            >
                              <MessageInlineContent :segments="getInlineSegments(cell)" :to-browse-url="toBrowseUrl" />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div v-else-if="block.kind === 'codeBlock'" class="message-code-block">
                      <div v-if="block.language" class="message-code-language">{{ block.language }}</div>
                      <pre class="message-code-pre"><code class="hljs" v-html="renderCachedHighlightedCodeAsHtml(block.language, block.value)"></code></pre>
                    </div>
                    <hr v-else-if="block.kind === 'thematicBreak'" class="message-divider" />
                    <p v-else-if="isMarkdownImageFailed(message.id, blockIndex)" class="message-text">{{ block.markdown }}</p>
                    <button
                      v-else
                      class="message-image-button"
                      type="button"
                      @click="openImageModal(block.url)"
                    >
                      <video
                        v-if="isVideoMediaUrl(block.url)"
                        class="message-image-preview message-video-preview message-markdown-image"
                        :src="block.url"
                        controls
                        preload="metadata"
                      />
                      <img
                        v-else
                        class="message-image-preview message-markdown-image"
                        :src="block.url"
                        :alt="block.alt || 'Embedded message image'"
                        loading="lazy"
                        @error="onMarkdownImageError(message.id, blockIndex)"
                      />
                    </button>
                  </template>
                </div>
                <a
                  v-if="isTurnErrorMessage(message)"
                  class="turn-error-feedback"
                  :href="feedbackMailto"
                  @click="prepareTurnErrorFeedback($event, message.text)"
                >
                  {{ t('Send feedback') }}
                </a>
              </article>

              <MessageToolbar
                v-if="section !== 'process'"
                :role="message.role"
                :show-edit="showEditMessageButton(message)"
                :show-fork="showForkResponseButton(message)"
                :show-copy="showCopyResponseButton(message) || isCopyableUserMessage(message)"
                :copied="copiedResponseAnchorId === message.id"
                @edit="editMessage(message.id)"
                @fork="forkResponse(message.id)"
                @copy="message.role === 'user' ? copyUserMessage(message.id) : copyResponse(message.id)"
              />
            </article>
          </div>
        </div>
      </li>
      </template>
      </template>
      </template>
      </ThreadTurn>
      <LiveOverlayItem v-if="liveOverlay" :overlay="liveOverlay" :feedback-mailto="feedbackMailto" />
      <li ref="bottomAnchorRef" class="conversation-bottom-anchor" />
    </ul>

    <QuestionJumpBar
      :anchors="questionAnchors"
      :active-turn="activeQuestionTurn"
      @jump="jumpToQuestion"
    />

    <button
      v-if="showJumpToLatestButton"
      type="button"
      class="jump-to-latest-button"
      :title="t('Jump to latest')"
      :aria-label="t('Jump to latest output')"
      @click="jumpToLatest"
    >
      <IconTablerArrowUp class="icon-svg jump-to-latest-icon" />
    </button>

    <div v-if="modalImageUrl.length > 0" class="image-modal-backdrop" @click="closeImageModal">
      <div class="image-modal-content" @click.stop>
        <button class="image-modal-close" type="button" :aria-label="t('Close image preview')" @click="closeImageModal">
          <IconTablerX class="icon-svg" />
        </button>
        <video
          v-if="modalIsVideo"
          class="image-modal-image"
          :src="modalImageUrl"
          controls
          autoplay
        />
        <img v-else class="image-modal-image" :src="modalImageUrl" :alt="t('Expanded message image')" />
      </div>
    </div>

    <FileLinkContextMenu
      :visible="isFileLinkContextMenuVisible"
      :x="fileLinkContextMenuX"
      :y="fileLinkContextMenuY"
      :browse-url="fileLinkContextBrowseUrl"
      :edit-url="fileLinkContextEditUrl"
      @close="closeFileLinkContextMenu"
    />

    <DiffViewer
      :change="activeDiffViewerChange"
      :changes="diffViewerChanges"
      :lines="activeDiffViewerLines"
      :is-mobile="isMobile"
      :is-file-list-open="isDiffViewerFileListOpen"
      :cwd="props.cwd"
      @close="closeDiffViewer"
      @select-change="selectDiffViewerChange"
      @toggle-file-list="toggleDiffViewerFileList"
      @close-file-list="closeDiffViewerFileList"
    />
  </section>
  <ConfirmDialog
    :visible="pendingConfirm !== null"
    :title="pendingConfirmTitle"
    :message="pendingConfirmMessage"
    confirm-label="Confirm"
    danger
    @confirm="confirmPendingAction"
    @cancel="pendingConfirm = null"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { UiFileChange, UiLiveOverlay, UiMessage, UiPlanStep, UiServerRequest } from '../../types/codex'
import { updateThreadFileChanges } from '../../api/codexGateway'
import { useFeedbackDiagnostics } from '../../composables/useFeedbackDiagnostics'
import { useMobile } from '../../composables/useMobile'
import { useUiLanguage } from '../../composables/useUiLanguage'
import { copyTextToClipboard, copyTextWithSelectionFallback } from '../../utils/clipboard'
import { readPlanData } from '../../utils/plan'
import { headingClass, headingTag } from '../../utils/conversationPaths'
import {
  buildFileChangeCopyText as buildFileChangeCopyTextCore,
  displayFileChangePath as displayFileChangePathCore,
  type TurnFileChangeSummary,
} from '../../utils/conversationFileChanges'
import { createFileChangeSummaries } from './useFileChangeSummaries'

function buildFileChangeCopyText(summary: TurnFileChangeSummary | null): string {
  return buildFileChangeCopyTextCore(summary, props.cwd, t)
}

function displayFileChangePath(pathValue: string): string {
  return displayFileChangePathCore(pathValue, props.cwd)
}

import IconTablerArrowUp from '../icons/IconTablerArrowUp.vue'
import IconTablerX from '../icons/IconTablerX.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import DiffViewer from './DiffViewer.vue'
import FileChangeSummaryBlock from './FileChangeSummaryBlock.vue'
import FileLinkContextMenu from './FileLinkContextMenu.vue'
import LiveOverlayItem from './LiveOverlayItem.vue'
import MessageInlineContent from './MessageInlineContent.vue'
import MessageToolbar from './MessageToolbar.vue'
import ProcessFold from './ProcessFold.vue'
import QuestionJumpBar, { type QuestionAnchor } from './QuestionJumpBar.vue'
import ReasoningBlock from './ReasoningBlock.vue'
import ToolBatchBlock from './ToolBatchBlock.vue'
import ToolCallRow from './ToolCallRow.vue'
import ThreadTurn, {
  type ConversationTurnItem,
  type WarmTurnRenderData,
} from './ThreadTurn.vue'
import WarmTurnCard from './WarmTurnCard.vue'
import WorkBlockItem from './WorkBlockItem.vue'
import {
  buildProcessFoldLabel,
  buildProcessFolds,
  type ProcessFoldItem,
} from '../../utils/conversationFolds'
import {
  buildTurnGroups,
  buildTurnRenderGroups,
  compactQuestionText,
  createWarmLayerState,
  messagesForTurnsFrom,
  warmColdPageForTurn,
  warmLayerForSession,
  warmLayerWithColdPageAtLeast,
  warmLayerWithExpandedTurn,
  warmLayerWithNextColdPage,
  warmPagination,
  warmUserPreview,
  type WarmLayerState,
} from '../../utils/transcriptGrouping'
import {
  aggregateToolMessages,
  type ToolRenderItem,
} from '../../utils/toolAggregation'
import { formatTurnDuration } from '../../composables/useDesktopState'
import { createMarkdownRendering } from './useMarkdownRendering'

const markdownRendering = createMarkdownRendering({
  getCwd: () => props.cwd,
  isVideoMediaUrl,
})
const {
  highlightCacheVersion,
  hasHighlightLoaded,
  ensureHighlightJsLoaded,
  getInlineSegments,
  toBrowseUrl,
  toEditUrlFromBrowseHref,
  getMessageBlocks,
  renderListItemContentAsHtml,
  renderCachedHighlightedCodeAsHtml,
  renderMarkdownBlocksAsHtml,
  clearRenderCaches,
} = markdownRendering

const expandedCommandIds = ref<Set<string>>(new Set())
const collapsedAutoCommandIds = ref<Set<string>>(new Set())
const isFileLinkContextMenuVisible = ref(false)
const fileLinkContextMenuX = ref(0)
const fileLinkContextMenuY = ref(0)
const fileLinkContextBrowseUrl = ref('')
const fileLinkContextEditUrl = ref('')
const { isMobile } = useMobile()
const fileChangeSummaries = createFileChangeSummaries({
  getMessages: () => props.messages,
  getLiveTurnId: () => props.liveTurnId ?? '',
  isFileChangeMessage,
  isCopyableAssistantMessage,
  isReasoningMessage,
  isPlanMessage,
  isFoldMember,
  getHiddenGroupedCommandIds: () => hiddenGroupedCommandIds.value,
  isMobile: () => isMobile.value,
})
const {
  anchoredFileChangeSummaryByAnchorId,
  hiddenFileChangeMessageIds,
  isDiffViewerFileListOpen,
  diffViewerChanges,
  activeDiffViewerChange,
  activeDiffViewerLines,
  toggleFileChangeSummary,
  isFileChangeSummaryExpanded,
  openDiffViewer,
  closeDiffViewer,
  toggleDiffViewerFileList,
  closeDiffViewerFileList,
  selectDiffViewerChange,
  readAnchoredFileChangeSummaryById,
  isFileChangeSummaryExpandedById,
  toggleFileChangeSummaryById,
  readAnchoredFileChangeSummary,
  readStandaloneFileChangeSummary,
  isFileChangeSummaryVisible,
  pruneFileChangeSummaryIds,
} = fileChangeSummaries
const { buildFeedbackMailto, feedbackMailtoBase, recordVisibleFailure } = useFeedbackDiagnostics()
const { t } = useUiLanguage()
const feedbackMailto = feedbackMailtoBase()

function prepareTurnErrorFeedback(event: MouseEvent, message: string): void {
  recordVisibleFailure(message)
  const target = event.currentTarget
  if (target instanceof HTMLAnchorElement) {
    target.href = buildFeedbackMailto()
  }
}

function isCommandMessage(message: UiMessage): boolean {
  return message.messageType === 'commandExecution' && !!message.commandExecution
}

function isCompactionPendingMessage(message: UiMessage): boolean {
  return message.messageType === 'compaction.pending'
}

function isCompactionDoneMessage(message: UiMessage): boolean {
  return message.messageType === 'compaction.done'
}

function isPlanMessage(message: UiMessage): boolean {
  return message.messageType === 'plan' || message.messageType === 'plan.live'
}

function isReasoningMessage(message: UiMessage): boolean {
  return message.messageType === 'reasoning' && Boolean(message.reasoning)
}

const expandedReasoningIds = ref<Set<string>>(new Set())

function isReasoningExpanded(message: UiMessage): boolean {
  return expandedReasoningIds.value.has(message.id)
}

function toggleReasoningExpand(message: UiMessage): void {
  const next = new Set(expandedReasoningIds.value)
  if (next.has(message.id)) next.delete(message.id)
  else next.add(message.id)
  expandedReasoningIds.value = next
}

function isToolCallMessage(message: UiMessage): boolean {
  return message.messageType === 'toolCall' && Boolean(message.toolCall)
}

function isTurnErrorMessage(message: UiMessage): boolean {
  return message.messageType === 'turnError'
}

function isFileChangeMessage(message: UiMessage): boolean {
  return message.messageType === 'fileChange'
    && message.fileChangeStatus === 'completed'
    && Array.isArray(message.fileChanges)
    && message.fileChanges.length > 0
}

function isCopyableAssistantMessage(message: UiMessage): boolean {
  return message.role === 'assistant'
    && !isCommandMessage(message)
    && message.messageType !== 'worked'
    && !(message.messageType ?? '').endsWith('.live')
}

const activeCommandMessageId = computed(() => {
  for (let index = props.messages.length - 1; index >= 0; index -= 1) {
    const message = props.messages[index]
    if (message.messageType === 'commandExecution' && message.commandExecution?.status === 'inProgress') {
      return message.id
    }
  }
  return ''
})

const hasLiveAssistantText = computed(() =>
  props.messages.some((message) =>
    message.role === 'assistant' &&
    message.messageType === 'agentMessage.live' &&
    message.text.trim().length > 0,
  ),
)

const isLiveTurnRuntime = computed(() =>
  Boolean(props.liveOverlay) || activeCommandMessageId.value.length > 0 || hasLiveAssistantText.value,
)

const groupedCommandsByLatestId = computed<Record<string, UiMessage[]>>(() => {
  const next: Record<string, UiMessage[]> = {}
  for (let index = 0; index < props.messages.length;) {
    const message = props.messages[index]
    if (!isCommandMessage(message)) {
      index += 1
      continue
    }

    const block: UiMessage[] = []
    while (index < props.messages.length && isCommandMessage(props.messages[index])) {
      block.push(props.messages[index])
      index += 1
    }

    if (block.length <= 1) continue
    const latest = block[block.length - 1]
    next[latest.id] = block.slice(0, -1)
  }
  return next
})

const hiddenGroupedCommandIds = computed(() => {
  const next = new Set<string>()
  for (const commands of Object.values(groupedCommandsByLatestId.value)) {
    for (const command of commands) {
      next.add(command.id)
    }
  }
  return next
})

function isCommandAutoExpanded(message: UiMessage): boolean {
  return !hasLiveAssistantText.value && message.id === activeCommandMessageId.value
}

function isCommandExpanded(message: UiMessage): boolean {
  if (!isCommandMessage(message)) return false
  return expandedCommandIds.value.has(message.id)
    || (!collapsedAutoCommandIds.value.has(message.id) && isCommandAutoExpanded(message))
}

function isCommandCompact(message: UiMessage): boolean {
  return isCommandMessage(message) && isLiveTurnRuntime.value
}

function isCommandOutputCondensed(message: UiMessage): boolean {
  return isCommandMessage(message) && (isLiveTurnRuntime.value || message.commandExecution?.status === 'inProgress')
}

function toggleCommandExpand(message: UiMessage): void {
  if (!isCommandMessage(message)) return

  const nextExpanded = new Set(expandedCommandIds.value)
  const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
  const isAutoExpanded = isCommandAutoExpanded(message)
  const isManuallyExpanded = nextExpanded.has(message.id)

  if (isManuallyExpanded) {
    nextExpanded.delete(message.id)
    if (isAutoExpanded) nextCollapsedAuto.add(message.id)
  } else if (isAutoExpanded && !nextCollapsedAuto.has(message.id)) {
    nextCollapsedAuto.add(message.id)
  } else {
    nextExpanded.add(message.id)
    nextCollapsedAuto.delete(message.id)
  }

  expandedCommandIds.value = nextExpanded
  collapsedAutoCommandIds.value = nextCollapsedAuto
}

function getGroupedCommandsForLatest(message: UiMessage): UiMessage[] {
  return groupedCommandsByLatestId.value[message.id] ?? []
}

function getWorkBlockCommands(message: UiMessage): UiMessage[] {
  if (!isCommandMessage(message)) return []
  return [...getGroupedCommandsForLatest(message), message]
}

function pruneCommandIdSet(source: Set<string>, validIds: Set<string>): Set<string> {
  if (source.size === 0) return source
  const next = new Set<string>()
  for (const id of source) {
    if (validIds.has(id)) next.add(id)
  }
  return next.size === source.size ? source : next
}

const props = defineProps<{
  messages: UiMessage[]
  pendingRequests: UiServerRequest[]
  liveOverlay: UiLiveOverlay | null
  liveTurnId?: string
  isLoading: boolean
  activeThreadId: string
  cwd: string
  hasMorePersistedAbove?: boolean
  isLoadingPersistedAbove?: boolean
  loadEarlierMessages?: (threadId: string) => Promise<void>
}>()

const emit = defineEmits<{
  forkThread: [payload: { threadId: string; turnIndex: number }]
  rollback: [payload: { turnId: string }]
  respondServerRequest: [payload: { id: number; result?: unknown; error?: { code?: number; message: string } }]
  fileChangesChanged: [threadId: string]
}>()

const conversationListRef = ref<HTMLElement | null>(null)
const bottomAnchorRef = ref<HTMLElement | null>(null)
const modalImageUrl = ref('')
const modalIsVideo = ref(false)
const copiedResponseAnchorId = ref('')
const fileChangeActionState = ref<Record<string, 'idle' | 'undoing' | 'redoing' | 'undone' | 'redone'>>({})
const fileChangeActionError = ref<Record<string, string>>({})
const fileChangeRedoPatchIds = ref<Record<string, string[]>>({})

type PendingFileChangeConfirm = {
  kind: 'file-change'
  summary: TurnFileChangeSummary | null
  action: 'undo' | 'redo'
  filePaths?: string[]
  filePathLabel?: string
}
type PendingEditConfirm = {
  kind: 'edit-message'
  messageId: string
}
const pendingConfirm = ref<PendingEditConfirm | PendingFileChangeConfirm | null>(null)
const pendingConfirmTitle = computed(() => {
  const pending = pendingConfirm.value
  if (!pending) return ''
  if (pending.kind === 'edit-message') return t('Rollback this turn?')
  return pending.action === 'undo' ? t('Undo file changes?') : t('Redo file changes?')
})
const pendingConfirmMessage = computed(() => {
  const pending = pendingConfirm.value
  if (!pending) return ''
  if (pending.kind === 'edit-message') {
    return t('This rolls the thread back to this turn so you can edit the message. Later replies will be removed.')
  }
  if (pending.filePathLabel) {
    return pending.action === 'undo'
      ? t('Undo the changes to {file}? This modifies the working tree and Codex cannot revert it automatically.', { file: pending.filePathLabel })
      : t('Redo the changes to {file}? This reapplies the edits to the working tree.', { file: pending.filePathLabel })
  }
  return pending.action === 'undo'
    ? t('Undo the file changes from this turn? This modifies the working tree and Codex cannot revert it automatically.')
    : t('Redo the file changes from this turn? This reapplies the edits to the working tree.')
})
const toolQuestionAnswers = ref<Record<string, string>>({})
const toolQuestionOtherAnswers = ref<Record<string, string>>({})
const mcpElicitationAnswers = ref<Record<string, string | number | boolean | string[]>>({})
const autoFollowOutput = ref(true)
const BOTTOM_THRESHOLD_PX = 16
let conversationScrollFrame = 0
let bottomLockFrame = 0
let bottomLockFramesLeft = 0
let copiedMessageResetTimer: ReturnType<typeof setTimeout> | null = null
let conversationScrollPromise: Promise<void> | null = null
const trackedPendingImages = new WeakSet<HTMLImageElement>()
const markdownImageFailureVersion = ref(0)

// hot/warm/cold 三区（阶段 B）：hot 区 = 最后 HOT_TURNS 轮全量渲染；其前轮次进 warm
// （折叠摘要卡，单轮展开）与 cold（前端分页，Load earlier 按钮逐页展示）。
const HOT_TURNS = 30
const WARM_PAGE_SIZE = 20
const LOAD_MORE_SCROLL_THRESHOLD_PX = 200

const warmLayerState = ref<WarmLayerState>(createWarmLayerState(props.activeThreadId))
const activeWarmLayer = computed(() => warmLayerForSession(warmLayerState.value, props.activeThreadId))

const isLoadingMore = ref(false)

const filteredMessages = computed(() => props.messages.filter((message) => !isPlanMessage(message)))

const turnGroups = computed(() => buildTurnGroups(filteredMessages.value))

const warmPaginationResult = computed(() =>
  warmPagination({
    turnCount: turnGroups.value.length,
    hotTurns: HOT_TURNS,
    pageSize: WARM_PAGE_SIZE,
    coldPage: activeWarmLayer.value.coldPage,
  }),
)

const warmStartTurn = computed(() => warmPaginationResult.value.warmStartTurn)
const warmEndTurn = computed(() => warmPaginationResult.value.warmEndTurn)
const coldTurnCount = computed(() => warmPaginationResult.value.coldTurnCount)
const hasColdTurns = computed(() => coldTurnCount.value > 0)
const expandedWarmTurns = computed(() => activeWarmLayer.value.expandedWarmTurns)

type RenderMessageItem = ConversationTurnItem

type ConversationRenderTurn = {
  key: string
  warm?: WarmTurnRenderData
  warmItems: RenderMessageItem[]
  request?: RenderMessageItem
  processItems: RenderMessageItem[]
  fileChangeAnchorIds: string[]
  finalItem?: RenderMessageItem
}

// Warm 继续使用既有扁平展开，Hot 改为真正的 request / process / final turn 容器。
const renderTurns = computed<ConversationRenderTurn[]>(() => {
  const messages = filteredMessages.value
  const groups = turnGroups.value
  const turns: ConversationRenderTurn[] = []
  const expanded = expandedWarmTurns.value

  for (let turn = warmStartTurn.value; turn < warmEndTurn.value; turn += 1) {
    const group = groups[turn]
    if (!group) continue
    const warm: WarmTurnRenderData = {
      turn,
      userText: warmUserPreview(group.userItem.text),
      assistantPreview: group.assistantPreview,
      toolCount: group.toolCount,
      expanded: expanded.has(turn),
    }
    const warmItems = expanded.has(turn)
      ? messages.slice(group.startIdx, group.endIdx).map((message) => ({ message }))
      : []
    turns.push({ key: `warm-${turn}`, warm, warmItems, processItems: [], fileChangeAnchorIds: [] })
  }

  const hotMessages = messagesForTurnsFrom(messages, groups, warmEndTurn.value)
  const firstHotMessage = hotMessages[0]
  if (!firstHotMessage) return turns
  const hotStartIndex = props.messages.findIndex((message) => message.id === firstHotMessage.id)
  const hotSourceMessages = hotStartIndex >= 0 ? props.messages.slice(hotStartIndex) : hotMessages

  for (const group of buildTurnRenderGroups(hotSourceMessages, {
    liveOverlayActive: props.liveOverlay !== null,
    liveTurnId: props.liveTurnId,
  })) {
    const request = group.items.find((item) => item.kind === 'user')
    const finalItem = group.items.find((item) => item.kind === 'final-assistant')
    const processItems = group.items
      .filter((item) => item !== request && item !== finalItem)
      .map((item) => ({
        message: item.message,
        presentation: item.kind === 'plan' ? 'plan' as const : 'process' as const,
      }))

    const fileChangeAnchorIds = group.items
      .map((item) => item.message.id)
      .filter((messageId) => Boolean(readAnchoredFileChangeSummaryById(messageId)))

    turns.push({
      key: group.key,
      warmItems: [],
      request: request ? { message: request.message } : undefined,
      processItems,
      fileChangeAnchorIds,
      finalItem: finalItem ? { message: finalItem.message, presentation: 'final-assistant' } : undefined,
    })
  }
  return turns
})

function nextColdPage(): void {
  warmLayerState.value = warmLayerWithNextColdPage(warmLayerState.value, props.activeThreadId)
}

function toggleWarmTurn(turn: number): void {
  warmLayerState.value = warmLayerWithExpandedTurn(
    warmLayerState.value,
    props.activeThreadId,
    turn,
    !expandedWarmTurns.value.has(turn),
  )
}

// 阶段 C 问题导航 JumpBar：每个轮次（user 消息为界）一个圆点，悬停预览问题文本，
// 点击翻页/展开后滚动到该轮锚点。
const questionAnchors = computed<QuestionAnchor[]>(() =>
  turnGroups.value.map((group, turn) => ({ turn, text: compactQuestionText(group.userItem.text) })),
)

const activeQuestionTurn = computed(() => Math.max(0, questionAnchors.value.length - 1))

const turnIndexByUserMessageId = computed(() => {
  const map = new Map<string, number>()
  turnGroups.value.forEach((group, turn) => {
    map.set(group.userItem.id, turn)
  })
  return map
})

function questionAnchorId(turn: number): string {
  return `question-anchor-${turn}`
}

function messageAnchorId(message: UiMessage): string | undefined {
  const turn = turnIndexByUserMessageId.value.get(message.id)
  if (turn === undefined) return undefined
  // warm/cold 区锚点在 warm-card 头部（含未展开轮），消息 li 只给 hot 区轮次挂锚点，避免重复 id
  if (turn < warmEndTurn.value) return undefined
  return questionAnchorId(turn)
}

function jumpToQuestion(turn: number): void {
  if (turn < warmEndTurn.value) {
    let next = warmLayerState.value
    if (turn < warmStartTurn.value) {
      const neededPage = warmColdPageForTurn({
        turn,
        turnCount: turnGroups.value.length,
        hotTurns: HOT_TURNS,
        pageSize: WARM_PAGE_SIZE,
      })
      next = warmLayerWithColdPageAtLeast(next, props.activeThreadId, neededPage)
    }
    next = warmLayerWithExpandedTurn(next, props.activeThreadId, turn, true)
    warmLayerState.value = next
  }
  autoFollowOutput.value = false
  void nextTick().then(() => {
    const container = conversationListRef.value
    const el = document.getElementById(questionAnchorId(turn))
    if (!container || !el) return
    const rect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const top = container.scrollTop + rect.top - containerRect.top - 12
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  })
}

// Process Fold 只在实际可见的 Warm 展开消息与 Hot 消息中计算；不依赖 turn 容器，避免与文件变更摘要形成响应式循环。
const renderedMessagesForFolds = computed(() => {
  const messages = filteredMessages.value
  const groups = turnGroups.value
  const rendered: UiMessage[] = []
  for (let turn = warmStartTurn.value; turn < warmEndTurn.value; turn += 1) {
    if (!expandedWarmTurns.value.has(turn)) continue
    const group = groups[turn]
    if (group) rendered.push(...messages.slice(group.startIdx, group.endIdx))
  }
  const hotMessages = messagesForTurnsFrom(messages, groups, warmEndTurn.value)
  const firstHotMessage = hotMessages[0]
  if (!firstHotMessage) return rendered
  const hotStartIndex = props.messages.findIndex((message) => message.id === firstHotMessage.id)
  rendered.push(...(hotStartIndex >= 0 ? props.messages.slice(hotStartIndex) : hotMessages))
  return rendered
})

const processFolds = computed(() => buildProcessFolds(renderedMessagesForFolds.value))

const foldByStartId = computed(() => {
  const map = new Map<string, ProcessFoldItem>()
  for (const fold of processFolds.value) {
    const startId = fold.messages[0]?.id ?? ''
    if (startId) map.set(startId, fold)
  }
  return map
})

const foldMemberIds = computed(() => {
  const set = new Set<string>()
  for (const fold of processFolds.value) {
    for (const message of fold.messages) set.add(message.id)
  }
  return set
})

const hiddenWorkedTurnIds = computed(() => {
  const set = new Set<string>()
  for (const fold of processFolds.value) set.add(fold.turnId)
  return set
})

function isFoldStart(message: UiMessage): boolean {
  return foldByStartId.value.has(message.id)
}

function isFoldMember(message: UiMessage): boolean {
  return foldMemberIds.value.has(message.id)
}

function foldMessagesFor(message: UiMessage): UiMessage[] {
  return foldByStartId.value.get(message.id)?.messages ?? []
}

// round-24：fold 的最后一条消息（轮末命令/工具）作为 fileChange 锚点的实际挂载点
function foldTailMessage(message: UiMessage): UiMessage {
  const messages = foldMessagesFor(message)
  return messages[messages.length - 1] ?? message
}

function foldAnchoredFileChangeSummary(message: UiMessage): TurnFileChangeSummary | null {
  return readAnchoredFileChangeSummary(foldTailMessage(message))
}

// 阶段 C 工具聚合：折叠成员序列先经 aggregateToolMessages 拆成「单条/聚合批」再渲染，
// 连续只读工具合并为 ReadOnlyBatch 样式，连续同类 modify/delegate 合并为 ToolGroup 样式。
function aggregatedFoldItemsFor(message: UiMessage): ToolRenderItem[] {
  return aggregateToolMessages(foldMessagesFor(message))
}

function toolItemKey(item: ToolRenderItem): string {
  if (item.type === 'batch') return `tool-batch-${item.kind}-${item.messages[0]?.id ?? ''}`
  return item.message.id
}

function foldLabelFor(message: UiMessage): string {
  const fold = foldByStartId.value.get(message.id)
  return fold ? buildProcessFoldLabel(fold, { t, formatDuration: formatTurnDuration }) : ''
}

function foldRunningFor(message: UiMessage): boolean {
  return foldByStartId.value.get(message.id)?.running ?? false
}

function foldHasOutsideFor(message: UiMessage): boolean {
  return foldByStartId.value.get(message.id)?.hasOutsideContent ?? true
}

function isWorkedMessage(message: UiMessage): boolean {
  return message.messageType === 'worked'
}

const hasMoreAbove = computed(() => props.hasMorePersistedAbove === true)

const showJumpToLatestButton = computed(
  () => !autoFollowOutput.value && (props.messages.length > 0 || props.pendingRequests.length > 0 || Boolean(props.liveOverlay)),
)

type ParsedToolQuestion = {
  id: string
  header: string
  question: string
  isSecret: boolean
  isOther: boolean
  options: Array<{ label: string; description: string }>
}
type McpElicitationFieldOption = {
  value: string
  label: string
}
type McpElicitationField = {
  key: string
  label: string
  description: string
  required: boolean
  kind: 'string' | 'number' | 'boolean' | 'singleEnum' | 'multiEnum'
  inputType: string
  options: McpElicitationFieldOption[]
  defaultValue: string | number | boolean | string[]
}

function planStepCopyMarker(status: UiPlanStep['status']): string {
  switch (status) {
    case 'completed':
      return '[x]'
    case 'inProgress':
      return '[~]'
    default:
      return '[ ]'
  }
}

function buildPlanCopyText(message: UiMessage): string {
  const planData = readPlanData(message)
  if (!planData) return ''

  const sections: string[] = []
  if (planData.explanation?.trim()) {
    sections.push(planData.explanation.trim())
  }

  if (planData.steps.length > 0) {
    sections.push(planData.steps.map((step) => `- ${planStepCopyMarker(step.status)} ${step.step}`.trim()).join('\n'))
  }

  return sections.join('\n\n').trim()
}

function buildCopyableMessageContent(message: UiMessage): string {
  const sections: string[] = []
  const rawTextContent = message.text.trim() || buildPlanCopyText(message)
  const textContent = isPlanMessage(message) && rawTextContent
    ? `Plan\n${rawTextContent}`
    : rawTextContent
  if (textContent) {
    sections.push(textContent)
  }

  const attachmentLines = (message.fileAttachments ?? [])
    .map((attachment) => attachment.path.trim())
    .filter((pathValue) => pathValue.length > 0)
  if (attachmentLines.length > 0) {
    sections.push(`Files:\n${attachmentLines.join('\n')}`)
  }

  const imageLines = (message.images ?? [])
    .map((imageUrl) => imageUrl.trim())
    .filter((imageUrl) => imageUrl.length > 0)
  if (imageLines.length > 0) {
    sections.push(`Images:\n${imageLines.join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

const copyableResponseContentByAnchorId = computed<Record<string, string>>(() => {
  const groupedResponses = new Map<string, { anchorMessageId: string; parts: string[] }>()

  for (const message of props.messages) {
    if (!isCopyableAssistantMessage(message)) continue

    const content = buildCopyableMessageContent(message)
    if (!content) continue

    const responseKey = typeof message.turnIndex === 'number'
      ? `turn:${message.turnIndex}`
      : `message:${message.id}`
    const existing = groupedResponses.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.parts.push(content)
      continue
    }

    groupedResponses.set(responseKey, {
      anchorMessageId: message.id,
      parts: [content],
    })
  }

  const next: Record<string, string> = {}
  for (const response of groupedResponses.values()) {
    const content = response.parts.join('\n\n').trim()
    if (!content) continue
    next[response.anchorMessageId] = content
  }

  for (const [anchorMessageId, summary] of Object.entries(anchoredFileChangeSummaryByAnchorId.value)) {
    if (summary.source !== 'metadata') continue
    const fileChangeCopy = buildFileChangeCopyText(summary)
    if (!fileChangeCopy) continue
    const existing = next[anchorMessageId]?.trim()
    next[anchorMessageId] = existing ? `${existing}\n\n${fileChangeCopy}` : fileChangeCopy
  }
  return next
})

const forkableTurnIndexByAnchorId = computed<Record<string, number>>(() => {
  const groupedTurns = new Map<string, { anchorMessageId: string; turnIndex: number }>()

  for (const message of props.messages) {
    if (!isCopyableAssistantMessage(message) || typeof message.turnIndex !== 'number') continue

    const responseKey = `turn:${message.turnIndex}`
    const existing = groupedTurns.get(responseKey)
    if (existing) {
      existing.anchorMessageId = message.id
      existing.turnIndex = message.turnIndex
      continue
    }

    groupedTurns.set(responseKey, {
      anchorMessageId: message.id,
      turnIndex: message.turnIndex,
    })
  }

  const next: Record<string, number> = {}
  for (const groupedTurn of groupedTurns.values()) {
    next[groupedTurn.anchorMessageId] = groupedTurn.turnIndex
  }
  return next
})

function showCopyResponseButton(message: UiMessage): boolean {
  return typeof copyableResponseContentByAnchorId.value[message.id] === 'string'
}

// round-23：用户消息下新增复制按钮，复制用户消息内容（文字 + 附件 + 图片）
function isCopyableUserMessage(message: UiMessage): boolean {
  return message.role === 'user' && buildCopyableMessageContent(message).length > 0
}

async function copyUserMessage(messageId: string): Promise<void> {
  const message = props.messages.find((candidate) => candidate.id === messageId)
  if (!message) return
  const content = buildCopyableMessageContent(message)
  if (!content) return

  let copied = false
  try {
    await copyTextToClipboard(content)
    copied = true
  } catch {
    copied = false
  }
  if (!copied) {
    copied = copyTextWithSelectionFallback(content)
  }
  if (!copied) return

  copiedResponseAnchorId.value = messageId
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
  }
  copiedMessageResetTimer = setTimeout(() => {
    if (copiedResponseAnchorId.value === messageId) {
      copiedResponseAnchorId.value = ''
    }
    copiedMessageResetTimer = null
  }, 1800)
}

function showForkResponseButton(message: UiMessage): boolean {
  return typeof forkableTurnIndexByAnchorId.value[message.id] === 'number'
}

function fileChangeActionKey(summary: TurnFileChangeSummary | null): string {
  return summary?.turnId && props.activeThreadId ? `thread:${props.activeThreadId}:turn:${summary.turnId}` : ''
}

function isFileChangeActionable(summary: TurnFileChangeSummary | null): boolean {
  return fileChangeActionKey(summary).length > 0
}

function fileChangeActionStatus(summary: TurnFileChangeSummary | null): 'idle' | 'undoing' | 'redoing' | 'undone' | 'redone' {
  const key = fileChangeActionKey(summary)
  return key ? fileChangeActionState.value[key] ?? 'idle' : 'idle'
}

function fileChangeActionErrorText(summary: TurnFileChangeSummary | null): string {
  const key = fileChangeActionKey(summary)
  return key ? fileChangeActionError.value[key] ?? '' : ''
}

function fileChangeNextAction(summary: TurnFileChangeSummary | null): 'undo' | 'redo' {
  const status = fileChangeActionStatus(summary)
  return status === 'undone' || status === 'redoing' ? 'redo' : 'undo'
}

function fileChangeActionLabel(summary: TurnFileChangeSummary | null): string {
  const status = fileChangeActionStatus(summary)
  if (status === 'undoing') return t('Undoing')
  if (status === 'redoing') return t('Redoing')
  return fileChangeNextAction(summary) === 'redo' ? t('Redo') : t('Undo')
}

async function runFileChangeAction(
  summary: TurnFileChangeSummary | null,
  action: 'undo' | 'redo',
  filePaths?: string[],
): Promise<void> {
  const key = fileChangeActionKey(summary)
  if (!summary || !key || !props.activeThreadId || !props.cwd) return
  const previousState = fileChangeActionStatus(summary)
  const pendingState = action === 'undo' ? 'undoing' : 'redoing'
  fileChangeActionState.value = { ...fileChangeActionState.value, [key]: pendingState }
  fileChangeActionError.value = { ...fileChangeActionError.value, [key]: '' }

  let result: Awaited<ReturnType<typeof updateThreadFileChanges>>
  try {
    const patchIds = fileChangeRedoPatchIds.value[key] ?? []
    result = await updateThreadFileChanges(
      props.activeThreadId,
      summary.turnId,
      props.cwd,
      action,
      patchIds.length > 0 ? patchIds : undefined,
      'single_turn',
      filePaths,
    )
  } catch (error) {
    fileChangeActionState.value = { ...fileChangeActionState.value, [key]: previousState }
    fileChangeActionError.value = {
      ...fileChangeActionError.value,
      [key]: error instanceof Error ? error.message : t('Failed to update file changes.'),
    }
    return
  }

  if (result.errors.length > 0) {
    if (action === 'undo') {
      fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.revertedPatchIds ?? [] }
      fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'undone' }
    } else {
      if ((result.appliedPatchIds ?? []).length > 0) {
        fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.appliedPatchIds ?? [] }
      }
      fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'undone' }
    }
    fileChangeActionError.value = { ...fileChangeActionError.value, [key]: result.errors.join('; ') }
    return
  }

  if ((result.changed ?? 0) <= 0) {
    // Nothing was actually reverted/reapplied (e.g. another client already ran
    // this action). Keep the previous state and surface the server message
    // instead of assuming a local undone/redone that the disk does not reflect.
    fileChangeActionState.value = { ...fileChangeActionState.value, [key]: previousState }
    fileChangeActionError.value = {
      ...fileChangeActionError.value,
      [key]: result.message || (action === 'undo' ? t('No file changes to undo.') : t('No file changes to redo.')),
    }
    return
  }

  if (action === 'undo') {
    fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.revertedPatchIds ?? [] }
    fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'undone' }
  } else {
    fileChangeRedoPatchIds.value = { ...fileChangeRedoPatchIds.value, [key]: result.appliedPatchIds ?? [] }
    fileChangeActionState.value = { ...fileChangeActionState.value, [key]: 'redone' }
  }
  // Re-read the thread's file-change state so the UI reflects the disk state
  // (covers multi-client sync and refresh consistency).
  emit('fileChangesChanged', props.activeThreadId)
}

async function copyResponse(anchorMessageId: string): Promise<void> {
  const content = copyableResponseContentByAnchorId.value[anchorMessageId] ?? ''
  if (!content) return

  let copied = false
  try {
    await copyTextToClipboard(content)
    copied = true
  } catch {
    copied = false
  }

  if (!copied) {
    copied = copyTextWithSelectionFallback(content)
  }

  if (!copied) return

  copiedResponseAnchorId.value = anchorMessageId
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
  }
  copiedMessageResetTimer = setTimeout(() => {
    if (copiedResponseAnchorId.value === anchorMessageId) {
      copiedResponseAnchorId.value = ''
    }
    copiedMessageResetTimer = null
  }, 1800)
}

function forkResponse(anchorMessageId: string): void {
  const turnIndex = forkableTurnIndexByAnchorId.value[anchorMessageId]
  if (typeof turnIndex !== 'number') return
  if (!props.activeThreadId) return
  emit('forkThread', {
    threadId: props.activeThreadId,
    turnIndex,
  })
}

const editableTurnIdByMessageId = computed<Record<string, string>>(() => {
  const next: Record<string, string> = {}
  for (const message of props.messages) {
    if (message.role !== 'user' || typeof message.turnIndex !== 'number') continue
    const turnId = typeof message.turnId === 'string' && message.turnId.length > 0 ? message.turnId : ''
    if (!turnId || message.text.trim().length === 0) continue
    next[message.id] = turnId
  }
  return next
})

function showEditMessageButton(message: UiMessage): boolean {
  return typeof editableTurnIdByMessageId.value[message.id] === 'string'
}

function editMessage(messageId: string): void {
  if (!editableTurnIdByMessageId.value[messageId]) return
  pendingConfirm.value = { kind: 'edit-message', messageId }
}

function requestFileChangeAction(summary: TurnFileChangeSummary | null, action: 'undo' | 'redo'): void {
  if (!fileChangeActionKey(summary)) return
  pendingConfirm.value = { kind: 'file-change', summary, action }
}

function requestFileChangeFileAction(summary: TurnFileChangeSummary | null, change: UiFileChange): void {
  if (!summary || !fileChangeActionKey(summary) || !change.path) return
  pendingConfirm.value = {
    kind: 'file-change',
    summary,
    action: 'undo',
    filePaths: [change.path],
    filePathLabel: displayFileChangePath(change.path),
  }
}

function confirmPendingAction(): void {
  const pending = pendingConfirm.value
  pendingConfirm.value = null
  if (!pending) return
  if (pending.kind === 'edit-message') {
    const turnId = editableTurnIdByMessageId.value[pending.messageId]
    if (turnId) emit('rollback', { turnId })
    return
  }
  void runFileChangeAction(pending.summary, pending.action, pending.filePaths)
}

function onConversationContextMenu(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return

  const anchor = target.closest('a.message-file-link')
  if (!(anchor instanceof HTMLAnchorElement)) return

  const href = (anchor.getAttribute('href') ?? '').trim()
  if (!href || href === '#') return

  event.preventDefault()
  event.stopPropagation()

  fileLinkContextBrowseUrl.value = href
  fileLinkContextEditUrl.value = toEditUrlFromBrowseHref(href)
  fileLinkContextMenuX.value = event.clientX
  fileLinkContextMenuY.value = event.clientY
  isFileLinkContextMenuVisible.value = true
}

function closeFileLinkContextMenu(): void {
  if (!isFileLinkContextMenuVisible.value) return
  isFileLinkContextMenuVisible.value = false
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function formatIsoTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleTimeString()
}

function readRequestReason(request: UiServerRequest): string {
  const params = asRecord(request.params)
  const reason = typeof params?.reason === 'string' ? params.reason.trim() : ''
  if (reason) return reason
  const message = typeof params?.message === 'string' ? params.message.trim() : ''
  if (message) return message
  return typeof params?.prompt === 'string' ? params.prompt.trim() : ''
}

function requestDisplayTitle(request: UiServerRequest): string {
  if (request.method === 'item/commandExecution/requestApproval') return t('Command approval required')
  if (request.method === 'item/fileChange/requestApproval') return t('File change approval required')
  if (request.method === 'item/permissions/requestApproval') return t('Permissions approval required')
  if (request.method === 'mcpServer/elicitation/request') return t('MCP server input required')
  if (request.method === 'item/tool/requestUserInput') return t('Input required')
  if (request.method === 'item/tool/call') return t('Tool call waiting for response')
  return request.method
}

function readMcpElicitationServerName(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.serverName === 'string' ? params.serverName.trim() : ''
}

function readMcpElicitationUrl(request: UiServerRequest): string {
  const params = asRecord(request.params)
  return typeof params?.url === 'string' ? params.url.trim() : ''
}

function mcpElicitationAnswerKey(requestId: number, fieldKey: string): string {
  return `${String(requestId)}:${fieldKey}`
}

function readMcpElicitationFields(request: UiServerRequest): McpElicitationField[] {
  const params = asRecord(request.params)
  const requestedSchema = asRecord(params?.requestedSchema)
  const properties = asRecord(requestedSchema?.properties)
  if (!properties) return []

  const required = new Set(
    Array.isArray(requestedSchema?.required)
      ? requestedSchema.required.filter((entry): entry is string => typeof entry === 'string')
      : [],
  )

  return Object.entries(properties)
    .map(([key, value]) => parseMcpElicitationField(key, asRecord(value), required.has(key)))
    .filter((field): field is McpElicitationField => field !== null)
}

function parseMcpElicitationField(
  key: string,
  schema: Record<string, unknown> | null,
  required: boolean,
): McpElicitationField | null {
  if (!schema) return null

  const label = typeof schema.title === 'string' && schema.title.trim().length > 0 ? schema.title.trim() : key
  const description = typeof schema.description === 'string' ? schema.description.trim() : ''
  const type = typeof schema.type === 'string' ? schema.type.trim() : ''

  if (type === 'boolean') {
    return { key, label, description, required, kind: 'boolean', inputType: 'checkbox', options: [], defaultValue: schema.default === true }
  }

  if (type === 'number' || type === 'integer') {
    return {
      key,
      label,
      description,
      required,
      kind: 'number',
      inputType: 'number',
      options: [],
      defaultValue: typeof schema.default === 'number' ? schema.default : '',
    }
  }

  const options = readMcpElicitationOptions(schema)
  if (type === 'array') {
    return {
      key,
      label,
      description,
      required,
      kind: 'multiEnum',
      inputType: 'checkbox',
      options,
      defaultValue: Array.isArray(schema.default)
        ? schema.default.filter((entry): entry is string => typeof entry === 'string')
        : [],
    }
  }

  if (options.length > 0) {
    return {
      key,
      label,
      description,
      required,
      kind: 'singleEnum',
      inputType: 'select',
      options,
      defaultValue: (typeof schema.default === 'string' ? schema.default : '') || options[0]?.value || '',
    }
  }

  return {
    key,
    label,
    description,
    required,
    kind: 'string',
    inputType: readMcpElicitationInputType(schema),
    options: [],
    defaultValue: typeof schema.default === 'string' ? schema.default : '',
  }
}

function readMcpElicitationOptions(schema: Record<string, unknown>): McpElicitationFieldOption[] {
  const titledSource = Array.isArray(schema.oneOf) ? schema.oneOf : Array.isArray(schema.anyOf) ? schema.anyOf : []
  const titledOptions = titledSource
    .map((option) => asRecord(option))
    .map((option) => ({
      value: typeof option?.const === 'string' ? option.const : '',
      label: typeof option?.title === 'string' && option.title.trim().length > 0 ? option.title : (typeof option?.const === 'string' ? option.const : ''),
    }))
    .filter((option) => option.value.length > 0)
  if (titledOptions.length > 0) return titledOptions

  const items = asRecord(schema.items)
  if (items) {
    const nestedOptions = readMcpElicitationOptions(items)
    if (nestedOptions.length > 0) return nestedOptions
  }

  const values = Array.isArray(schema.enum) ? schema.enum.filter((entry): entry is string => typeof entry === 'string') : []
  const names = Array.isArray(schema.enumNames) ? schema.enumNames.filter((entry): entry is string => typeof entry === 'string') : []
  return values.map((value, index) => ({ value, label: names[index] || value }))
}

function readMcpElicitationInputType(schema: Record<string, unknown>): string {
  const format = typeof schema.format === 'string' ? schema.format.trim() : ''
  if (format === 'email') return 'email'
  if (format === 'uri') return 'url'
  if (format === 'date') return 'date'
  if (format === 'date-time') return 'datetime-local'
  return 'text'
}

function readMcpElicitationFieldValue(requestId: number, field: McpElicitationField): string | number | boolean | string[] {
  const saved = mcpElicitationAnswers.value[mcpElicitationAnswerKey(requestId, field.key)]
  return saved === undefined ? field.defaultValue : saved
}

function readMcpElicitationMultiValue(requestId: number, field: McpElicitationField): string[] {
  const value = readMcpElicitationFieldValue(requestId, field)
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

function toolQuestionKey(requestId: number, questionId: string): string {
  return `${String(requestId)}:${questionId}`
}

function readToolQuestions(request: UiServerRequest): ParsedToolQuestion[] {
  const params = asRecord(request.params)
  const questions = Array.isArray(params?.questions) ? params.questions : []
  const parsed: ParsedToolQuestion[] = []

  for (const row of questions) {
    const question = asRecord(row)
    if (!question) continue
    const id = typeof question.id === 'string' ? question.id : ''
    if (!id) continue

    const options = Array.isArray(question.options)
      ? question.options
        .map((option) => asRecord(option))
        .map((option) => ({
          label: typeof option?.label === 'string' ? option.label : '',
          description: typeof option?.description === 'string' ? option.description : '',
        }))
        .filter((option) => option.label.length > 0)
      : []

    parsed.push({
      id,
      header: typeof question.header === 'string' ? question.header : '',
      question: typeof question.question === 'string' ? question.question : '',
      isSecret: question.isSecret === true,
      isOther: question.isOther === true,
      options,
    })
  }

  return parsed
}

function readQuestionAnswer(requestId: number, questionId: string, fallback: string): string {
  const key = toolQuestionKey(requestId, questionId)
  const saved = toolQuestionAnswers.value[key]
  if (typeof saved === 'string' && saved.length > 0) return saved
  return fallback
}

function onQuestionAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: target.value,
  }
}

function readQuestionOptionDescription(requestId: number, question: ParsedToolQuestion): string {
  const selected = readQuestionAnswer(requestId, question.id, question.options[0]?.label || '')
  const match = question.options.find((option) => option.label === selected)
  return match?.description ?? ''
}

function readQuestionOtherAnswer(requestId: number, questionId: string): string {
  const key = toolQuestionKey(requestId, questionId)
  return toolQuestionOtherAnswers.value[key] ?? ''
}

function onQuestionAnswerChange(requestId: number, questionId: string, value: string): void {
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionAnswers.value = {
    ...toolQuestionAnswers.value,
    [key]: value,
  }
}

function onQuestionOtherAnswerInput(requestId: number, questionId: string, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const key = toolQuestionKey(requestId, questionId)
  toolQuestionOtherAnswers.value = {
    ...toolQuestionOtherAnswers.value,
    [key]: target.value,
  }
}

function onMcpElicitationFieldInput(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.value,
  }
}

function onMcpElicitationBooleanToggle(requestId: number, field: McpElicitationField, event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: target.checked,
  }
}

function onMcpElicitationMultiToggle(
  requestId: number,
  field: McpElicitationField,
  optionValue: string,
  event: Event,
): void {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) return
  const next = new Set(readMcpElicitationMultiValue(requestId, field))
  if (target.checked) next.add(optionValue)
  else next.delete(optionValue)
  mcpElicitationAnswers.value = {
    ...mcpElicitationAnswers.value,
    [mcpElicitationAnswerKey(requestId, field.key)]: Array.from(next),
  }
}

function onRespondApproval(requestId: number, decision: 'accept' | 'acceptForSession' | 'decline' | 'cancel'): void {
  emit('respondServerRequest', {
    id: requestId,
    result: { decision },
  })
}

function onRespondPermissionsApproval(request: UiServerRequest, scope: 'turn' | 'session'): void {
  const params = asRecord(request.params)
  const permissions = asRecord(params?.permissions) ?? {}
  emit('respondServerRequest', {
    id: request.id,
    result: {
      permissions,
      scope,
    },
  })
}

function buildMcpElicitationContent(request: UiServerRequest): Record<string, unknown> {
  const content: Record<string, unknown> = {}
  for (const field of readMcpElicitationFields(request)) {
    const value = readMcpElicitationFieldValue(request.id, field)
    if (field.kind === 'multiEnum') {
      const arrayValue = Array.isArray(value) ? value : []
      if (arrayValue.length > 0 || field.required) content[field.key] = arrayValue
      continue
    }
    if (field.kind === 'boolean') {
      content[field.key] = Boolean(value)
      continue
    }
    if (field.kind === 'number') {
      const numberValue = typeof value === 'number' ? value : Number(String(value).trim())
      if (!Number.isNaN(numberValue)) content[field.key] = numberValue
      continue
    }
    const textValue = String(value ?? '').trim()
    if (textValue.length > 0 || field.required) content[field.key] = textValue
  }
  return content
}

function onRespondMcpElicitation(request: UiServerRequest, action: 'accept' | 'decline' | 'cancel'): void {
  const params = asRecord(request.params)
  const result: Record<string, unknown> = { action }
  if (action === 'accept' && typeof params?.mode === 'string' && params.mode === 'form') {
    result.content = buildMcpElicitationContent(request)
  }
  emit('respondServerRequest', {
    id: request.id,
    result,
  })
}

function onRespondToolRequestUserInput(request: UiServerRequest): void {
  const questions = readToolQuestions(request)
  const answers: Record<string, { answers: string[] }> = {}

  for (const question of questions) {
    const selected = readQuestionAnswer(request.id, question.id, question.options[0]?.label || '')
    const other = readQuestionOtherAnswer(request.id, question.id).trim()
    const values = [selected, other].map((value) => value.trim()).filter((value) => value.length > 0)
    answers[question.id] = { answers: values }
  }

  emit('respondServerRequest', {
    id: request.id,
    result: { answers },
  })
}

function onRespondToolCallFailure(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: false,
      contentItems: [
        {
          type: 'inputText',
          text: t('Tool call rejected from codex-web-local UI.'),
        },
      ],
    },
  })
}

function onRespondToolCallSuccess(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {
      success: true,
      contentItems: [],
    },
  })
}

function onRespondEmptyResult(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    result: {},
  })
}

function onRejectUnknownRequest(requestId: number): void {
  emit('respondServerRequest', {
    id: requestId,
    error: {
      code: -32000,
      message: t('Rejected from codex-web-local UI.'),
    },
  })
}

function scrollToBottom(): void {
  const container = conversationListRef.value
  const anchor = bottomAnchorRef.value
  if (!container || !anchor) return
  container.scrollTop = container.scrollHeight
  anchor.scrollIntoView({ block: 'end' })
}

function isAtBottom(container: HTMLElement): boolean {
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance <= BOTTOM_THRESHOLD_PX
}

function applyConversationScrollState(): void {
  const container = conversationListRef.value
  if (!container) return

  if (autoFollowOutput.value) {
    enforceBottomState()
    return
  }
}

function enforceBottomState(): void {
  const container = conversationListRef.value
  if (!container) return
  scrollToBottom()
}

function shouldLockToBottom(): boolean {
  return autoFollowOutput.value
}

function runBottomLockFrame(): void {
  if (!shouldLockToBottom()) {
    bottomLockFramesLeft = 0
    bottomLockFrame = 0
    return
  }

  enforceBottomState()
  bottomLockFramesLeft -= 1
  if (bottomLockFramesLeft <= 0) {
    bottomLockFrame = 0
    return
  }
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function scheduleBottomLock(frames = 6): void {
  if (!shouldLockToBottom()) return
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  bottomLockFramesLeft = Math.max(frames, 1)
  bottomLockFrame = requestAnimationFrame(runBottomLockFrame)
}

function onPendingImageSettled(): void {
  scheduleBottomLock(3)
}

function jumpToLatest(): void {
  autoFollowOutput.value = true
  enforceBottomState()
  scheduleBottomLock(4)
}

async function loadMoreAbove(): Promise<void> {
  const container = conversationListRef.value
  if (!container || !props.hasMorePersistedAbove || isLoadingMore.value || props.isLoadingPersistedAbove === true) return

  isLoadingMore.value = true
  const threadIdAtStart = props.activeThreadId

  const prevScrollHeight = container.scrollHeight
  const prevScrollTop = container.scrollTop

  try {
    await props.loadEarlierMessages?.(threadIdAtStart)

    await nextTick()

    // Discard scroll restoration if the thread changed while we were awaiting.
    if (props.activeThreadId === threadIdAtStart) {
      container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)
    }
  } finally {
    isLoadingMore.value = false
  }
}

defineExpose({
  jumpToLatest,
})

function bindPendingImageHandlers(): void {
  if (!shouldLockToBottom()) return
  const container = conversationListRef.value
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>('img.message-image-preview')
  for (const image of images) {
    if (image.complete || trackedPendingImages.has(image)) continue
    trackedPendingImages.add(image)
    image.addEventListener('load', onPendingImageSettled, { once: true })
    image.addEventListener('error', onPendingImageSettled, { once: true })
  }
}

async function scheduleConversationScroll(): Promise<void> {
  if (conversationScrollPromise) return conversationScrollPromise

  conversationScrollPromise = nextTick().then(() => new Promise<void>((resolve) => {
    if (conversationScrollFrame) {
      cancelAnimationFrame(conversationScrollFrame)
    }
    conversationScrollFrame = requestAnimationFrame(() => {
      conversationScrollFrame = 0
      conversationScrollPromise = null
      applyConversationScrollState()
      bindPendingImageHandlers()
      scheduleBottomLock()
      resolve()
    })
  }))

  return conversationScrollPromise
}

watch(
  () => props.messages,
  async (next) => {
    if (props.isLoading) return

    const commandIds = new Set(
      next
        .filter((message) => message.messageType === 'commandExecution' && message.commandExecution)
        .map((message) => message.id),
    )
    expandedCommandIds.value = pruneCommandIdSet(expandedCommandIds.value, commandIds)
    collapsedAutoCommandIds.value = pruneCommandIdSet(collapsedAutoCommandIds.value, commandIds)
    pruneFileChangeSummaryIds()

    await scheduleConversationScroll()
  },
)

watch(
  () => props.messages.some((message) => message.text.includes('```')),
  (hasCodeBlocks) => {
    if (!hasCodeBlocks || hasHighlightLoaded()) return
    void ensureHighlightJsLoaded()
  },
  { immediate: true },
)

watch(
  activeCommandMessageId,
  (nextId, prevId) => {
    if (!prevId || prevId === nextId) return
    if (!collapsedAutoCommandIds.value.has(prevId)) return
    const nextCollapsedAuto = new Set(collapsedAutoCommandIds.value)
    nextCollapsedAuto.delete(prevId)
    collapsedAutoCommandIds.value = nextCollapsedAuto
  },
)

watch(
  () => props.pendingRequests,
  async () => {
    if (props.isLoading) return
    await scheduleConversationScroll()
  },
  { deep: true },
)

watch(
  () => props.liveOverlay,
  async (overlay) => {
    if (!overlay) return
    if (!autoFollowOutput.value) return
    await nextTick()
    enforceBottomState()
    scheduleBottomLock(8)
  },
  { deep: true },
)

watch(
  () => props.isLoading,
  async (loading) => {
    if (loading) return
    await scheduleConversationScroll()
  },
)

watch(
  () => props.activeThreadId,
  async () => {
    autoFollowOutput.value = true
    modalImageUrl.value = ''
    isLoadingMore.value = false
    fileChangeActionState.value = {}
    fileChangeActionError.value = {}
    fileChangeRedoPatchIds.value = {}
    warmLayerState.value = createWarmLayerState(props.activeThreadId)
    await scheduleConversationScroll()
  },
  { flush: 'post' },
)

function onConversationScroll(): void {
  const container = conversationListRef.value
  if (!container || props.isLoading) return
  autoFollowOutput.value = isAtBottom(container)
  if (container.scrollTop < LOAD_MORE_SCROLL_THRESHOLD_PX && !isLoadingMore.value) {
    if (hasColdTurns.value) {
      nextColdPage()
    } else if (props.hasMorePersistedAbove === true) {
      void loadMoreAbove()
    }
  }
}

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
  modalIsVideo.value = isVideoMediaUrl(imageUrl)
}

function closeImageModal(): void {
  modalImageUrl.value = ''
  modalIsVideo.value = false
}

const VIDEO_MEDIA_EXTENSIONS = /\.(mp4|m4v|webm|mov|mkv|ogv|ogg|mpeg|avi)$/iu

function isVideoMediaUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed.startsWith('data:video/')) return true
  try {
    const url = new URL(trimmed, window.location.href)
    if (VIDEO_MEDIA_EXTENSIONS.test(url.pathname)) return true
    if (url.pathname === '/codex-local-image') {
      return VIDEO_MEDIA_EXTENSIONS.test(url.searchParams.get('path') ?? '')
    }
    return false
  } catch {
    return VIDEO_MEDIA_EXTENSIONS.test(trimmed)
  }
}

onBeforeUnmount(() => {
  clearRenderCaches()
  if (conversationScrollFrame) {
    cancelAnimationFrame(conversationScrollFrame)
    conversationScrollFrame = 0
  }
  if (bottomLockFrame) {
    cancelAnimationFrame(bottomLockFrame)
    bottomLockFrame = 0
  }
  if (copiedMessageResetTimer) {
    clearTimeout(copiedMessageResetTimer)
    copiedMessageResetTimer = null
  }
})
</script>

<style scoped>
@reference "tailwindcss";

.conversation-root {
  @apply relative h-full min-h-0 min-w-0 p-0 flex flex-col overflow-y-hidden overflow-x-hidden bg-transparent border-none rounded-none;
}

.conversation-loading {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-empty {
  @apply m-0 px-6 text-sm text-slate-500;
}

.conversation-list {
  @apply h-full min-h-0 list-none m-0 px-2 sm:px-6 py-0 overflow-y-auto overflow-x-visible flex flex-col gap-2 sm:gap-3;
}

.conversation-load-more {
  @apply flex justify-center py-3 m-0;
}

.load-more-button {
  @apply px-4 py-1.5 text-xs rounded-full border border-slate-300 dark:border-slate-600
         text-slate-500 dark:text-slate-400 bg-transparent
         hover:bg-slate-100 dark:hover:bg-slate-800
         disabled:opacity-40 disabled:cursor-not-allowed
         transition-colors cursor-pointer;
}

.conversation-item {
  @apply m-0 w-full min-w-0 flex;
}

.conversation-item-process {
  @apply py-0.5;
}

.conversation-item-process .message-row,
.conversation-item-plan .message-row {
  @apply border-l-0 pl-0;
}

.conversation-item-process .message-row {
  @apply opacity-90;
}

.conversation-item-process[data-role='assistant'] .message-text,
.conversation-item-process[data-role='assistant'] .message-list,
.conversation-item-process[data-role='assistant'] .message-list-item-text,
.conversation-item-process[data-role='assistant'] .message-blockquote {
  @apply text-[13px] leading-6 text-zinc-600;
}

.conversation-item-process[data-role='assistant'] .message-heading {
  @apply text-[15px] text-zinc-700;
}

.conversation-item-final {
  @apply pt-2;
}

.message-row-final .message-text-flow {
  @apply gap-2.5;
}

.conversation-item-request .message-card[data-role='user'] {
  @apply rounded-lg border border-zinc-200 bg-zinc-100 px-4 py-3 shadow-none;
}

:root.dark .conversation-item-request .message-card[data-role='user'] {
  @apply border-zinc-700 bg-zinc-800;
}

:root.dark .conversation-item-process .message-row,
:root.dark .conversation-item-plan .message-row {
  @apply border-zinc-700;
}

.thread-plan-record {
  @apply w-full max-w-[min(var(--chat-card-max,76ch),100%)] border-l-2 border-zinc-300 py-1 pl-3 text-xs leading-5 text-zinc-600;
}

.thread-plan-record-header {
  @apply font-medium text-zinc-700;
}

.thread-plan-record-explanation {
  @apply m-0 mt-1 whitespace-pre-wrap break-words;
}

.thread-plan-record-steps {
  @apply m-0 mt-1.5 flex list-none flex-col gap-1 p-0;
}

.thread-plan-record-steps li {
  @apply flex items-start gap-1.5 break-words;
}

.thread-plan-record-marker {
  @apply shrink-0 font-mono text-[11px] text-zinc-400;
}

.thread-plan-record-steps li[data-status='completed'] .thread-plan-record-marker {
  @apply text-emerald-600;
}

.thread-plan-record-steps li[data-status='inProgress'] .thread-plan-record-marker {
  @apply text-amber-600;
}

:root.dark .thread-plan-record {
  @apply border-zinc-700 text-zinc-400;
}

:root.dark .thread-plan-record-header {
  @apply text-zinc-200;
}

:root.dark .thread-plan-record-marker {
  @apply text-zinc-500;
}

.conversation-item-overlay {
  @apply justify-center;
}

.message-row {
  @apply relative w-full min-w-0 max-w-[min(var(--chat-column-max,45rem),100%)] mx-auto flex;
}

.message-row[data-role='user'] {
  @apply justify-end;
}

.message-row[data-role='assistant'],
.message-row[data-role='system'] {
  @apply justify-start;
}

.thread-compaction-row {
  @apply justify-center py-1.5;
}

.thread-compaction-inline {
  @apply inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-[11px] text-zinc-500;
}

.thread-compaction-inline--done {
  @apply border-emerald-200 bg-emerald-50 text-emerald-700;
}

.thread-compaction-spinner {
  @apply inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600;
}

:root.dark .thread-compaction-inline {
  @apply border-zinc-700 bg-zinc-800 text-zinc-400;
}

:root.dark .thread-compaction-inline--done {
  @apply border-emerald-800 bg-emerald-900/40 text-emerald-300;
}

:root.dark .thread-compaction-spinner {
  @apply border-zinc-600 border-t-zinc-300;
}

.conversation-bottom-anchor {
  @apply h-px;
}

.jump-to-latest-button {
  @apply absolute left-1/2 bottom-4 z-20 inline-flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border border-slate-300 bg-white/96 text-slate-700 shadow-lg shadow-slate-900/10 transition hover:-translate-x-1/2 hover:-translate-y-0.5 hover:bg-white hover:text-slate-900;
}

.jump-to-latest-icon {
  transform: rotate(180deg);
}

.message-stack {
  @apply flex flex-col w-full min-w-0;
}

.request-card {
  @apply w-full max-w-[min(var(--chat-column-max,45rem),100%)] rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col gap-2;
}

.request-title {
  @apply m-0 text-sm leading-5 font-semibold text-amber-900;
}

.request-meta {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-reason {
  @apply m-0 text-sm leading-5 text-amber-900 whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.request-actions {
  @apply flex flex-wrap gap-2;
}

.request-button {
  @apply rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-button-primary {
  @apply border-amber-500 bg-amber-500 text-white hover:bg-amber-600;
}

.request-user-input {
  @apply flex flex-col gap-3;
}

.request-question {
  @apply flex flex-col gap-1;
}

.request-question-title {
  @apply m-0 text-sm leading-5 font-medium text-amber-900;
}

.request-question-text {
  @apply m-0 text-xs leading-4 text-amber-800;
}

.request-question-option-description {
  @apply m-0 text-xs leading-4 text-amber-700;
}

.request-link {
  @apply inline-flex w-fit rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100 transition;
}

.request-select {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900;
}

.request-input {
  @apply h-8 rounded-md border border-amber-300 bg-white px-2 text-sm text-amber-900 placeholder:text-amber-500;
}

.request-checkbox-list {
  @apply flex flex-col gap-1.5;
}

.request-checkbox-row {
  @apply flex items-center gap-2 text-sm text-amber-900;
}

.turn-error-feedback {
  @apply mt-3 inline-flex w-fit rounded-full border border-rose-200 bg-white px-2.5 py-1 text-xs font-semibold leading-none text-rose-700 transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300;
}

.message-body {
  @apply flex flex-col min-w-0 max-w-full;
  width: fit-content;
  /* round-27：把宽度上限从 .message-card 上移到 .message-body，卡片随 body 撑满，
     修复「card 比 body 窄」（此前 body=fit-content 无上限、card 被 76ch 截断，
     图片/长附件把 body 撑宽后卡片仍窄一截）。 */
  max-width: min(var(--chat-card-max, 76ch), 100%);
}

.message-body[data-role='user'] {
  @apply ml-auto items-end;
  align-self: flex-end;
  /* 用户气泡维持 560px 上限（76ch 上限对气泡过宽） */
  max-width: min(560px, 100%);
}

.message-image-list {
  @apply list-none m-0 mb-2 p-0 flex flex-wrap gap-2;
}

.message-image-list[data-role='user'] {
  @apply ml-auto justify-end;
}

.message-generated-image-list {
  @apply gap-3;
}

.message-image-item {
  @apply m-0;
}

.message-image-button {
  @apply block rounded-xl overflow-hidden border border-slate-300 bg-white p-0 transition hover:border-slate-400;
}

.message-image-preview {
  @apply block w-16 h-16 object-cover;
}

.message-video-preview {
  @apply object-contain;
}

.message-video-preview.message-generated-image-preview {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)];
}

.message-generated-image-preview {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-file-attachments {
  @apply mb-2 flex flex-wrap gap-1.5;
}

.message-skill-attachments {
  @apply mb-2 flex flex-wrap justify-end gap-1.5;
}

.message-file-chip {
  @apply inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700;
}

.message-skill-chip {
  @apply inline-flex max-w-full items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 no-underline transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-900;
}

.message-skill-chip-prefix {
  @apply shrink-0 font-medium text-emerald-700;
}

.message-skill-chip-name {
  @apply min-w-0 max-w-48 truncate font-mono;
}

.message-file-chip-icon {
  @apply text-[10px] leading-none;
}

.message-file-chip-name {
  @apply truncate max-w-48 font-mono;
}

.message-card {
  /* round-27：宽度随 .message-body 撑满（上限已上移到 body） */
  @apply px-0 py-0 bg-transparent border-none rounded-none;
  width: 100%;
}

.message-text-flow {
  @apply flex flex-col gap-2;
}

.message-text {
  /* round-23 字体规范：正文 14px / #171717 */
  @apply m-0 text-sm leading-relaxed whitespace-pre-wrap break-words;
  color: #171717;
  overflow-wrap: anywhere;
}

.message-heading {
  /* round-23 字体规范：标题 16px / #17181a */
  @apply m-0 font-semibold leading-snug;
  color: #17181a;
  font-size: 16px;
}

.message-heading-h1 {
  @apply leading-tight;
}

.message-heading-h2 {
  @apply leading-tight;
}

.message-heading-h3 {
  @apply leading-snug;
}

.message-heading-h4 {
  @apply leading-snug;
}

.message-heading-h5 {
  @apply leading-snug tracking-[0.02em];
}

.message-heading-h6 {
  @apply leading-snug tracking-[0.04em];
}

.message-blockquote {
  @apply m-0 border-l-4 border-slate-300 pl-4 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-700 bg-slate-50/70 rounded-r-lg;
  overflow-wrap: anywhere;
}

.message-list {
  /* round-23 字体规范：列表正文 #171717 */
  @apply m-0 pl-5 text-sm leading-relaxed flex flex-col gap-1.5;
  color: #171717;
}

.message-list-unordered {
  @apply list-disc;
}

.message-list-ordered {
  @apply list-decimal;
}

.message-list-item {
  @apply pl-1;
}

.message-list-item-content {
  @apply flex flex-col gap-1.5;
}

.message-list-item-text {
  @apply whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.message-list-item-paragraph + .message-list-item-paragraph {
  @apply mt-2;
}

.message-task-list {
  @apply list-none pl-0;
}

.message-task-item {
  @apply flex items-start gap-2;
}

.message-task-checkbox {
  @apply mt-0.5 text-sm leading-none text-slate-500 select-none;
}

.message-table-wrap {
  @apply w-full overflow-x-auto;
}

.message-table {
  @apply min-w-full border-separate border-spacing-0 overflow-hidden rounded-xl border border-slate-200 bg-white text-sm text-slate-800;
}

.message-table-head-cell,
.message-table-cell {
  @apply border-b border-l border-slate-200 px-3 py-2 align-top whitespace-pre-wrap break-words;
  overflow-wrap: anywhere;
}

.message-table-head-cell:first-child,
.message-table-cell:first-child {
  @apply border-l-0;
}

.message-table-head-cell {
  @apply bg-slate-100 font-semibold text-slate-900;
}

.message-table-body-row:last-child .message-table-cell {
  @apply border-b-0;
}

.message-bold-text {
  /* round-23 字体规范：加粗 #17181a（与标题同色） */
  @apply font-semibold;
  color: #17181a;
}

.message-italic-text {
  @apply italic;
}

.message-strikethrough-text {
  @apply line-through text-slate-500;
}

.message-markdown-image {
  @apply w-auto h-auto max-w-[min(560px,85vw)] max-h-[min(460px,62vh)] object-contain bg-white;
}

.message-inline-code {
  @apply bg-transparent p-0 font-sans text-[1em] font-semibold text-inherit;
  line-height: inherit;
}

.message-code-block {
  @apply overflow-hidden rounded-xl border border-slate-200 bg-slate-950 text-slate-100;
}

.message-code-language {
  @apply border-b border-slate-800 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.08em] text-slate-400;
}

.message-code-pre {
  @apply m-0 overflow-x-auto px-3 py-3 text-[13px] leading-relaxed font-mono whitespace-pre;
}

.message-code-pre :deep(.hljs) {
  @apply block bg-transparent p-0 text-inherit;
}

.message-file-link {
  @apply text-sm leading-relaxed text-[#0969da] no-underline hover:text-[#1f6feb] hover:underline underline-offset-2;
}

.message-divider {
  @apply m-0 border-0 h-px bg-slate-300/80;
}

.message-stack[data-role='user'] {
  @apply items-end;
}

.message-stack[data-role='assistant'],
.message-stack[data-role='system'] {
  @apply items-start;
}

.message-card[data-role='user'] {
  @apply rounded-2xl bg-slate-200 px-4 py-3 max-w-[min(560px,100%)];
  width: 100%;
  margin-left: auto;
  align-self: flex-end;
}

.automation-message-label {
  @apply mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500;
}

.automation-message-label code {
  @apply rounded-full bg-white/70 px-2 py-0.5 text-[10px] normal-case tracking-normal text-slate-600;
}

.message-card[data-role='assistant'],
.message-card[data-role='system'] {
  @apply px-0 py-0 bg-transparent border-none rounded-none;
}

.conversation-item[data-message-type='worked'] .message-stack,
.conversation-item[data-message-type='worked'] .message-body,
.conversation-item[data-message-type='worked'] .message-card {
  @apply w-full max-w-full;
}

.work-summary-wrap {
  @apply w-full flex flex-col gap-0;
}

.work-summary-text {
  /* round-23 字体规范：正文 #171717 */
  @apply m-0 text-sm leading-relaxed font-normal;
  color: #171717;
}

.image-modal-backdrop {
  @apply fixed inset-0 z-50 bg-black/40 p-6 flex items-center justify-center;
}

.image-modal-content {
  @apply relative max-w-[min(92vw,1100px)] max-h-[92vh];
}

.image-modal-close {
  @apply absolute top-2 right-2 z-10 w-10 h-10 rounded-full bg-white/90 text-slate-900 border border-slate-300 flex items-center justify-center;
}

.image-modal-image {
  @apply block max-w-full max-h-[90vh] rounded-2xl shadow-2xl bg-white;
}

.icon-svg {
  @apply w-5 h-5;
}
</style>
