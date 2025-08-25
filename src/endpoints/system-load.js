import express from 'express';
import systemMonitor from '../system-monitor.js';
import { requireAdminMiddleware } from '../users.js';

export const router = express.Router();

/**
 * 获取系统负载信息
 */
router.get('/system', requireAdminMiddleware, async (request, response) => {
    try {
        const systemLoad = systemMonitor.getSystemLoad();
        const systemHistory = systemMonitor.getSystemLoadHistory(50);

        return response.json({
            current: systemLoad,
            history: systemHistory,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('获取系统负载失败:', error);
        return response.status(500).json({ error: '获取系统负载失败' });
    }
});

/**
 * 获取所有用户的负载统计
 */
router.get('/users', requireAdminMiddleware, async (request, response) => {
    try {
        const userStats = systemMonitor.getAllUserLoadStats();
        const systemLoad = systemMonitor.getSystemLoad();

        return response.json({
            users: userStats,
            systemLoad: systemLoad,
            totalUsers: userStats.length,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('获取用户负载统计失败:', error);
        return response.status(500).json({ error: '获取用户负载统计失败' });
    }
});

/**
 * 获取特定用户的负载统计
 */
router.get('/user/:handle', requireAdminMiddleware, async (request, response) => {
    try {
        const userHandle = request.params.handle;
        const userStats = systemMonitor.getUserLoadStats(userHandle);

        if (!userStats) {
            return response.status(404).json({ error: '用户负载数据未找到' });
        }

        return response.json({
            userHandle,
            stats: userStats,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('获取用户负载统计失败:', error);
        return response.status(500).json({ error: '获取用户负载统计失败' });
    }
});

/**
 * 重置用户负载统计
 */
router.post('/user/:handle/reset', requireAdminMiddleware, async (request, response) => {
    try {
        const userHandle = request.params.handle;
        systemMonitor.resetUserStats(userHandle);

        return response.json({
            message: `用户 ${userHandle} 的负载统计已重置`,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('重置用户负载统计失败:', error);
        return response.status(500).json({ error: '重置用户负载统计失败' });
    }
});

/**
 * 清理所有负载统计数据
 */
router.post('/clear', requireAdminMiddleware, async (request, response) => {
    try {
        systemMonitor.clearAllStats();

        return response.json({
            message: '所有负载统计数据已清理',
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('清理负载统计数据失败:', error);
        return response.status(500).json({ error: '清理负载统计数据失败' });
    }
});

/**
 * 获取负载监控概览
 */
router.get('/overview', requireAdminMiddleware, async (request, response) => {
    try {
        const systemLoad = systemMonitor.getSystemLoad();
        const userStats = systemMonitor.getAllUserLoadStats();
        const systemHistory = systemMonitor.getSystemLoadHistory(10);

        // 计算总体统计
        const totalMessages = userStats.reduce((sum, user) => sum + (user.totalMessages || 0), 0);
        const totalUserMessages = userStats.reduce((sum, user) => sum + (user.totalUserMessages || 0), 0);
        const totalCharacterMessages = userStats.reduce((sum, user) => sum + (user.totalCharacterMessages || 0), 0);

        const totalTodayMessages = userStats.reduce((sum, user) => sum + (user.todayMessages || 0), 0);
        const activeUsers = userStats.length; // userStats 已经只包含活跃用户

        // 找出最活跃的用户（按今日消息数排序）
        const topActiveUsers = userStats
            .sort((a, b) => b.todayMessages - a.todayMessages)
            .slice(0, 10); // 显示前10个最活跃的用户

        return response.json({
            system: {
                current: systemLoad,
                history: systemHistory,
                uptime: systemLoad.uptime
            },
            users: {
                total: userStats.length,
                active: activeUsers,
                totalMessages,
                totalUserMessages,
                totalCharacterMessages,

                totalTodayMessages,
                topLoad: topActiveUsers
            },
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('获取负载监控概览失败:', error);
        return response.status(500).json({ error: '获取负载监控概览失败' });
    }
});

export default router;
