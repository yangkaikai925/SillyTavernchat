import express from 'express';
import { requireAdminMiddleware } from '../users.js';
import {
    createInvitationCode,
    validateInvitationCode,
    getAllInvitationCodes,
    deleteInvitationCode,
    isInvitationCodesEnabled,
    cleanupExpiredInvitationCodes
} from '../invitation-codes.js';

export const router = express.Router();

/**
 * 检查邀请码功能是否启用 (公开端点，用于注册页面)
 */
router.get('/enabled', (request, response) => {
    console.log('邀请码状态端点被访问:', request.ip, request.headers['user-agent']);
    const enabled = isInvitationCodesEnabled();
    console.log('邀请码功能状态:', enabled);
    return response.json({ enabled });
});

/**
 * 创建邀请码 (仅管理员)
 */
router.post('/create', requireAdminMiddleware, async (request, response) => {
    try {
        if (!isInvitationCodesEnabled()) {
            return response.status(400).json({ error: 'Invitation codes are disabled' });
        }

        const { expiresInHours } = request.body;
        const createdBy = request.user.profile.handle;

        const invitation = await createInvitationCode(createdBy, expiresInHours);

        return response.json({
            code: invitation.code,
            createdAt: invitation.createdAt,
            expiresAt: invitation.expiresAt
        });
    } catch (error) {
        console.error('Create invitation code failed:', error);
        return response.status(500).json({ error: 'Failed to create invitation code' });
    }
});

/**
 * 批量创建邀请码 (仅管理员)
 */
router.post('/create-batch', requireAdminMiddleware, async (request, response) => {
    try {
        if (!isInvitationCodesEnabled()) {
            return response.status(400).json({ error: 'Invitation codes are disabled' });
        }

        const { count, expiresInHours } = request.body;
        const createdBy = request.user.profile.handle;

        // 验证数量
        if (!count || count < 1 || count > 100) {
            return response.status(400).json({ error: 'Count must be between 1 and 100' });
        }

        const invitations = [];

        // 批量生成邀请码
        for (let i = 0; i < count; i++) {
            try {
                const invitation = await createInvitationCode(createdBy, expiresInHours);
                invitations.push({
                    code: invitation.code,
                    createdAt: invitation.createdAt,
                    expiresAt: invitation.expiresAt
                });
            } catch (error) {
                console.error(`Failed to create invitation code ${i + 1}:`, error);
                // 继续生成其他邀请码
            }
        }

        return response.json({
            codes: invitations,
            count: invitations.length,
            message: `Successfully created ${invitations.length} invitation codes`
        });
    } catch (error) {
        console.error('Create batch invitation codes failed:', error);
        return response.status(500).json({ error: 'Failed to create batch invitation codes' });
    }
});

/**
 * 验证邀请码
 */
router.post('/validate', async (request, response) => {
    try {
        const { code } = request.body;

        if (!code) {
            return response.status(400).json({ error: 'Invitation code is required' });
        }

        const validation = await validateInvitationCode(code);

        return response.json(validation);
    } catch (error) {
        console.error('Validate invitation code failed:', error);
        return response.status(500).json({ error: 'Failed to validate invitation code' });
    }
});

/**
 * 获取所有邀请码 (仅管理员)
 */
router.get('/list', requireAdminMiddleware, async (request, response) => {
    try {
        if (!isInvitationCodesEnabled()) {
            return response.json([]);
        }

        const invitations = await getAllInvitationCodes();

        // 不返回敏感信息给前端
        const safeInvitations = invitations.map(inv => ({
            code: inv.code,
            createdBy: inv.createdBy,
            createdAt: inv.createdAt,
            used: inv.used,
            usedBy: inv.usedBy,
            usedAt: inv.usedAt,
            expiresAt: inv.expiresAt,
            expired: inv.expiresAt && Date.now() > inv.expiresAt
        }));

        return response.json(safeInvitations);
    } catch (error) {
        console.error('List invitation codes failed:', error);
        return response.status(500).json({ error: 'Failed to list invitation codes' });
    }
});

/**
 * 删除邀请码 (仅管理员)
 */
router.delete('/:code', requireAdminMiddleware, async (request, response) => {
    try {
        if (!isInvitationCodesEnabled()) {
            return response.status(400).json({ error: 'Invitation codes are disabled' });
        }

        const { code } = request.params;

        const success = await deleteInvitationCode(code);

        if (success) {
            return response.json({ message: 'Invitation code deleted successfully' });
        } else {
            return response.status(404).json({ error: 'Invitation code not found' });
        }
    } catch (error) {
        console.error('Delete invitation code failed:', error);
        return response.status(500).json({ error: 'Failed to delete invitation code' });
    }
});

/**
 * 清理过期邀请码 (仅管理员)
 */
router.post('/cleanup', requireAdminMiddleware, async (request, response) => {
    try {
        if (!isInvitationCodesEnabled()) {
            return response.json({ cleaned: 0 });
        }

        const cleanedCount = await cleanupExpiredInvitationCodes();

        return response.json({
            message: `Cleaned up ${cleanedCount} expired invitation codes`,
            cleaned: cleanedCount
        });
    } catch (error) {
        console.error('Cleanup invitation codes failed:', error);
        return response.status(500).json({ error: 'Failed to cleanup invitation codes' });
    }
});

export default router;
