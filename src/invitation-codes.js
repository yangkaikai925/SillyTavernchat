import storage from 'node-persist';
import crypto from 'node:crypto';
import { getConfigValue } from './util.js';

const INVITATION_PREFIX = 'invitation:';
const ENABLE_INVITATION_CODES = getConfigValue('enableInvitationCodes', false, 'boolean');

/**
 * @typedef {Object} InvitationCode
 * @property {string} code - 邀请码
 * @property {string} createdBy - 创建者用户句柄
 * @property {number} createdAt - 创建时间戳
 * @property {boolean} used - 是否已使用
 * @property {string} usedBy - 使用者用户句柄（如果已使用）
 * @property {number} usedAt - 使用时间戳（如果已使用）
 * @property {number} expiresAt - 过期时间戳（可选）
 */

/**
 * 生成邀请码key
 * @param {string} code 邀请码
 * @returns {string} 存储key
 */
function toInvitationKey(code) {
    return `${INVITATION_PREFIX}${code}`;
}

/**
 * 生成随机邀请码
 * @returns {string} 邀请码
 */
function generateInvitationCode() {
    return crypto.randomBytes(8).toString('hex').toUpperCase();
}

/**
 * 创建邀请码
 * @param {string} createdBy 创建者用户句柄
 * @param {number} expiresInHours 过期小时数（可选，默认不过期）
 * @returns {Promise<InvitationCode>} 创建的邀请码对象
 */
export async function createInvitationCode(createdBy, expiresInHours = null) {
    if (!ENABLE_INVITATION_CODES) {
        throw new Error('Invitation codes are disabled');
    }

    const code = generateInvitationCode();
    const now = Date.now();
    const expiresAt = expiresInHours ? now + (expiresInHours * 60 * 60 * 1000) : null;

    const invitation = {
        code,
        createdBy,
        createdAt: now,
        used: false,
        usedBy: null,
        usedAt: null,
        expiresAt
    };

    await storage.setItem(toInvitationKey(code), invitation);
    console.log(`Invitation code created: ${code} by ${createdBy}`);

    return invitation;
}

/**
 * 验证邀请码
 * @param {string} code 邀请码
 * @returns {Promise<{valid: boolean, reason?: string, invitation?: InvitationCode}>} 验证结果
 */
export async function validateInvitationCode(code) {
    if (!ENABLE_INVITATION_CODES) {
        return { valid: true }; // 如果功能未启用，则认为有效
    }

    if (!code || typeof code !== 'string') {
        return { valid: false, reason: 'Invalid invitation code format' };
    }

    const invitation = await storage.getItem(toInvitationKey(code.toUpperCase()));

    if (!invitation) {
        return { valid: false, reason: 'Invitation code not found' };
    }

    if (invitation.used) {
        return { valid: false, reason: 'Invitation code already used' };
    }

    if (invitation.expiresAt && Date.now() > invitation.expiresAt) {
        return { valid: false, reason: 'Invitation code expired' };
    }

    return { valid: true, invitation };
}

/**
 * 使用邀请码
 * @param {string} code 邀请码
 * @param {string} usedBy 使用者用户句柄
 * @returns {Promise<boolean>} 是否成功使用
 */
export async function useInvitationCode(code, usedBy) {
    if (!ENABLE_INVITATION_CODES) {
        return true; // 如果功能未启用，则认为成功
    }

    const validation = await validateInvitationCode(code);
    if (!validation.valid) {
        return false;
    }

    const invitation = validation.invitation;
    invitation.used = true;
    invitation.usedBy = usedBy;
    invitation.usedAt = Date.now();

    await storage.setItem(toInvitationKey(code.toUpperCase()), invitation);
    console.log(`Invitation code used: ${code} by ${usedBy}`);

    return true;
}

/**
 * 获取所有邀请码
 * @returns {Promise<InvitationCode[]>} 邀请码列表
 */
export async function getAllInvitationCodes() {
    if (!ENABLE_INVITATION_CODES) {
        return [];
    }

    const keys = await storage.keys();
    const invitationKeys = keys.filter(key => key.startsWith(INVITATION_PREFIX));

    const invitations = [];
    for (const key of invitationKeys) {
        const invitation = await storage.getItem(key);
        if (invitation) {
            invitations.push(invitation);
        }
    }

    // 按创建时间降序排序
    return invitations.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * 删除邀请码
 * @param {string} code 邀请码
 * @returns {Promise<boolean>} 是否成功删除
 */
export async function deleteInvitationCode(code) {
    if (!ENABLE_INVITATION_CODES) {
        return false;
    }

    const key = toInvitationKey(code.toUpperCase());
    const invitation = await storage.getItem(key);

    if (!invitation) {
        return false;
    }

    await storage.removeItem(key);
    console.log(`Invitation code deleted: ${code}`);

    return true;
}

/**
 * 检查是否启用邀请码功能
 * @returns {boolean} 是否启用
 */
export function isInvitationCodesEnabled() {
    return ENABLE_INVITATION_CODES;
}

/**
 * 清理过期的邀请码
 * @returns {Promise<number>} 清理的数量
 */
export async function cleanupExpiredInvitationCodes() {
    if (!ENABLE_INVITATION_CODES) {
        return 0;
    }

    const invitations = await getAllInvitationCodes();
    const now = Date.now();
    let cleanedCount = 0;

    for (const invitation of invitations) {
        if (invitation.expiresAt && now > invitation.expiresAt) {
            await deleteInvitationCode(invitation.code);
            cleanedCount++;
        }
    }

    if (cleanedCount > 0) {
        console.log(`Cleaned up ${cleanedCount} expired invitation codes`);
    }

    return cleanedCount;
}
