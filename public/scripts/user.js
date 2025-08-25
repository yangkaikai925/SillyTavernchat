import { getRequestHeaders } from '../script.js';
import { POPUP_RESULT, POPUP_TYPE, callGenericPopup } from './popup.js';
import { renderTemplateAsync } from './templates.js';
import { ensureImageFormatSupported, getBase64Async, humanFileSize } from './utils.js';

/**
 * @type {import('../../src/users.js').UserViewModel} Logged in user
 */
export let currentUser = null;
export let accountsEnabled = false;

// Extend the session every 10 minutes
const SESSION_EXTEND_INTERVAL = 10 * 60 * 1000;

/**
 * Enable or disable user account controls in the UI.
 * @param {boolean} isEnabled User account controls enabled
 * @returns {Promise<void>}
 */
export async function setUserControls(isEnabled) {
    accountsEnabled = isEnabled;

    if (!isEnabled) {
        $('#logout_button').hide();
        $('#admin_button').hide();
        return;
    }

    $('#logout_button').show();
    await getCurrentUser();
}

/**
 * Check if the current user is an admin.
 * @returns {boolean} True if the current user is an admin
 */
export function isAdmin() {
    if (!accountsEnabled) {
        return true;
    }

    if (!currentUser) {
        return false;
    }

    return Boolean(currentUser.admin);
}

/**
 * Gets the handle string of the current user.
 * @returns {string} User handle
 */
export function getCurrentUserHandle() {
    return currentUser?.handle || 'default-user';
}

/**
 * Get the current user.
 * @returns {Promise<void>}
 */
async function getCurrentUser() {
    try {
        const response = await fetch('/api/users/me', {
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to get current user');
        }

        currentUser = await response.json();
        $('#admin_button').toggle(accountsEnabled && isAdmin());
    } catch (error) {
        console.error('Error getting current user:', error);
    }
}

/**
 * Get a list of all users.
 * @returns {Promise<import('../../src/users.js').UserViewModel[]>} Users
 */
async function getUsers() {
    try {
        const response = await fetch('/api/users/get', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Failed to get users');
        }

        return response.json();
    } catch (error) {
        console.error('Error getting users:', error);
    }
}

/**
 * Enable a user account.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
async function enableUser(handle, callback) {
    try {
        const response = await fetch('/api/users/enable', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to enable user');
            throw new Error('Failed to enable user');
        }

        callback();
    } catch (error) {
        console.error('Error enabling user:', error);
    }
}

async function disableUser(handle, callback) {
    try {
        const response = await fetch('/api/users/disable', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data?.error || 'Unknown error', 'Failed to disable user');
            throw new Error('Failed to disable user');
        }

        callback();
    } catch (error) {
        console.error('Error disabling user:', error);
    }
}

/**
 * Promote a user to admin.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
async function promoteUser(handle, callback) {
    try {
        const response = await fetch('/api/users/promote', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to promote user');
            throw new Error('Failed to promote user');
        }

        callback();
    } catch (error) {
        console.error('Error promoting user:', error);
    }
}

/**
 * Demote a user from admin.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function demoteUser(handle, callback) {
    try {
        const response = await fetch('/api/users/demote', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to demote user');
            throw new Error('Failed to demote user');
        }

        callback();
    } catch (error) {
        console.error('Error demoting user:', error);
    }
}

/**
 * Create a new user.
 * @param {HTMLFormElement} form Form element
 */
async function createUser(form, callback) {
    const errors = [];
    const formData = new FormData(form);

    if (!formData.get('handle')) {
        errors.push('Handle is required');
    }

    if (formData.get('password') !== formData.get('confirm')) {
        errors.push('Passwords do not match');
    }

    if (errors.length) {
        toastr.error(errors.join(', '), 'Failed to create user');
        return;
    }

    const body = {};
    formData.forEach(function (value, key) {
        if (key === 'confirm') {
            return;
        }
        if (key.startsWith('_')) {
            key = key.substring(1);
        }
        body[key] = value;
    });

    try {
        const response = await fetch('/api/users/create', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to create user');
            throw new Error('Failed to create user');
        }

        form.reset();
        callback();
    } catch (error) {
        console.error('Error creating user:', error);
    }
}

/**
 * Backup a user's data.
 * @param {string} handle Handle of the user to backup
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
async function backupUserData(handle, callback) {
    try {
        toastr.info('Please wait for the download to start.', 'Backup Requested');
        const response = await fetch('/api/users/backup', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to backup user data');
            throw new Error('Failed to backup user data');
        }

        const blob = await response.blob();
        const header = response.headers.get('Content-Disposition');
        const parts = header.split(';');
        const filename = parts[1].split('=')[1].replaceAll('"', '');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        callback();
    } catch (error) {
        console.error('Error backing up user data:', error);
    }
}

/**
 * Shows a popup to change a user's password.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function changePassword(handle, callback) {
    try {
        const template = $(await renderTemplateAsync('changePassword'));
        template.find('.currentPasswordBlock').toggle(!isAdmin());
        let newPassword = '';
        let confirmPassword = '';
        let oldPassword = '';
        template.find('input[name="current"]').on('input', function () {
            oldPassword = String($(this).val());
        });
        template.find('input[name="password"]').on('input', function () {
            newPassword = String($(this).val());
        });
        template.find('input[name="confirm"]').on('input', function () {
            confirmPassword = String($(this).val());
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Change', cancelButton: 'Cancel', wide: false, large: false });
        if (result === POPUP_RESULT.CANCELLED || result === POPUP_RESULT.NEGATIVE) {
            throw new Error('Change password cancelled');
        }

        if (newPassword !== confirmPassword) {
            toastr.error('Passwords do not match', 'Failed to change password');
            throw new Error('Passwords do not match');
        }

        const response = await fetch('/api/users/change-password', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, newPassword, oldPassword }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to change password');
            throw new Error('Failed to change password');
        }

        toastr.success('Password changed successfully', 'Password Changed');
        callback();
    }
    catch (error) {
        console.error('Error changing password:', error);
    }
}

/**
 * Delete a user.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function deleteUser(handle, callback) {
    try {
        if (handle === currentUser.handle) {
            toastr.error('Cannot delete yourself', 'Failed to delete user');
            throw new Error('Cannot delete yourself');
        }

        let purge = false;
        let confirmHandle = '';

        const template = $(await renderTemplateAsync('deleteUser'));
        template.find('#deleteUserName').text(handle);
        template.find('input[name="deleteUserData"]').on('input', function () {
            purge = $(this).is(':checked');
        });
        template.find('input[name="deleteUserHandle"]').on('input', function () {
            confirmHandle = String($(this).val());
        });

        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Delete', cancelButton: 'Cancel', wide: false, large: false });

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Delete user cancelled');
        }

        if (handle !== confirmHandle) {
            toastr.error('Handles do not match', 'Failed to delete user');
            throw new Error('Handles do not match');
        }

        const response = await fetch('/api/users/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, purge }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to delete user');
            throw new Error('Failed to delete user');
        }

        toastr.success('User deleted successfully', 'User Deleted');
        callback();
    } catch (error) {
        console.error('Error deleting user:', error);
    }
}

/**
 * Reset a user's settings.
 * @param {string} handle User handle
 * @param {function} callback Success callback
 */
async function resetSettings(handle, callback) {
    try {
        let password = '';
        const template = $(await renderTemplateAsync('resetSettings'));
        template.find('input[name="password"]').on('input', function () {
            password = String($(this).val());
        });
        const result = await callGenericPopup(template, POPUP_TYPE.CONFIRM, '', { okButton: 'Reset', cancelButton: 'Cancel', wide: false, large: false });

        if (result !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Reset settings cancelled');
        }

        const response = await fetch('/api/users/reset-settings', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, password }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to reset settings');
            throw new Error('Failed to reset settings');
        }

        toastr.success('Settings reset successfully', 'Settings Reset');
        callback();
    } catch (error) {
        console.error('Error resetting settings:', error);
    }
}

/**
 * Change a user's display name.
 * @param {string} handle User handle
 * @param {string} name Current name
 * @param {function} callback Success callback
 */
async function changeName(handle, name, callback) {
    try {
        const template = $(await renderTemplateAsync('changeName'));
        const result = await callGenericPopup(template, POPUP_TYPE.INPUT, name, { okButton: 'Change', cancelButton: 'Cancel', wide: false, large: false });

        if (!result) {
            throw new Error('Change name cancelled');
        }

        name = String(result);

        const response = await fetch('/api/users/change-name', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ handle, name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to change name');
            throw new Error('Failed to change name');
        }

        toastr.success('Name changed successfully', 'Name Changed');
        callback();

    } catch (error) {
        console.error('Error changing name:', error);
    }
}

/**
 * Restore a settings snapshot.
 * @param {string} name Snapshot name
 * @param {function} callback Success callback
 */
async function restoreSnapshot(name, callback) {
    try {
        const confirm = await callGenericPopup(
            `Are you sure you want to restore the settings from "${name}"?`,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Restore', cancelButton: 'Cancel', wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Restore snapshot cancelled');
        }

        const response = await fetch('/api/settings/restore-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to restore snapshot');
            throw new Error('Failed to restore snapshot');
        }

        callback();
    } catch (error) {
        console.error('Error restoring snapshot:', error);
    }

}

/**
 * Load the content of a settings snapshot.
 * @param {string} name Snapshot name
 * @returns {Promise<string>} Snapshot content
 */
async function loadSnapshotContent(name) {
    try {
        const response = await fetch('/api/settings/load-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ name }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to load snapshot content');
            throw new Error('Failed to load snapshot content');
        }

        return response.text();
    } catch (error) {
        console.error('Error loading snapshot content:', error);
    }
}

/**
 * Gets a list of settings snapshots.
 * @returns {Promise<Snapshot[]>} List of snapshots
 * @typedef {Object} Snapshot
 * @property {string} name Snapshot name
 * @property {number} date Date in milliseconds
 * @property {number} size File size in bytes
 */
async function getSnapshots() {
    try {
        const response = await fetch('/api/settings/get-snapshots', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to get settings snapshots');
            throw new Error('Failed to get settings snapshots');
        }

        const snapshots = await response.json();
        return snapshots;
    } catch (error) {
        console.error('Error getting settings snapshots:', error);
        return [];
    }
}

/**
 * Make a snapshot of the current settings.
 * @param {function} callback Success callback
 * @returns {Promise<void>}
 */
async function makeSnapshot(callback) {
    try {
        const response = await fetch('/api/settings/make-snapshot', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to make snapshot');
            throw new Error('Failed to make snapshot');
        }

        toastr.success('Snapshot created successfully', 'Snapshot Created');
        callback();
    } catch (error) {
        console.error('Error making snapshot:', error);
    }
}

/**
 * Open the settings snapshots view.
 */
async function viewSettingsSnapshots() {
    const template = $(await renderTemplateAsync('snapshotsView'));
    async function renderSnapshots() {
        const snapshots = await getSnapshots();
        template.find('.snapshotList').empty();

        for (const snapshot of snapshots.sort((a, b) => b.date - a.date)) {
            const snapshotBlock = template.find('.snapshotTemplate .snapshot').clone();
            snapshotBlock.find('.snapshotName').text(snapshot.name);
            snapshotBlock.find('.snapshotDate').text(new Date(snapshot.date).toLocaleString());
            snapshotBlock.find('.snapshotSize').text(humanFileSize(snapshot.size));
            snapshotBlock.find('.snapshotRestoreButton').on('click', async (e) => {
                e.stopPropagation();
                restoreSnapshot(snapshot.name, () => location.reload());
            });
            snapshotBlock.find('.inline-drawer-toggle').on('click', async () => {
                const contentBlock = snapshotBlock.find('.snapshotContent');
                if (!contentBlock.val()) {
                    const content = await loadSnapshotContent(snapshot.name);
                    contentBlock.val(content);
                }

            });
            template.find('.snapshotList').append(snapshotBlock);
        }
    }

    callGenericPopup(template, POPUP_TYPE.TEXT, '', { okButton: 'Close', wide: false, large: false, allowVerticalScrolling: true });
    template.find('.makeSnapshotButton').on('click', () => makeSnapshot(renderSnapshots));
    renderSnapshots();
}

/**
 * Reset everything to default.
 * @param {function} callback Success callback
 */
async function resetEverything(callback) {
    try {
        const step1Response = await fetch('/api/users/reset-step1', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!step1Response.ok) {
            const data = await step1Response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to reset');
            throw new Error('Failed to reset everything');
        }

        let password = '';
        let code = '';

        const template = $(await renderTemplateAsync('userReset'));
        template.find('input[name="password"]').on('input', function () {
            password = String($(this).val());
        });
        template.find('input[name="code"]').on('input', function () {
            code = String($(this).val());
        });
        const confirm = await callGenericPopup(
            template,
            POPUP_TYPE.CONFIRM,
            '',
            { okButton: 'Reset', cancelButton: 'Cancel', wide: false, large: false },
        );

        if (confirm !== POPUP_RESULT.AFFIRMATIVE) {
            throw new Error('Reset everything cancelled');
        }

        const step2Response = await fetch('/api/users/reset-step2', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ password, code }),
        });

        if (!step2Response.ok) {
            const data = await step2Response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to reset');
            throw new Error('Failed to reset everything');
        }

        toastr.success('Everything reset successfully', 'Reset Everything');
        callback();
    } catch (error) {
        console.error('Error resetting everything:', error);
    }

}

async function openUserProfile() {
    await getCurrentUser();
    const template = $(await renderTemplateAsync('userProfile'));
    template.find('.userName').text(currentUser.name);
    template.find('.userHandle').text(currentUser.handle);
    template.find('.avatar img').attr('src', currentUser.avatar);
    template.find('.userRole').text(currentUser.admin ? 'Admin' : 'User');
    template.find('.userCreated').text(new Date(currentUser.created).toLocaleString());
    template.find('.hasPassword').toggle(currentUser.password);
    template.find('.noPassword').toggle(!currentUser.password);
    template.find('.userSettingsSnapshotsButton').on('click', () => viewSettingsSnapshots());
    template.find('.userChangeNameButton').on('click', async () => changeName(currentUser.handle, currentUser.name, async () => {
        await getCurrentUser();
        template.find('.userName').text(currentUser.name);
    }));
    template.find('.userChangePasswordButton').on('click', () => changePassword(currentUser.handle, async () => {
        await getCurrentUser();
        template.find('.hasPassword').toggle(currentUser.password);
        template.find('.noPassword').toggle(!currentUser.password);
    }));
    template.find('.userBackupButton').on('click', function () {
        $(this).addClass('disabled');
        backupUserData(currentUser.handle, () => {
            $(this).removeClass('disabled');
        });
    });
    template.find('.userResetSettingsButton').on('click', () => resetSettings(currentUser.handle, () => location.reload()));
    template.find('.userResetAllButton').on('click', () => resetEverything(() => location.reload()));
    template.find('.userAvatarChange').on('click', () => template.find('.avatarUpload').trigger('click'));
    template.find('.avatarUpload').on('change', async function () {
        if (!(this instanceof HTMLInputElement)) {
            return;
        }

        const file = this.files[0];
        if (!file) {
            return;
        }

        await cropAndUploadAvatar(currentUser.handle, file);
        await getCurrentUser();
        template.find('.avatar img').attr('src', currentUser.avatar);
    });
    template.find('.userAvatarRemove').on('click', async function () {
        await changeAvatar(currentUser.handle, '');
        await getCurrentUser();
        template.find('.avatar img').attr('src', currentUser.avatar);
    });

    if (!accountsEnabled) {
        template.find('[data-require-accounts]').hide();
        template.find('.accountsDisabledHint').show();
    }

    const popupOptions = {
        okButton: 'Close',
        wide: false,
        large: false,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: false,
    };
    callGenericPopup(template, POPUP_TYPE.TEXT, '', popupOptions);
}

/**
 * Crop and upload an avatar image.
 * @param {string} handle User handle
 * @param {File} file Avatar file
 * @returns {Promise<string>}
 */
async function cropAndUploadAvatar(handle, file) {
    const dataUrl = await getBase64Async(await ensureImageFormatSupported(file));
    const croppedImage = await callGenericPopup('Set the crop position of the avatar image', POPUP_TYPE.CROP, '', { cropAspect: 1, cropImage: dataUrl });
    if (!croppedImage) {
        return;
    }

    await changeAvatar(handle, String(croppedImage));

    return String(croppedImage);
}

/**
 * Change the avatar of the user.
 * @param {string} handle User handle
 * @param {string} avatar File to upload or base64 string
 * @returns {Promise<void>} Avatar URL
 */
async function changeAvatar(handle, avatar) {
    try {
        const response = await fetch('/api/users/change-avatar', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar, handle }),
        });

        if (!response.ok) {
            const data = await response.json();
            toastr.error(data.error || 'Unknown error', 'Failed to change avatar');
            return;
        }
    } catch (error) {
        console.error('Error changing avatar:', error);
    }
}

async function openAdminPanel() {
    let loadStatsData = {};

    // 获取用户负载统计数据
    async function getUserLoadStats() {
        try {
            const response = await fetch('/api/system-load/users', {
                method: 'GET',
                headers: getRequestHeaders(),
            });

            if (response.ok) {
                const data = await response.json();
                loadStatsData = {};
                data.users.forEach(userLoad => {
                    loadStatsData[userLoad.userHandle] = userLoad;
                });
                return data;
            }
        } catch (error) {
            console.error('获取用户负载统计失败:', error);
        }
        return { users: [], systemLoad: null };
    }

    async function renderUsers() {
        const users = await getUsers();
        const loadData = await getUserLoadStats();
        template.find('.usersList').empty();

        for (const user of users) {
            const userBlock = template.find('.userAccountTemplate .userAccount').clone();
            userBlock.find('.userName').text(user.name);
            userBlock.find('.userHandle').text(user.handle);
            userBlock.find('.userStatus').text(user.enabled ? 'Enabled' : 'Disabled');
            userBlock.find('.userRole').text(user.admin ? 'Admin' : 'User');
            userBlock.find('.avatar img').attr('src', user.avatar);
            userBlock.find('.hasPassword').toggle(user.password);
            userBlock.find('.noPassword').toggle(!user.password);
            userBlock.find('.userCreated').text(new Date(user.created).toLocaleString());

                                    // 添加聊天统计信息（只显示活跃用户的统计）
            const userLoadStats = loadStatsData[user.handle];
            if (userLoadStats) {
                userBlock.find('.userLoadInfo').show();
                userBlock.find('.userLastActivity').show();

                const todayMessages = userLoadStats.todayMessages || 0;
                const totalMessages = userLoadStats.totalMessages || 0;

                userBlock.find('.userTodayMessages').text(todayMessages);
                userBlock.find('.userTotalMessages').text(`(总计: ${totalMessages}楼)`);
                userBlock.find('.userLastMessageTime').text(userLoadStats.lastMessageTimeFormatted || '未知');

                // 根据今日消息数设置颜色
                const todayElement = userBlock.find('.userTodayMessages');
                todayElement.removeClass('low medium high very_high');
                if (todayMessages >= 100) {
                    todayElement.addClass('very_high').css('color', '#dc3545');
                } else if (todayMessages >= 50) {
                    todayElement.addClass('high').css('color', '#fd7e14');
                } else if (todayMessages >= 20) {
                    todayElement.addClass('medium').css('color', '#ffc107');
                } else if (todayMessages >= 5) {
                    todayElement.addClass('low').css('color', '#28a745');
                } else {
                    todayElement.css('color', '#6c757d');
                }

                // 添加在线状态指示器
                userBlock.find('.userName').before('<span class="statusIndicator online" style="margin-right: 5px;"></span>');
            } else {
                // 为非活跃用户添加离线状态指示器
                userBlock.find('.userName').before('<span class="statusIndicator offline" style="margin-right: 5px;"></span>');
            }

            userBlock.find('.userEnableButton').toggle(!user.enabled).on('click', () => enableUser(user.handle, renderUsers));
            userBlock.find('.userDisableButton').toggle(user.enabled).on('click', () => disableUser(user.handle, renderUsers));
            userBlock.find('.userPromoteButton').toggle(!user.admin).on('click', () => promoteUser(user.handle, renderUsers));
            userBlock.find('.userDemoteButton').toggle(user.admin).on('click', () => demoteUser(user.handle, renderUsers));
            userBlock.find('.userChangePasswordButton').on('click', () => changePassword(user.handle, renderUsers));
            userBlock.find('.userDelete').on('click', () => deleteUser(user.handle, renderUsers));
            userBlock.find('.userChangeNameButton').on('click', async () => changeName(user.handle, user.name, renderUsers));
            userBlock.find('.userBackupButton').on('click', function () {
                $(this).addClass('disabled').off('click');
                backupUserData(user.handle, renderUsers);
            });
            userBlock.find('.userAvatarChange').on('click', () => userBlock.find('.avatarUpload').trigger('click'));
            userBlock.find('.avatarUpload').on('change', async function () {
                if (!(this instanceof HTMLInputElement)) {
                    return;
                }

                const file = this.files[0];
                if (!file) {
                    return;
                }

                await cropAndUploadAvatar(user.handle, file);
                renderUsers();
            });
            userBlock.find('.userAvatarRemove').on('click', async function () {
                await changeAvatar(user.handle, '');
                renderUsers();
            });
            template.find('.usersList').append(userBlock);
        }
    }

        let loadRefreshInterval = null;
    let countdownInterval = null;
    let countdownSeconds = 5;

    // 渲染系统负载页面
    async function renderSystemLoad() {
        try {
            const response = await fetch('/api/system-load/overview', {
                method: 'GET',
                headers: getRequestHeaders(),
            });

            if (response.ok) {
                const data = await response.json();
                updateSystemLoadUI(data);
            }
        } catch (error) {
            console.error('获取系统负载概览失败:', error);
        }
    }

    // 更新倒计时显示
    function updateCountdown() {
        const countdownElement = template.find('.refreshCountdown');
        if (countdownElement.length > 0) {
            countdownElement.text(countdownSeconds);
            countdownSeconds--;

            if (countdownSeconds < 0) {
                countdownSeconds = 5;
            }
        }
    }

    // 启动自动刷新
    function startAutoRefresh() {
        if (loadRefreshInterval) {
            clearInterval(loadRefreshInterval);
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }

        countdownSeconds = 5;

        // 启动数据刷新定时器
        loadRefreshInterval = setInterval(() => {
            renderSystemLoad();
            countdownSeconds = 5; // 重置倒计时
        }, 5000);

        // 启动倒计时定时器
        countdownInterval = setInterval(() => {
            updateCountdown();
        }, 1000);

        // 立即更新倒计时显示
        updateCountdown();
    }

    // 停止自动刷新
    function stopAutoRefresh() {
        if (loadRefreshInterval) {
            clearInterval(loadRefreshInterval);
            loadRefreshInterval = null;
        }
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    // 更新系统负载UI
    function updateSystemLoadUI(data) {
        const { system, users } = data;

        // 更新系统负载指标
        if (system && system.current) {
            const cpuPercent = Math.round(system.current.cpu.percent || 0);
            const cpuRaw = Math.round(system.current.cpu.raw || 0);
            const memoryPercent = Math.round(system.current.memory.percent || 0);

            template.find('.cpuLoadBar').css('width', `${cpuPercent}%`);
            template.find('.cpuLoadText').text(`${cpuPercent}%`);

            // 详细 CPU 信息的调试输出已移除
            template.find('.memoryLoadBar').css('width', `${memoryPercent}%`);
            template.find('.memoryLoadText').text(`${memoryPercent}%`);
            template.find('.systemUptimeText').text(system.current.uptime.systemFormatted || '未知');
        }

        // 更新用户统计信息
        template.find('.activeUsersCount').text(users.active || 0);
        template.find('.totalMessagesCount').text(users.totalMessages || 0);
        template.find('.todayMessagesCount').text(users.totalTodayMessages || 0);


        // 更新用户负载表格
        const tableBody = template.find('.userLoadTableBody');
        tableBody.empty();

                // 显示活跃用户（topLoad已经只包含活跃用户）
        const activeUsers = users.topLoad || [];

        if (activeUsers.length > 0) {
            activeUsers.forEach(userLoad => {
                const activityLevel = getActivityLevelText(userLoad.chatActivityLevel);
                const row = $(`
                    <div class="userLoadTableRow flex-container">
                        <div class="userLoadTableCell" style="flex: 1.5;">
                            <span class="statusIndicator online"></span>
                            <strong>${userLoad.userHandle}</strong>
                        </div>
                        <div class="userLoadTableCell" style="flex: 1.2;">
                            <span class="activityLevel ${userLoad.chatActivityLevel}">
                                ${activityLevel}
                            </span>
                        </div>
                        <div class="userLoadTableCell" style="flex: 1;">
                            ${userLoad.todayMessages || 0}楼
                        </div>
                        <div class="userLoadTableCell" style="flex: 1.2;">
                            ${userLoad.totalMessages || 0}楼
                        </div>

                        <div class="userLoadTableCell" style="flex: 2;">
                            ${userLoad.lastMessageTimeFormatted || '未知'}
                        </div>
                        <div class="userLoadTableCell" style="flex: 0.8;">
                            <button type="button" class="menu_button resetUserLoadButton" data-user="${userLoad.userHandle}">
                                <i class="fa-fw fa-solid fa-refresh"></i>
                            </button>
                        </div>
                    </div>
                `);
                tableBody.append(row);
            });
        } else {
            tableBody.append('<div class="userLoadTableRow"><div class="userLoadTableCell" style="flex: 1; text-align: center; color: #b0b0b0;">当前无活跃用户</div></div>');
        }

        // 绑定重置按钮事件
        template.find('.resetUserLoadButton').on('click', async function() {
            const userHandle = $(this).data('user');
            await resetUserLoadStats(userHandle);
            renderSystemLoad();
        });
    }

    // 获取活跃度等级文本
    function getActivityLevelText(level) {
        switch (level) {
            case 'very_high': return '非常活跃';
            case 'high': return '高度活跃';
            case 'medium': return '中等活跃';
            case 'low': return '轻度活跃';
            case 'minimal': return '最低活跃';
            default: return '未知';
        }
    }

    // 格式化字节数
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 重置用户负载统计
    async function resetUserLoadStats(userHandle) {
        try {
            const response = await fetch(`/api/system-load/user/${userHandle}/reset`, {
                method: 'POST',
                headers: getRequestHeaders(),
            });

            if (response.ok) {
                toastr.success(`用户 ${userHandle} 的负载统计已重置`);
            } else {
                toastr.error('重置用户负载统计失败');
            }
        } catch (error) {
            console.error('重置用户负载统计失败:', error);
            toastr.error('重置用户负载统计失败');
        }
    }

    // 清除所有负载统计
    async function clearAllLoadStats() {
        try {
            const response = await fetch('/api/system-load/clear', {
                method: 'POST',
                headers: getRequestHeaders(),
            });

            if (response.ok) {
                toastr.success('所有负载统计数据已清理');
                renderSystemLoad();
            } else {
                toastr.error('清理负载统计数据失败');
            }
        } catch (error) {
            console.error('清理负载统计数据失败:', error);
            toastr.error('清理负载统计数据失败');
        }
    }

    const template = $(await renderTemplateAsync('admin'));

        template.find('.adminNav > button').on('click', function () {
        const target = String($(this).data('target-tab'));
        template.find('.navTab').each(function () {
            $(this).toggle(this.classList.contains(target));
        });

        // 如果切换到系统负载页面，加载数据并启动自动刷新
        if (target === 'systemLoadTab') {
            renderSystemLoad();
            startAutoRefresh();
        } else if (target === 'invitationCodesTab') {
            // 进入邀请码管理页时刷新状态与列表
            updateInvitationCodesStatus();
            renderInvitationCodesList();
            stopAutoRefresh();
        } else {
            // 离开系统负载页面时停止自动刷新
            stopAutoRefresh();
        }
    });

    // 显式绑定邀请码管理按钮：使用独立弹窗展示，避免某些环境下标签区域不渲染的问题
    template.find('.invitationCodesButton').on('click', function () {
        openInvitationCodesManager();
        stopAutoRefresh();
    });

    template.find('.createUserDisplayName').on('input', async function () {
        const slug = await slugify(String($(this).val()));
        template.find('.createUserHandle').val(slug);
    });

    template.find('.userCreateForm').on('submit', function (event) {
        if (!(event.target instanceof HTMLFormElement)) {
            return;
        }

        event.preventDefault();
        createUser(event.target, () => {
            template.find('.manageUsersButton').trigger('click');
            renderUsers();
        });
    });

    // 绑定系统负载页面的事件处理程序
    template.find('.refreshLoadButton').on('click', function() {
        renderSystemLoad();
    });

    template.find('.clearLoadStatsButton').on('click', async function() {
        if (confirm('确定要清除所有负载统计数据吗？此操作不可撤销。')) {
            await clearAllLoadStats();
        }
    });

    // ===== 邀请码管理：状态、生成、列表、操作 =====
    async function updateInvitationCodesStatus() {
        try {
            const response = await fetch('/api/invitation-codes/enabled', { headers: getRequestHeaders() });
            const data = await response.json();
            const enabled = Boolean(data?.enabled);
            const el = template.find('.invitationCodesEnabled');
            el.text(enabled ? '已启用' : '已禁用');
            el.css('color', enabled ? '#4CAF50' : '#f44336');
        } catch (error) {
            console.error('获取邀请码状态失败:', error);
        }
    }

    async function generateSingleInvitationCode() {
        const hoursStr = String(template.find('#invitationCodeExpireHours').val() || '').trim();
        const expiresInHours = hoursStr ? Number(hoursStr) : null;
        try {
            const response = await fetch('/api/invitation-codes/create', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ expiresInHours }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || '生成邀请码失败');
            }
            const data = await response.json();
            const code = data.code;
            template.find('#generatedCodeText').text(code);
            template.find('#singleCodeDisplay').show();
            template.find('#batchCodesDisplay').hide();
            template.find('#generatedCodeDisplay').show();
        } catch (error) {
            toastr.error(error.message || '生成邀请码失败');
        }
    }

    async function generateBatchInvitationCodes() {
        const count = Number(String(template.find('#batchCount').val() || '5'));
        const expiresInHours = Number(String(template.find('#batchExpireHours').val() || '24'));
        try {
            const response = await fetch('/api/invitation-codes/create-batch', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ count, expiresInHours }),
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error || '批量生成失败');
            }
            const data = await response.json();
            const codes = (data.codes || []).map(c => c.code);
            const list = template.find('#batchCodesList');
            list.empty();
            codes.forEach(code => {
                list.append(`<div style="font-family: monospace; color: #4CAF50; margin: 2px 0;">${code}</div>`);
            });
            template.find('#singleCodeDisplay').hide();
            template.find('#batchCodesDisplay').show();
            template.find('#generatedCodeDisplay').show();
        } catch (error) {
            toastr.error(error.message || '批量生成失败');
        }
    }

    async function renderInvitationCodesList() {
        try {
            const body = template.find('.invitationCodesTableBody');
            body.html('<div style="display:flex;justify-content:center;align-items:center;padding:20px;color:#888;">加载中...</div>');
            const response = await fetch('/api/invitation-codes/list', { headers: getRequestHeaders() });
            if (!response.ok) throw new Error('获取邀请码列表失败');
            const items = await response.json();
            if (!Array.isArray(items)) throw new Error('返回数据格式错误');
            body.empty();
            if (items.length === 0) {
                body.html('<div style="display:flex;justify-content:center;align-items:center;padding:20px;color:#888;">暂无数据</div>');
                return;
            }
            for (const it of items) {
                const createdText = it.createdAt ? new Date(it.createdAt).toLocaleString() : '-';
                const statusText = it.used ? '已使用' : (it.expired ? '已过期' : '未使用');
                const row = $(`
                    <div class="invitationCodesTableRow" style="display:flex; padding:10px; border-bottom:1px solid #333; align-items:center;">
                        <div style="flex:2; font-family: monospace;">${it.code}</div>
                        <div style="flex:1;">${it.createdBy || '-'}</div>
                        <div style="flex:1;">${createdText}</div>
                        <div style="flex:1;">${statusText}</div>
                        <div style="flex:1;">
                            <button type="button" class="menu_button deleteInvitationBtn" data-code="${it.code}">删除</button>
                        </div>
                    </div>
                `);
                body.append(row);
            }
            // 绑定删除按钮
            body.find('.deleteInvitationBtn').on('click', async function() {
                const code = String($(this).data('code'));
                if (!code) return;
                if (!confirm(`确定删除邀请码 ${code} 吗？`)) return;
                try {
                    const res = await fetch(`/api/invitation-codes/${encodeURIComponent(code)}`, { method: 'DELETE', headers: getRequestHeaders() });
                    if (!res.ok) throw new Error('删除失败');
                    toastr.success('删除成功');
                    await renderInvitationCodesList();
                } catch (e) {
                    toastr.error(e.message || '删除失败');
                }
            });
        } catch (error) {
            console.error(error);
            toastr.error(error.message || '获取邀请码列表失败');
        }
    }

    // 复制按钮
    template.find('#copyCodeBtn').on('click', async function() {
        const code = String(template.find('#generatedCodeText').text() || '');
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            toastr.success('已复制到剪贴板');
        } catch {
            toastr.error('复制失败');
        }
    });

    // 复制全部
    template.find('#copyAllCodesBtn').on('click', async function() {
        const all = template.find('#batchCodesList').text().trim();
        if (!all) return;
        try {
            await navigator.clipboard.writeText(all);
            toastr.success('已复制全部邀请码');
        } catch {
            toastr.error('复制失败');
        }
    });

    // 下载批量邀请码
    template.find('#downloadCodesBtn').on('click', function() {
        const codes = template.find('#batchCodesList').text().trim();
        if (!codes) return;
        const blob = new Blob([codes.replace(/\n+/g, '\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invitation-codes-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    // 事件绑定：生成与刷新
    template.find('#generateInvitationCodeBtn').on('click', () => generateSingleInvitationCode());
    template.find('#generateBatchCodesBtn').on('click', () => generateBatchInvitationCodes());
    template.find('#refreshInvitationCodesBtn').on('click', () => renderInvitationCodesList());
    template.find('#cleanupExpiredCodesBtn').on('click', async function() {
        if (!confirm('确定清理所有已过期的邀请码吗？')) return;
        try {
            const res = await fetch('/api/invitation-codes/cleanup', { method: 'POST', headers: getRequestHeaders() });
            if (!res.ok) throw new Error('清理失败');
            toastr.success('清理成功');
            await renderInvitationCodesList();
        } catch (e) {
            toastr.error(e.message || '清理失败');
        }
    });

    callGenericPopup(template, POPUP_TYPE.TEXT, '', {
        okButton: 'Close',
        wide: true,
        large: true,
        allowVerticalScrolling: true,
        allowHorizontalScrolling: true,
        onClose: function() {
            // 弹窗关闭时停止自动刷新
            stopAutoRefresh();
        }
    });
    renderUsers();
}

// 独立弹窗版：邀请码管理
async function openInvitationCodesManager() {
    const modal = $(`
        <div class="flex-container flexFlowColumn" style="gap:12px; min-width: 680px;">
            <div class="flex-container alignItemsCenter" style="gap:10px;">
                <h3 style="margin:0;">邀请码管理</h3>
                <span class="invitationCodesEnabled" style="margin-left:8px; color:#4CAF50;">...</span>
            </div>
            <div class="flex-container alignItemsCenter" style="gap:8px; display:flex; flex-direction:row; align-items:center;">
                <label>过期时间(小时):</label>
                <input type="number" class="ic_expire_single" min="1" max="8760" value="24" style="width: 90px; color:#000; background:#fff;">
                <button type="button" class="menu_button ic_generate_single" style="display:inline-flex; align-items:center; justify-content:center; width:auto; white-space:nowrap; padding:6px 10px;">生成</button>
                <div style="margin-left: 12px; font-family: monospace;"><span id="ic_single_code"></span></div>
            </div>
            <div class="flex-container alignItemsCenter" style="gap:8px; display:flex; flex-direction:row; align-items:center;">
                <label>批量数量:</label>
                <input type="number" class="ic_batch_count" min="1" max="100" value="5" style="width: 90px; color:#000; background:#fff;">
                <label>过期(小时):</label>
                <input type="number" class="ic_expire_batch" min="1" max="8760" value="24" style="width: 90px; color:#000; background:#fff;">
                <button type="button" class="menu_button ic_generate_batch" style="display:inline-flex; align-items:center; justify-content:center; width:auto; white-space:nowrap; padding:6px 10px;">批量生成</button>
                <button type="button" class="menu_button ic_copy_all" style="display:inline-flex; align-items:center; justify-content:center; width:auto; white-space:nowrap; padding:6px 10px;">复制全部</button>
                <button type="button" class="menu_button ic_download" style="display:inline-flex; align-items:center; justify-content:center; width:auto; white-space:nowrap; padding:6px 10px;">下载</button>
            </div>
            <div style="border:1px solid #555; border-radius:4px; overflow:hidden;">
                <div style="background:#1e1e1e; padding:8px; font-weight:bold; display:flex;">
                    <div style="flex:2;">邀请码</div>
                    <div style="flex:1;">创建者</div>
                    <div style="flex:1;">创建时间</div>
                    <div style="flex:1;">状态</div>
                    <div style="flex:1;">使用者</div>
                    <div style="flex:1;">操作</div>
                </div>
                <div class="ic_table_body" style="min-height:160px;"></div>
            </div>
            <div class="flex-container" style="gap:8px; display:flex; flex-direction:row; align-items:center;">
                <button type="button" class="menu_button ic_refresh" style="display:inline-flex; align-items:center; justify-content:center; padding:6px 12px; width:auto; white-space:nowrap; writing-mode:horizontal-tb;">刷新</button>
                <button type="button" class="menu_button warning ic_cleanup" style="display:inline-flex; align-items:center; justify-content:center; padding:6px 12px; width:auto; white-space:nowrap; writing-mode:horizontal-tb;">清理过期</button>
            </div>
        </div>
    `);

    callGenericPopup(modal, POPUP_TYPE.TEXT, '', { okButton: '关闭', wide: true, large: true, allowVerticalScrolling: true });

    async function refreshEnabled() {
        try {
            const res = await fetch('/api/invitation-codes/enabled', { headers: getRequestHeaders() });
            const data = await res.json();
            const enabled = Boolean(data?.enabled);
            const label = modal.find('.invitationCodesEnabled');
            label.text(enabled ? '已启用' : '已禁用').css('color', enabled ? '#4CAF50' : '#f44336');
        } catch {}
    }

    async function refreshList() {
        const body = modal.find('.ic_table_body');
        body.html('<div style="padding:16px; color:#888; text-align:center;">加载中...</div>');
        try {
            const res = await fetch('/api/invitation-codes/list', { headers: getRequestHeaders() });
            if (!res.ok) throw new Error('列表获取失败');
            const items = await res.json();
            body.empty();
            if (!Array.isArray(items) || items.length === 0) {
                body.html('<div style="padding:16px; color:#888; text-align:center;">暂无数据</div>');
                return;
            }
            for (const it of items) {
                const createdText = it.createdAt ? new Date(it.createdAt).toLocaleString() : '-';
                const statusText = it.used ? '已使用' : (it.expired ? '已过期' : '未使用');
                const row = $(`
                    <div style="display:flex; padding:10px; border-top:1px solid #333; align-items:center;">
                        <div style="flex:2; font-family: monospace;">${it.code}</div>
                        <div style="flex:1;">${it.createdBy || '-'}</div>
                        <div style="flex:1;">${createdText}</div>
                        <div style="flex:1;">${statusText}</div>
                        <div style="flex:1;">${it.usedBy || '-'}</div>
                        <div style="flex:1;">
                            <button type="button" class="menu_button ic_delete" data-code="${it.code}">删除</button>
                        </div>
                    </div>
                `);
                body.append(row);
            }
            body.find('.ic_delete').on('click', async function() {
                const code = String($(this).data('code'));
                if (!confirm(`确定删除邀请码 ${code} 吗？`)) return;
                const del = await fetch(`/api/invitation-codes/${encodeURIComponent(code)}`, { method: 'DELETE', headers: getRequestHeaders() });
                if (!del.ok) return toastr.error('删除失败');
                toastr.success('删除成功');
                refreshList();
            });
        } catch (e) {
            body.html('<div style="padding:16px; color:#f44336; text-align:center;">加载失败</div>');
        }
    }

    modal.find('.ic_generate_single').on('click', async function () {
        const hours = Number(String(modal.find('.ic_expire_single').val() || '')) || null;
        try {
            const res = await fetch('/api/invitation-codes/create', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ expiresInHours: hours }) });
            if (!res.ok) throw 0;
            const data = await res.json();
            modal.find('#ic_single_code').text(data.code || '');
            refreshList();
        } catch { toastr.error('生成失败'); }
    });

    modal.find('.ic_generate_batch').on('click', async function () {
        const count = Number(String(modal.find('.ic_batch_count').val() || '5'));
        const hours = Number(String(modal.find('.ic_expire_batch').val() || '24'));
        try {
            const res = await fetch('/api/invitation-codes/create-batch', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ count, expiresInHours: hours }) });
            if (!res.ok) throw 0;
            const data = await res.json();
            const all = (data.codes || []).map(c => c.code).join('\n');
            await navigator.clipboard.writeText(all);
            toastr.success('批量邀请码已复制');
            refreshList();
        } catch { toastr.error('批量生成失败'); }
    });

    modal.find('.ic_copy_all').on('click', async function () {
        const codes = modal.find('.ic_table_body').text().trim();
        if (!codes) return;
        try { await navigator.clipboard.writeText(codes); toastr.success('已复制'); } catch { toastr.error('复制失败'); }
    });
    modal.find('.ic_download').on('click', function () {
        const codes = modal.find('.ic_table_body').text().trim();
        if (!codes) return;
        const blob = new Blob([codes.replace(/\n+/g, '\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `invitation-codes-${Date.now()}.txt`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    });
    modal.find('.ic_refresh').on('click', () => refreshList());
    modal.find('.ic_cleanup').on('click', async function () {
        if (!confirm('确定清理所有已过期的邀请码吗？')) return;
        try {
            const res = await fetch('/api/invitation-codes/cleanup', { method: 'POST', headers: getRequestHeaders() });
            if (!res.ok) throw 0; toastr.success('清理成功'); refreshList();
        } catch { toastr.error('清理失败'); }
    });

    refreshEnabled();
    refreshList();
}

/**
 * Log out the current user.
 * @returns {Promise<void>}
 */
async function logout() {
    await fetch('/api/users/logout', {
        method: 'POST',
        headers: getRequestHeaders(),
    });

    // On an explicit logout stop auto login
    // to allow user to change username even
    // when auto auth (such as authelia or basic)
    // would be valid
    const urlParams = new URLSearchParams(window.location.search);
    urlParams.set('noauto', 'true');

    window.location.search = urlParams.toString();
}

/**
 * Runs a text through the slugify API endpoint.
 * @param {string} text Text to slugify
 * @returns {Promise<string>} Slugified text
 */
async function slugify(text) {
    try {
        const response = await fetch('/api/users/slugify', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            throw new Error('Failed to slugify text');
        }

        return response.text();
    } catch (error) {
        console.error('Error slugifying text:', error);
        return text;
    }
}

/**
 * Pings the server to extend the user session.
 */
async function extendUserSession() {
    try {
        const response = await fetch('/api/ping?extend=1', {
            method: 'POST',
            headers: getRequestHeaders(),
        });

        if (!response.ok) {
            throw new Error('Ping did not succeed', { cause: response.status });
        }
    } catch (error) {
        console.error('Failed to extend user session', error);
    }
}

jQuery(() => {
    $('#logout_button').on('click', () => {
        logout();
    });
    $('#admin_button').on('click', () => {
        openAdminPanel();
    });
    $('#account_button').on('click', () => {
        openUserProfile();
    });
    setInterval(async () => {
        if (currentUser) {
            await extendUserSession();
        }
    }, SESSION_EXTEND_INTERVAL);
});
