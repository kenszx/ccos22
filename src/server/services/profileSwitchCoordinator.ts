/**
 * Profile Switch Coordinator
 *
 * 统一协调 profile 切换时的所有清理和重建工作。
 * 切换流程：
 *   1. 拒绝新的 session 创建请求
 *   2. 停止所有运行中的 CLI 子进程
 *   3. 断开所有 H5 WebSocket 连接
 *   4. 停止 Cron Scheduler
 *   5. 切换 profile registry
 *   6. 清除所有服务的 path cache
 *   7. 重新加载 Provider 配置
 *   8. 重启 Cron Scheduler
 *   9. 恢复 session 创建
 */

import { conversationService } from './conversationService.js'
import { H5AccessService } from './h5AccessService.js'
import { sessionService } from './sessionService.js'
import { closeAllClientConnections } from '../ws/handler.js'
import { cronScheduler } from './cronScheduler.js'
import { teamWatcher } from './teamWatcher.js'

export class ProfileSwitchCoordinator {
  private switching = false

  async switchProfile(targetProfile: string): Promise<void> {
    if (this.switching) {
      throw new Error('Profile switch already in progress')
    }
    this.switching = true

    try {
      // 1. 停止所有运行中 session（发送 SIGTERM，等待 graceful shutdown）
      await conversationService.stopAllSessionsAndWait()

      // 2. 断开所有 H5 客户端 WebSocket（强制关闭，客户端会收到 close 事件）
      closeAllClientConnections('profile switched')

      // 3. 停止 cron scheduler（避免旧 profile 的任务在新 profile 上下文中执行）
      cronScheduler.stop()

      // 3.5 停止 team watcher（停止监视旧 profile 的 teams 目录）
      teamWatcher.stop()
      teamWatcher.reset()

      // 4. 执行 profile 切换（修改 profiles.json）
      const { switchProfile } = await import('../../utils/profileEngine.js')
      switchProfile(targetProfile)

      // 5. 清除所有 path cache
      const { getClaudeConfigHomeDir } = await import('../../utils/envUtils.js')
      getClaudeConfigHomeDir.cache.clear?.()

      // 6. 清除 H5 token cache（token 只在当前 profile 内有效）
      const h5 = new H5AccessService()
      h5.clearTokenCache()

      // 7. 重启 cron scheduler
      cronScheduler.start()

      // 7.5 重新启动 team watcher（开始监视新 profile 的 teams 目录）
      teamWatcher.start()
    } finally {
      this.switching = false
    }
  }

  isSwitching(): boolean {
    return this.switching
  }
}

export const profileSwitchCoordinator = new ProfileSwitchCoordinator()
