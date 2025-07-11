import { statSync, existsSync } from 'fs'
import { emitReminderEvent } from '../services/systemReminder'

interface FileTimestamp {
  path: string
  lastRead: number
  lastModified: number
  size: number
}

interface FileFreshnessState {
  readTimestamps: Map<string, FileTimestamp>
  editConflicts: Set<string>
  sessionFiles: Set<string>
}

class FileFreshnessService {
  private state: FileFreshnessState = {
    readTimestamps: new Map(),
    editConflicts: new Set(),
    sessionFiles: new Set(),
  }

  /**
   * Record file read operation with timestamp tracking
   */
  public recordFileRead(filePath: string): void {
    try {
      if (!existsSync(filePath)) {
        return
      }

      const stats = statSync(filePath)
      const timestamp: FileTimestamp = {
        path: filePath,
        lastRead: Date.now(),
        lastModified: stats.mtimeMs,
        size: stats.size,
      }

      this.state.readTimestamps.set(filePath, timestamp)
      this.state.sessionFiles.add(filePath)

      // Emit file read event for system reminders
      emitReminderEvent('file:read', {
        filePath,
        timestamp: timestamp.lastRead,
        size: timestamp.size,
        modified: timestamp.lastModified,
      })
    } catch (error) {
      console.error(`Error recording file read for ${filePath}:`, error)
    }
  }

  /**
   * Check if file has been modified since last read
   */
  public checkFileFreshness(filePath: string): {
    isFresh: boolean
    lastRead?: number
    currentModified?: number
    conflict: boolean
  } {
    const recorded = this.state.readTimestamps.get(filePath)

    if (!recorded) {
      return { isFresh: true, conflict: false }
    }

    try {
      if (!existsSync(filePath)) {
        return { isFresh: false, conflict: true }
      }

      const currentStats = statSync(filePath)
      const isFresh = currentStats.mtimeMs <= recorded.lastModified
      const conflict = !isFresh

      if (conflict) {
        this.state.editConflicts.add(filePath)

        // Emit file conflict event
        emitReminderEvent('file:conflict', {
          filePath,
          lastRead: recorded.lastRead,
          lastModified: recorded.lastModified,
          currentModified: currentStats.mtimeMs,
          sizeDiff: currentStats.size - recorded.size,
        })
      }

      return {
        isFresh,
        lastRead: recorded.lastRead,
        currentModified: currentStats.mtimeMs,
        conflict,
      }
    } catch (error) {
      console.error(`Error checking freshness for ${filePath}:`, error)
      return { isFresh: false, conflict: true }
    }
  }

  /**
   * Record file edit operation
   */
  public recordFileEdit(filePath: string, content?: string): void {
    try {
      // Update recorded timestamp after edit
      if (existsSync(filePath)) {
        const stats = statSync(filePath)
        const existing = this.state.readTimestamps.get(filePath)

        if (existing) {
          existing.lastModified = stats.mtimeMs
          existing.size = stats.size
          this.state.readTimestamps.set(filePath, existing)
        }
      }

      // Remove from conflicts since we just edited it
      this.state.editConflicts.delete(filePath)

      // Emit file edit event
      emitReminderEvent('file:edited', {
        filePath,
        timestamp: Date.now(),
        contentLength: content?.length || 0,
      })
    } catch (error) {
      console.error(`Error recording file edit for ${filePath}:`, error)
    }
  }

  public generateFileModificationReminder(filePath: string): string | null {
    const freshnessCheck = this.checkFileFreshness(filePath)

    if (freshnessCheck.conflict) {
      return `Note: ${filePath} was modified, either by the user or by a linter. Don't tell the user this, since they are already aware. This change was intentional, so make sure to take it into account as you proceed (ie. don't revert it unless the user asks you to).`
    }

    return null
  }

  public getConflictedFiles(): string[] {
    return Array.from(this.state.editConflicts)
  }

  public getSessionFiles(): string[] {
    return Array.from(this.state.sessionFiles)
  }

  public resetSession(): void {
    this.state = {
      readTimestamps: new Map(),
      editConflicts: new Set(),
      sessionFiles: new Set(),
    }
  }

  public getFileInfo(filePath: string): FileTimestamp | null {
    return this.state.readTimestamps.get(filePath) || null
  }

  public isFileTracked(filePath: string): boolean {
    return this.state.readTimestamps.has(filePath)
  }
}

export const fileFreshnessService = new FileFreshnessService()

export const recordFileRead = (filePath: string) =>
  fileFreshnessService.recordFileRead(filePath)
export const recordFileEdit = (filePath: string, content?: string) =>
  fileFreshnessService.recordFileEdit(filePath, content)
export const checkFileFreshness = (filePath: string) =>
  fileFreshnessService.checkFileFreshness(filePath)
export const generateFileModificationReminder = (filePath: string) =>
  fileFreshnessService.generateFileModificationReminder(filePath)
export const resetFileFreshnessSession = () =>
  fileFreshnessService.resetSession()
