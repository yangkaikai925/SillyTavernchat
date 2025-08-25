import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

/**
 * 系统负载监控器
 * 用于收集和统计服务器资源使用情况
 */
class SystemMonitor {
        constructor() {
        this.userLoadStats = new Map(); // 存储每个用户的负载统计
        this.systemLoadHistory = []; // 系统负载历史记录
        this.maxHistoryLength = 100; // 最多保存100条历史记录
        this.startTime = Date.now();
        this.lastCpuUsage = process.cpuUsage();
        this.lastNetworkStats = this.getNetworkStats();

        // CPU使用率计算相关
        this.lastCpuInfo = this.getCpuInfo();
        this.lastCpuTime = Date.now();
        this.cpuUsageHistory = []; // CPU使用率历史，用于平滑处理
        this.maxCpuHistoryLength = 6; // 保存最近6次测量（30秒）

        // 数据持久化相关
        this.dataDir = path.join(process.cwd(), 'data', 'system-monitor');
        this.userStatsFile = path.join(this.dataDir, 'user-stats.json');
        this.loadHistoryFile = path.join(this.dataDir, 'load-history.json');
        this.systemStatsFile = path.join(this.dataDir, 'system-stats.json');

        // 确保数据目录存在
        this.ensureDataDirectory();

        // 加载历史数据
        this.loadPersistedData();

        // 定期更新系统负载
        this.updateInterval = setInterval(() => {
            this.updateSystemLoad();
        }, 5000); // 每5秒更新一次

        // 定期保存数据（每30秒）
        this.saveInterval = setInterval(() => {
            this.saveDataToDisk();
        }, 30000);
    }

    /**
     * 获取当前系统负载信息
     * @returns {Object} 系统负载信息
     */
    getSystemLoad() {
        const cpuUsage = this.getCpuUsage();
        const memoryUsage = this.getMemoryUsage();
        const diskUsage = this.getDiskUsage();
        const networkUsage = this.getNetworkUsage();
        const uptime = this.getUptime();

        return {
            timestamp: Date.now(),
            cpu: cpuUsage,
            memory: memoryUsage,
            disk: diskUsage,
            network: networkUsage,
            uptime: uptime,
            loadAverage: os.loadavg()
        };
    }

    /**
     * 获取CPU信息（用于计算使用率）
     * @returns {Object} CPU信息
     */
    getCpuInfo() {
        const cpus = os.cpus();
        let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;

        for (let cpu of cpus) {
            user += cpu.times.user;
            nice += cpu.times.nice;
            sys += cpu.times.sys;
            idle += cpu.times.idle;
            irq += cpu.times.irq;
        }

        const total = user + nice + sys + idle + irq;

        return {
            user,
            nice,
            sys,
            idle,
            irq,
            total
        };
    }

    /**
     * 获取CPU使用率（系统级别）
     * @returns {Object} CPU使用信息
     */
    getCpuUsage() {
        const currentTime = Date.now();
        const currentCpuInfo = this.getCpuInfo();

        // 计算时间差和CPU时间差
        const timeDelta = currentTime - this.lastCpuTime;
        const totalDelta = currentCpuInfo.total - this.lastCpuInfo.total;
        const idleDelta = currentCpuInfo.idle - this.lastCpuInfo.idle;

        let cpuPercent = 0;
        if (totalDelta > 0) {
            cpuPercent = ((totalDelta - idleDelta) / totalDelta) * 100;
        }

        // 添加到历史记录进行平滑处理
        this.cpuUsageHistory.push(cpuPercent);
        if (this.cpuUsageHistory.length > this.maxCpuHistoryLength) {
            this.cpuUsageHistory.shift();
        }

        // 计算平滑后的CPU使用率（移动平均）
        const smoothedCpuPercent = this.cpuUsageHistory.reduce((sum, val) => sum + val, 0) / this.cpuUsageHistory.length;

        // 更新上次的值
        this.lastCpuInfo = currentCpuInfo;
        this.lastCpuTime = currentTime;

        const cpus = os.cpus();

        return {
            percent: Math.min(100, Math.max(0, smoothedCpuPercent)),
            raw: Math.min(100, Math.max(0, cpuPercent)), // 原始值，用于调试
            cores: cpus.length,
            model: cpus[0]?.model || 'Unknown',
            speed: cpus[0]?.speed || 0,
            loadAverage: os.loadavg(), // 添加系统负载平均值
            user: totalDelta > 0 ? ((currentCpuInfo.user - this.lastCpuInfo?.user || 0) / totalDelta) * 100 : 0,
            system: totalDelta > 0 ? ((currentCpuInfo.sys - this.lastCpuInfo?.sys || 0) / totalDelta) * 100 : 0,
            idle: totalDelta > 0 ? (idleDelta / totalDelta) * 100 : 0
        };
    }

    /**
     * 获取内存使用情况
     * @returns {Object} 内存使用信息
     */
    getMemoryUsage() {
        const totalMemory = os.totalmem();
        const freeMemory = os.freemem();
        const usedMemory = totalMemory - freeMemory;
        const processMemory = process.memoryUsage();

        return {
            total: totalMemory,
            used: usedMemory,
            free: freeMemory,
            percent: (usedMemory / totalMemory) * 100,
            process: {
                rss: processMemory.rss,
                heapTotal: processMemory.heapTotal,
                heapUsed: processMemory.heapUsed,
                external: processMemory.external
            }
        };
    }

    /**
     * 获取磁盘使用情况
     * @returns {Object} 磁盘使用信息
     */
    getDiskUsage() {
        try {
            const stats = fs.statSync(process.cwd());
            return {
                available: true,
                path: process.cwd(),
                // 简化的磁盘信息，实际项目中可能需要更详细的实现
                usage: 'N/A'
            };
        } catch (error) {
            return {
                available: false,
                error: error.message
            };
        }
    }

    /**
     * 获取网络使用情况
     * @returns {Object} 网络使用信息
     */
    getNetworkUsage() {
        const currentStats = this.getNetworkStats();
        const deltaTime = 5; // 5秒间隔

        let bytesIn = 0;
        let bytesOut = 0;

        if (this.lastNetworkStats) {
            bytesIn = (currentStats.bytesIn - this.lastNetworkStats.bytesIn) / deltaTime;
            bytesOut = (currentStats.bytesOut - this.lastNetworkStats.bytesOut) / deltaTime;
        }

        this.lastNetworkStats = currentStats;

        return {
            interfaces: os.networkInterfaces(),
            bytesPerSecIn: Math.max(0, bytesIn),
            bytesPerSecOut: Math.max(0, bytesOut),
            totalBytesIn: currentStats.bytesIn,
            totalBytesOut: currentStats.bytesOut
        };
    }

    /**
     * 获取网络统计数据
     * @returns {Object} 网络统计
     */
    getNetworkStats() {
        // 简化实现，实际项目中可能需要读取 /proc/net/dev (Linux) 或其他系统特定文件
        return {
            bytesIn: Math.floor(Math.random() * 1000000), // 模拟数据
            bytesOut: Math.floor(Math.random() * 1000000)
        };
    }

    /**
     * 获取系统运行时间
     * @returns {Object} 运行时间信息
     */
    getUptime() {
        const systemUptime = os.uptime();
        const processUptime = (Date.now() - this.startTime) / 1000;

        return {
            system: systemUptime,
            process: processUptime,
            systemFormatted: this.formatUptime(systemUptime),
            processFormatted: this.formatUptime(processUptime)
        };
    }

    /**
     * 格式化运行时间
     * @param {number} seconds 秒数
     * @returns {string} 格式化的时间字符串
     */
    formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        return `${days}天 ${hours}时 ${minutes}分 ${secs}秒`;
    }

    /**
     * 更新系统负载历史记录（只在有用户活跃时记录）
     */
    updateSystemLoad() {
        // 检查是否有活跃用户
        const currentTime = Date.now();
        const activeThreshold = 10 * 60 * 1000; // 10分钟内活跃的用户
        let hasActiveUsers = false;

        for (const [userHandle, stats] of this.userLoadStats) {
            if (currentTime - stats.lastActivity <= activeThreshold) {
                hasActiveUsers = true;
                break;
            }
        }

        // 只在有活跃用户时记录系统负载
        if (hasActiveUsers) {
            const currentLoad = this.getSystemLoad();
            // 添加活跃用户数量信息
            currentLoad.activeUsers = this.getActiveUserCount();
            this.systemLoadHistory.push(currentLoad);

            // 保持历史记录在限定长度内
            if (this.systemLoadHistory.length > this.maxHistoryLength) {
                this.systemLoadHistory.shift();
            }
        }
    }

    /**
     * 获取活跃用户数量
     * @returns {number} 活跃用户数量
     */
    getActiveUserCount() {
        const currentTime = Date.now();
        const activeThreshold = 10 * 60 * 1000; // 10分钟内活跃的用户
        let activeCount = 0;

        for (const [userHandle, stats] of this.userLoadStats) {
            if (currentTime - stats.lastActivity <= activeThreshold) {
                activeCount++;
            }
        }

        return activeCount;
    }

        /**
     * 记录用户聊天活动
     * @param {string} userHandle 用户句柄
     * @param {string} messageType 消息类型 ('user' 或 'character')
     * @param {Object} messageData 消息数据
     */
    recordUserChatActivity(userHandle, messageType, messageData = {}) {
        if (!this.userLoadStats.has(userHandle)) {
            this.userLoadStats.set(userHandle, {
                totalUserMessages: 0,      // 用户发送的消息数
                totalCharacterMessages: 0, // AI回复的消息数
                totalMessages: 0,          // 总消息数（楼层数）
                sessionsToday: 0,          // 今日会话次数
                lastActivity: Date.now(),
                firstActivity: Date.now(),
                todayMessages: 0,          // 今日消息数
                lastMessageTime: Date.now(),
                characterChats: {},        // 按角色分组的聊天统计
                dailyStats: {}             // 按日期统计
            });
        }

        const userStats = this.userLoadStats.get(userHandle);
        const today = new Date().toDateString();

        // 更新基本统计
        userStats.totalMessages++;
        userStats.lastActivity = Date.now();
        userStats.lastMessageTime = Date.now();

        // 按消息类型统计
        if (messageType === 'user') {
            userStats.totalUserMessages++;
        } else if (messageType === 'character') {
            userStats.totalCharacterMessages++;
        }

        // 不再统计字数，减少系统负载

        // 今日统计
        if (!userStats.dailyStats[today]) {
            userStats.dailyStats[today] = {
                messages: 0,
                userMessages: 0,
                characterMessages: 0,
                firstMessage: Date.now()
            };
        }

        const todayStats = userStats.dailyStats[today];
        todayStats.messages++;
        if (messageType === 'user') {
            todayStats.userMessages++;
        } else if (messageType === 'character') {
            todayStats.characterMessages++;
        }

        // 不再统计字数

        userStats.todayMessages = todayStats.messages;

        // 按角色统计
        if (messageData.characterName) {
            if (!userStats.characterChats[messageData.characterName]) {
                userStats.characterChats[messageData.characterName] = {
                    totalMessages: 0,
                    userMessages: 0,
                    characterMessages: 0,
                    lastChat: Date.now()
                };
            }

            const charStats = userStats.characterChats[messageData.characterName];
            charStats.totalMessages++;
            charStats.lastChat = Date.now();

            if (messageType === 'user') {
                charStats.userMessages++;
            } else if (messageType === 'character') {
                charStats.characterMessages++;
            }
        }
    }



    /**
     * 获取用户聊天统计
     * @param {string} userHandle 用户句柄
     * @returns {Object} 用户聊天统计
     */
    getUserLoadStats(userHandle) {
        const userStats = this.userLoadStats.get(userHandle);
        if (!userStats) {
            return null;
        }

        const currentTime = Date.now();
        const activeTime = currentTime - userStats.firstActivity;
        const today = new Date().toDateString();
        const todayStats = userStats.dailyStats[today] || {};

        return {
            userHandle: userHandle,
            totalMessages: userStats.totalMessages,
            totalUserMessages: userStats.totalUserMessages,
            totalCharacterMessages: userStats.totalCharacterMessages,

            todayMessages: userStats.todayMessages,
            activeTime: activeTime,
            activeTimeFormatted: this.formatUptime(activeTime / 1000),
            avgMessagesPerDay: this.calculateAvgMessagesPerDay(userStats),
            lastActivity: userStats.lastActivity,
            lastActivityFormatted: new Date(userStats.lastActivity).toLocaleString('zh-CN'),
            lastMessageTime: userStats.lastMessageTime,
            lastMessageTimeFormatted: new Date(userStats.lastMessageTime).toLocaleString('zh-CN'),
            characterChats: userStats.characterChats,
            todayStats: todayStats,
            chatActivityLevel: this.calculateChatActivityLevel(userStats),
            isOnline: true // 只有活跃用户才会被返回
        };
    }

    /**
     * 计算用户平均每日消息数
     * @param {Object} userStats 用户统计数据
     * @returns {number} 平均每日消息数
     */
    calculateAvgMessagesPerDay(userStats) {
        const dailyStats = userStats.dailyStats;
        const days = Object.keys(dailyStats).length;
        if (days === 0) return 0;

        return Math.round(userStats.totalMessages / days);
    }

    /**
     * 计算用户聊天活跃度等级
     * @param {Object} userStats 用户统计数据
     * @returns {string} 活跃度等级
     */
    calculateChatActivityLevel(userStats) {
        const todayMessages = userStats.todayMessages || 0;

        if (todayMessages >= 100) return 'very_high';
        if (todayMessages >= 50) return 'high';
        if (todayMessages >= 20) return 'medium';
        if (todayMessages >= 5) return 'low';
        return 'minimal';
    }



        /**
     * 获取所有用户的聊天统计（只返回活跃用户）
     * @returns {Array} 活跃用户的聊天统计
     */
    getAllUserLoadStats() {
        const allStats = [];
        const currentTime = Date.now();
        const activeThreshold = 10 * 60 * 1000; // 10分钟内活跃的用户

        for (const [userHandle, stats] of this.userLoadStats) {
            // 只统计最近活跃的用户
            if (currentTime - stats.lastActivity <= activeThreshold) {
                const userStats = this.getUserLoadStats(userHandle);
                if (userStats) {
                    allStats.push(userStats);
                }
            }
        }

        // 按今日消息数排序（最活跃的用户在前）
        return allStats.sort((a, b) => b.todayMessages - a.todayMessages);
    }

    /**
     * 获取系统负载历史
     * @param {number} limit 限制返回的记录数
     * @returns {Array} 系统负载历史
     */
    getSystemLoadHistory(limit = 20) {
        return this.systemLoadHistory.slice(-limit);
    }

    /**
     * 重置用户负载统计
     * @param {string} userHandle 用户句柄
     */
    resetUserStats(userHandle) {
        this.userLoadStats.delete(userHandle);
    }



    /**
     * 确保数据目录存在
     */
    ensureDataDirectory() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
                console.log(`创建系统监控数据目录: ${this.dataDir}`);
            }
        } catch (error) {
            console.error('创建数据目录失败:', error);
        }
    }

    /**
     * 加载持久化数据
     */
    loadPersistedData() {
        try {
            // 加载用户统计数据
            if (fs.existsSync(this.userStatsFile)) {
                const userData = JSON.parse(fs.readFileSync(this.userStatsFile, 'utf8'));
                this.userLoadStats = new Map(Object.entries(userData));
                console.log(`加载用户统计数据: ${this.userLoadStats.size} 个用户`);
            }

            // 加载系统负载历史
            if (fs.existsSync(this.loadHistoryFile)) {
                const historyData = JSON.parse(fs.readFileSync(this.loadHistoryFile, 'utf8'));
                this.systemLoadHistory = historyData;
                console.log(`加载系统负载历史: ${this.systemLoadHistory.length} 条记录`);
            }

            // 加载系统统计信息
            if (fs.existsSync(this.systemStatsFile)) {
                const systemData = JSON.parse(fs.readFileSync(this.systemStatsFile, 'utf8'));
                if (systemData.startTime) {
                    this.startTime = systemData.startTime;
                }
                console.log(`加载系统统计信息，启动时间: ${new Date(this.startTime).toLocaleString()}`);
            }
        } catch (error) {
            console.error('加载持久化数据失败:', error);
        }
    }

    /**
     * 保存数据到磁盘
     */
    saveDataToDisk() {
        try {
            // 保存用户统计数据
            const userStatsObj = Object.fromEntries(this.userLoadStats);
            fs.writeFileSync(this.userStatsFile, JSON.stringify(userStatsObj, null, 2));

            // 保存系统负载历史（只保存最近的记录）
            const recentHistory = this.systemLoadHistory.slice(-this.maxHistoryLength);
            fs.writeFileSync(this.loadHistoryFile, JSON.stringify(recentHistory, null, 2));

            // 保存系统统计信息
            const systemStats = {
                startTime: this.startTime,
                lastSave: Date.now()
            };
            fs.writeFileSync(this.systemStatsFile, JSON.stringify(systemStats, null, 2));

            if (process.env.NODE_ENV === 'development') {
                console.log(`数据已保存: 用户=${this.userLoadStats.size}, 历史=${recentHistory.length}`);
            }
        } catch (error) {
            console.error('保存数据失败:', error);
        }
    }

    /**
     * 清除所有统计数据
     */
    clearAllStats() {
        this.userLoadStats.clear();
        this.systemLoadHistory = [];

        // 删除持久化文件
        try {
            [this.userStatsFile, this.loadHistoryFile, this.systemStatsFile].forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            });
            console.log('所有统计数据已清除');
        } catch (error) {
            console.error('清除数据文件失败:', error);
        }
    }

    /**
     * 销毁监控器
     */
    destroy() {
        // 保存数据
        this.saveDataToDisk();

        // 清理定时器
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }

        if (this.saveInterval) {
            clearInterval(this.saveInterval);
            this.saveInterval = null;
        }
    }
}

// 创建全局系统监控器实例
const systemMonitor = new SystemMonitor();

// 进程退出时保存数据
process.on('SIGINT', () => {
    console.log('\n正在保存系统监控数据...');
    systemMonitor.saveDataToDisk();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n正在保存系统监控数据...');
    systemMonitor.saveDataToDisk();
    process.exit(0);
});

process.on('beforeExit', () => {
    systemMonitor.saveDataToDisk();
});

export default systemMonitor;
export { SystemMonitor };
