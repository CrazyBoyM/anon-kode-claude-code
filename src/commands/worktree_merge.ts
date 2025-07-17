import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, basename } from 'path'
import type { Command } from '../commands'

const worktreeMerge: Command = {
  name: 'worktree_merge',
  description: 'Safely merge a worktree with proper status checking and backup',
  isEnabled: true,
  isHidden: false,
  userFacingName: () => 'worktree_merge',
  aliases: ['wm'],
  type: 'local',

  async call(args: string): Promise<string> {
    const worktreeName = args.trim()

    if (!worktreeName) {
      return `❌ Usage: /worktree_merge <worktree-name>

Example: /worktree_merge feature-theme-system
This will merge the worktree at ../<current-project-name>-<worktree-name>`
    }

    const currentDir = process.cwd()
    const projectName = basename(process.cwd())
    const worktreePath = join(
      currentDir,
      '..',
      `${projectName}-${worktreeName}`,
    )

    try {
      // Step 1: Check if worktree exists
      if (!existsSync(worktreePath)) {
        return `❌ Worktree not found: ${worktreePath}

Available worktrees:
${execSync('git worktree list', { encoding: 'utf8' })}`
      }

      // Step 2: Check worktree status
      const worktreeStatus = execSync(
        `git --git-dir=${currentDir}/.git --work-tree=${worktreePath} status --porcelain`,
        { encoding: 'utf8' },
      )

      if (worktreeStatus.trim()) {
        return `⚠️  Worktree has uncommitted changes:

${execSync(`git --git-dir=${currentDir}/.git --work-tree=${worktreePath} status`, { encoding: 'utf8' })}

🔄 Would you like me to:
1. Commit these changes first
2. Stash them temporarily  
3. Show the diff to review

Please respond with your choice, or use /worktree_commit ${worktreeName} to commit the changes first.`
      }

      // Step 3: Check current branch in worktree
      const currentBranch = execSync(
        `git --git-dir=${currentDir}/.git --work-tree=${worktreePath} branch --show-current`,
        { encoding: 'utf8' },
      ).trim()

      // Step 4: Check if branch has commits ahead of main
      const branchStatus = execSync(
        `git log main..${currentBranch} --oneline`,
        { encoding: 'utf8' },
      ).trim()

      if (!branchStatus) {
        return `ℹ️  Branch '${currentBranch}' is up to date with main. Nothing to merge.

Current worktree status: Clean
Branch: ${currentBranch}
Location: ${worktreePath}`
      }

      // Step 5: Show what will be merged
      const commitsSummary = execSync(
        `git log main..${currentBranch} --oneline`,
        { encoding: 'utf8' },
      )
      const diffStat = execSync(`git diff main...${currentBranch} --stat`, {
        encoding: 'utf8',
      })

      // Step 6: Perform the merge
      const currentMainBranch = execSync('git branch --show-current', {
        encoding: 'utf8',
      }).trim()

      if (currentMainBranch !== 'main') {
        execSync('git checkout main')
      }

      // Create backup branch before merge
      const backupBranchName = `backup-before-merge-${currentBranch}-${Date.now()}`
      execSync(`git branch ${backupBranchName}`)

      // Perform merge
      execSync(`git merge ${currentBranch}`)

      // Step 7: Clean up worktree
      execSync(`git worktree remove ${worktreePath}`)
      execSync(`git branch -d ${currentBranch}`)

      return `✅ Successfully merged worktree '${worktreeName}'!

📊 Merged commits:
${commitsSummary}

📈 Changes summary:
${diffStat}

🔧 Actions performed:
✅ Checked worktree status (clean)
✅ Created backup branch: ${backupBranchName}
✅ Merged ${currentBranch} into main
✅ Removed worktree: ${worktreePath}
✅ Deleted branch: ${currentBranch}

💡 If you need to rollback: git reset --hard ${backupBranchName}`
    } catch (error) {
      return `❌ Error during worktree merge: ${error}

🔄 Recovery steps:
1. Check worktree status: git --work-tree=${worktreePath} status
2. Check current branch: git branch --show-current
3. List worktrees: git worktree list

If you need help, please describe what you were trying to do.`
    }
  },
}

export default worktreeMerge
