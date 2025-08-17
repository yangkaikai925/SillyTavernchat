// 公用角色卡页面JavaScript

let characters = [];
let filteredCharacters = [];
let currentPage = 0;
const itemsPerPage = 12;
let isLoading = false;
let isLoggedIn = false;
let currentUser = null;

// CSRF令牌获取函数（已不再需要）
async function getCsrfToken() {
    return null; // 不再需要CSRF令牌
}

// 检查用户登录状态
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/users/me', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (response.ok) {
            const userData = await response.json();
            isLoggedIn = true;
            currentUser = userData;
            console.log('User logged in:', userData);
            return true;
        } else {
            isLoggedIn = false;
            currentUser = null;
            console.log('User not logged in, status:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Failed to check login status:', error);
        isLoggedIn = false;
        currentUser = null;
        return false;
    }
}

// 根据登录状态更新界面
function updateUIForLoginStatus() {
    if (isLoggedIn) {
        // 登录用户：显示上传按钮和用户信息
        $('#uploadButton').show();
        $('#userInfo').show();
        $('#loginPrompt').hide();

        // 更新用户信息
        if (currentUser) {
            $('#userName').text(currentUser.name || currentUser.handle);
        }
    } else {
        // 游客：隐藏上传按钮，显示登录提示
        $('#uploadButton').hide();
        $('#userInfo').hide();
        $('#loginPrompt').show();
    }
}

// 获取请求头
function getRequestHeaders(additionalHeaders = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...additionalHeaders
    };

    return headers;
}

// 显示加载指示器
function showLoading() {
    isLoading = true;
    $('#loadingIndicator').show();
}

// 隐藏加载指示器
function hideLoading() {
    isLoading = false;
    $('#loadingIndicator').hide();
}

// 显示错误消息
function showError(message) {
    // 这里可以使用toastr或其他通知库
    alert(message);
}

// 显示成功消息
function showSuccess(message) {
    // 这里可以使用toastr或其他通知库
    alert(message);
}

// 格式化日期
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 加载角色卡列表
async function loadCharacters() {
    try {
        showLoading();

        const response = await fetch('/api/public-characters/all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        characters = data;
        filteredCharacters = [...characters];

        renderCharacters();
    } catch (error) {
        console.error('Failed to load characters:', error);
        showError('加载角色卡失败');
    } finally {
        hideLoading();
    }
}

// 渲染角色卡
function renderCharacters() {
    const grid = $('#charactersGrid');
    grid.empty();

    const startIndex = currentPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageCharacters = filteredCharacters.slice(startIndex, endIndex);

    if (pageCharacters.length === 0) {
        grid.html(`
            <div class="no-characters">
                <i class="fa-solid fa-search" style="font-size: 3rem; color: rgba(255,255,255,0.5); margin-bottom: 1rem;"></i>
                <h3>暂无角色卡</h3>
                <p>还没有用户上传角色卡，快来上传第一个吧！</p>
            </div>
        `);
        return;
    }

    pageCharacters.forEach(character => {
        const card = createCharacterCard(character);
        grid.append(card);
    });

    // 显示/隐藏加载更多按钮
    if (endIndex < filteredCharacters.length) {
        $('#loadMoreButton').show();
    } else {
        $('#loadMoreButton').hide();
    }
}

// 创建角色卡元素
function createCharacterCard(character) {
    // 根据文件类型确定头像URL
    let avatarUrl;
    if (character.avatar.endsWith('.png')) {
        // 对中文字符进行URL编码
        const encodedAvatar = encodeURIComponent(character.avatar);
        avatarUrl = `/api/public-characters/avatar/${encodedAvatar}`;
    } else {
        // 对于JSON/YAML文件，使用默认头像
        avatarUrl = '/img/default-expressions/neutral.png';
    }

    const tags = character.tags || [];
    const tagsHtml = tags.map(tag => `<span class="character-tag">${tag}</span>`).join('');

    // 检查当前用户是否有删除权限
    const canDelete = isLoggedIn && (
        currentUser?.admin ||
        character.uploader_handle === currentUser?.handle
    );

    // 根据登录状态显示不同的按钮
    const importButton = isLoggedIn ?
        `<button class="btn btn-primary import-btn" onclick="importCharacter('${character.avatar.replace('.png', '').replace('.json', '').replace('.yaml', '')}')">
            <i class="fa-solid fa-download"></i>
            导入
        </button>` :
        `<button class="btn btn-secondary import-btn" onclick="showLoginPrompt()" disabled>
            <i class="fa-solid fa-lock"></i>
            登录后导入
        </button>`;

    // 删除按钮（仅对有权限的用户显示）
    const deleteButton = canDelete ?
        `<button class="btn btn-danger delete-btn" onclick="deleteCharacter('${character.avatar.replace('.png', '').replace('.json', '').replace('.yaml', '')}', '${character.name}')">
            <i class="fa-solid fa-trash"></i>
            删除
        </button>` : '';

    return `
        <div class="character-card" data-character="${character.avatar.replace('.png', '').replace('.json', '').replace('.yaml', '')}">
            <div class="character-avatar">
                <img src="${avatarUrl}" alt="${character.name}" onerror="this.src='/img/default-expressions/neutral.png'">
            </div>
            <div class="character-info">
                <h3 class="character-name">${character.name}</h3>
                <p class="character-description">${character.description || '暂无描述'}</p>
                <div class="character-meta">
                    <span class="character-uploader">
                        <i class="fa-solid fa-user"></i>
                        ${character.uploader || 'Unknown'}
                    </span>
                    <span class="character-date">
                        <i class="fa-solid fa-calendar"></i>
                        ${formatDate(character.date_added)}
                    </span>
                </div>
                ${tagsHtml ? `<div class="character-tags">${tagsHtml}</div>` : ''}
            </div>
            <div class="character-actions">
                ${importButton}
                <button class="btn btn-secondary view-btn" onclick="viewCharacter('${character.avatar.replace('.png', '').replace('.json', '').replace('.yaml', '')}')">
                    <i class="fa-solid fa-eye"></i>
                    查看
                </button>
                ${deleteButton}
            </div>
        </div>
    `;
}

// 搜索和筛选角色卡
function filterCharacters() {
    const searchTerm = $('#searchInput').val().toLowerCase();
    const sortBy = $('#sortSelect').val();

    filteredCharacters = characters.filter(character => {
        const nameMatch = character.name.toLowerCase().includes(searchTerm);
        const descriptionMatch = (character.description || '').toLowerCase().includes(searchTerm);
        const uploaderMatch = (character.uploader || '').toLowerCase().includes(searchTerm);
        const tagsMatch = (character.tags || []).some(tag => tag.toLowerCase().includes(searchTerm));

        return nameMatch || descriptionMatch || uploaderMatch || tagsMatch;
    });

    // 排序
    filteredCharacters.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'uploader':
                return (a.uploader || '').localeCompare(b.uploader || '');
            case 'date':
            default:
                return b.date_added - a.date_added;
        }
    });

    currentPage = 0;
    renderCharacters();
}

// 导入角色卡
async function importCharacter(characterName) {
    if (!isLoggedIn) {
        showError('请先登录后再导入角色卡');
        return;
    }

    try {
        const response = await fetch('/api/public-characters/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                character_name: characterName
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '导入失败');
        }

        const data = await response.json();
        showSuccess(`角色卡 "${characterName}" 已成功导入到您的角色库！`);

        // 可以选择跳转到角色库页面
        // window.location.href = '/';

    } catch (error) {
        console.error('Failed to import character:', error);
        showError(`导入失败: ${error.message}`);
    }
}

// 删除角色卡
async function deleteCharacter(characterName, characterDisplayName) {
    if (!isLoggedIn) {
        showError('请先登录后再删除角色卡');
        return;
    }

    // 确认删除
    if (!confirm(`确定要删除角色卡 "${characterDisplayName}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        const response = await fetch('/api/public-characters/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                character_name: characterName
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '删除失败');
        }

        const result = await response.json();
        showSuccess(`角色卡 "${characterDisplayName}" 删除成功！`);

        // 刷新角色卡列表
        await loadCharacters();
    } catch (error) {
        console.error('Failed to delete character:', error);
        showError(`删除失败: ${error.message}`);
    }
}

// 查看角色卡详情
async function viewCharacter(characterName) {
    try {
        const response = await fetch('/api/public-characters/get', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                character_name: characterName
            })
        });

        if (!response.ok) {
            throw new Error('获取角色卡详情失败');
        }

        const character = await response.json();
        showCharacterModal(character);

    } catch (error) {
        console.error('Failed to get character details:', error);
        showError('获取角色卡详情失败');
    }
}

// 显示登录提示
function showLoginPrompt() {
    showError('请先登录后再导入角色卡');
}

// 显示角色卡详情模态框
function showCharacterModal(character) {
    // 根据文件类型确定头像URL
    let avatarUrl;
    if (character.avatar.endsWith('.png')) {
        // 对中文字符进行URL编码
        const encodedAvatar = encodeURIComponent(character.avatar);
        avatarUrl = `/api/public-characters/avatar/${encodedAvatar}`;
    } else {
        // 对于JSON/YAML文件，使用默认头像
        avatarUrl = '/img/default-expressions/neutral.png';
    }

    const tags = character.tags || [];
    const tagsHtml = tags.map(tag => `<span class="character-tag">${tag}</span>`).join('');

    $('#characterModalTitle').text(character.name);
    $('#characterModalAvatar').attr('src', avatarUrl);
    $('#characterModalName').text(character.name);
    $('#characterModalDescription').text(character.description || '暂无描述');
    $('#characterModalUploader').text(character.uploader || 'Unknown');
    $('#characterModalDate').text(formatDate(character.date_added));
    $('#characterModalTags').html(tagsHtml);

    // 根据登录状态设置导入按钮
    if (isLoggedIn) {
        $('#importCharacterButton').off('click').on('click', () => {
            importCharacter(character.avatar.replace('.png', '').replace('.json', '').replace('.yaml', ''));
            $('#characterModal').hide();
        });
        $('#importCharacterButton').prop('disabled', false).html('<i class="fa-solid fa-download"></i> 导入到我的角色库');
    } else {
        $('#importCharacterButton').off('click').on('click', () => {
            showLoginPrompt();
            $('#characterModal').hide();
        });
        $('#importCharacterButton').prop('disabled', true).html('<i class="fa-solid fa-lock"></i> 登录后导入');
    }

    // 设置查看按钮事件
    $('#viewCharacterButton').off('click').on('click', () => {
        // 这里可以跳转到角色卡详情页面或显示更多信息
        $('#characterModal').hide();
    });

    $('#characterModal').show();
}

// 上传角色卡
async function uploadCharacter(formData) {
    try {
        const response = await fetch('/api/public-characters/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '上传失败');
        }

        const data = await response.json();
        showSuccess(`角色卡 "${data.file_name}" 上传成功！`);

        // 重新加载角色卡列表
        await loadCharacters();

        // 关闭上传模态框
        $('#uploadModal').hide();
        $('#uploadForm')[0].reset();

    } catch (error) {
        console.error('Failed to upload character:', error);
        showError(`上传失败: ${error.message}`);
    }
}

// 加载更多角色卡
function loadMore() {
    currentPage++;
    renderCharacters();
}

// 事件监听器
$(document).ready(async function() {
    try {
        // 检查登录状态
        await checkLoginStatus();

        // 根据登录状态更新界面
        updateUIForLoginStatus();

        // 加载角色卡列表
        await loadCharacters();

        // 搜索输入事件
        $('#searchInput').on('input', filterCharacters);

        // 排序选择事件
        $('#sortSelect').on('change', filterCharacters);

        // 加载更多按钮
        $('#loadMoreButton').on('click', loadMore);

        // 上传按钮（只有登录用户才能看到）
        $('#uploadButton').on('click', () => {
            if (!isLoggedIn) {
                showError('请先登录后再上传角色卡');
                return;
            }
            $('#uploadModal').show();
        });

        // 关闭上传模态框
        $('#closeUploadModal, #cancelUpload').on('click', () => {
            $('#uploadModal').hide();
            $('#uploadForm')[0].reset();
        });

        // 关闭角色卡详情模态框
        $('#closeCharacterModal').on('click', () => {
            $('#characterModal').hide();
        });

        // 点击模态框外部关闭
        $('.modal').on('click', function(e) {
            if (e.target === this) {
                $(this).hide();
            }
        });

        // 上传表单提交
        $('#uploadForm').on('submit', async function(e) {
            e.preventDefault();

            if (!isLoggedIn) {
                showError('请先登录后再上传角色卡');
                return;
            }

            const fileInput = $('#characterFile')[0];
            const nameInput = $('#characterName').val();
            const descriptionInput = $('#characterDescription').val();
            const tagsInput = $('#characterTags').val();

            if (!fileInput.files[0]) {
                showError('请选择角色卡文件');
                return;
            }

            if (!nameInput.trim()) {
                showError('请输入角色名称');
                return;
            }

            const formData = new FormData();
            formData.append('avatar', fileInput.files[0]);

            // 获取文件扩展名
            const fileName = fileInput.files[0].name;
            const extension = fileName.split('.').pop().toLowerCase();
            formData.append('file_type', extension);

            // 添加其他信息
            if (nameInput.trim()) {
                formData.append('name', nameInput.trim());
            }
            if (descriptionInput.trim()) {
                formData.append('description', descriptionInput.trim());
            }
            if (tagsInput.trim()) {
                const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
                formData.append('tags', JSON.stringify(tags));
            }

            await uploadCharacter(formData);
        });

        // 文件选择时自动填充名称
        $('#characterFile').on('change', function() {
            const file = this.files[0];
            if (file) {
                const fileName = file.name;
                const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
                $('#characterName').val(nameWithoutExt);
            }
        });

    } catch (error) {
        console.error('Failed to initialize page:', error);
        showError('页面初始化失败，请刷新页面重试');
    }
});

// 添加一些样式到页面
$('<style>').text(`
    .no-characters {
        grid-column: 1 / -1;
        text-align: center;
        padding: 3rem;
        color: rgba(255,255,255,0.7);
    }

    .no-characters h3 {
        margin: 1rem 0 0.5rem 0;
        color: #ffffff;
    }

    .no-characters p {
        margin: 0;
        font-size: 1rem;
    }
`).appendTo('head');
