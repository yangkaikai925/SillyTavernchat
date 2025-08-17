// 格式化日期函数（如果不存在）
if (!window.formatDate) {
    window.formatDate = function(dateString) {
        if (!dateString) return '未知时间';

        // 处理 humanizedISO8601DateTime 格式: "2024-1-15 @14h 30m 45s 123ms"
        if (dateString.includes(' @')) {
            const match = dateString.match(/(\d{4})-(\d{1,2})-(\d{1,2}) @(\d{1,2})h (\d{1,2})m (\d{1,2})s/);
            if (match) {
                const [, year, month, day, hour, minute, second] = match;
                const date = new Date(
                    parseInt(year),
                    parseInt(month) - 1, // 月份从0开始
                    parseInt(day),
                    parseInt(hour),
                    parseInt(minute),
                    parseInt(second)
                );
                return date.toLocaleDateString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            }
        }

        // 尝试标准日期格式
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        return '未知时间';
    };
}

// 富文本编辑器功能
class RichEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.toolbar = document.querySelector('.rich-editor-toolbar');
        this.content = this.container;
        this.imageUpload = document.getElementById('imageUpload');

        if (!this.container || !this.toolbar) {
            console.error('Rich editor elements not found');
            return;
        }

        this.init();
    }

    init() {
        this.setupToolbar();
        this.setupImageUpload();
        this.setupDragAndDrop();
        this.setupKeyboardShortcuts();
        this.setupContentEvents();
    }

    // 设置工具栏
    setupToolbar() {
        this.toolbar.addEventListener('click', (e) => {
            const button = e.target && typeof e.target.closest === 'function' ?
                          e.target.closest('.toolbar-btn') : null;
            if (!button) return;

            e.preventDefault();
            const command = button.dataset.command;
            const value = button.dataset.value;

            if (command) {
                this.executeCommand(command, value);
            }
        });

        // 特殊处理图片上传按钮
        const imageBtn = document.getElementById('insertImageBtn');
        if (imageBtn) {
            imageBtn.addEventListener('click', () => {
                this.imageUpload.click();
            });
        }

        // 特殊处理链接按钮
        const linkBtn = this.toolbar.querySelector('[data-command="createLink"]');
        if (linkBtn) {
            linkBtn.addEventListener('click', () => {
                this.showLinkDialog();
            });
        }
    }

    // 执行编辑器命令
    executeCommand(command, value = null) {
        this.content.focus();

        switch (command) {
            case 'createLink':
                this.showLinkDialog();
                break;
            case 'formatBlock':
                document.execCommand(command, false, value);
                break;
            default:
                document.execCommand(command, false, value);
                break;
        }

        this.updateToolbarState();
    }

    // 显示链接对话框
    showLinkDialog() {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        const overlay = document.createElement('div');
        overlay.className = 'link-dialog-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'link-dialog';
        dialog.innerHTML = `
            <h3>插入链接</h3>
            <input type="text" id="linkText" placeholder="链接文本" value="${selectedText}">
            <input type="url" id="linkUrl" placeholder="链接地址 (https://...)" required>
            <div class="link-dialog-buttons">
                <button type="button" class="btn-cancel">取消</button>
                <button type="button" class="btn-ok">确定</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const linkText = dialog.querySelector('#linkText');
        const linkUrl = dialog.querySelector('#linkUrl');
        const cancelBtn = dialog.querySelector('.btn-cancel');
        const okBtn = dialog.querySelector('.btn-ok');

        // 如果没有选中文本，聚焦到链接文本输入框
        if (!selectedText) {
            if (linkText && typeof linkText.focus === 'function') linkText.focus();
        } else {
            if (linkUrl && typeof linkUrl.focus === 'function') linkUrl.focus();
        }

        // 事件处理
        const closeDialog = () => {
            document.body.removeChild(overlay);
        };

        cancelBtn.addEventListener('click', closeDialog);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeDialog();
            }
        });

        okBtn.addEventListener('click', () => {
            const text = linkText && linkText.value ? linkText.value.trim() : '';
            const url = linkUrl && linkUrl.value ? linkUrl.value.trim() : '';

            if (!url) {
                alert('请输入链接地址');
                return;
            }

            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                alert('请输入有效的链接地址');
                return;
            }

            this.content.focus();

            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const link = document.createElement('a');
                link.href = url;
                link.textContent = text || url;
                link.target = '_blank';

                if (selectedText) {
                    range.deleteContents();
                }
                range.insertNode(link);
                range.collapse(false);
            } else {
                // 如果没有选中文本，在光标位置插入链接
                const link = document.createElement('a');
                link.href = url;
                link.textContent = text || url;
                link.target = '_blank';
                this.content.appendChild(link);
            }

            closeDialog();
        });

        // 回车键确认
        linkUrl.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                if (okBtn && typeof okBtn.click === 'function') {
                    okBtn.click();
                }
            }
        });
    }

    // 设置图片上传
    setupImageUpload() {
        this.imageUpload.addEventListener('change', (e) => {
            const file = e.target && e.target.files ? e.target.files[0] : null;
            if (file) {
                this.uploadImage(file);
            }
        });
    }

    // 上传图片
    async uploadImage(file) {
        if (!file.type.startsWith('image/')) {
            alert('请选择图片文件');
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB限制
            alert('图片大小不能超过5MB');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('avatar', file);

            // 获取CSRF token
            const csrfResponse = await fetch('/csrf-token', {
                method: 'GET',
                credentials: 'include'
            });

            if (!csrfResponse.ok) {
                throw new Error('无法获取CSRF token');
            }

            const csrfData = await csrfResponse.json();

            const response = await fetch('/api/forum/upload-image', {
                method: 'POST',
                headers: {
                    'X-CSRF-Token': csrfData.token
                },
                body: formData,
                credentials: 'include'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: '上传失败' }));
                throw new Error(errorData.error || '图片上传失败');
            }

            const result = await response.json();
            this.insertImage(result.url, file.name);

        } catch (error) {
            console.error('Image upload error:', error);
            alert('图片上传失败: ' + error.message);
        }

        // 清空文件输入
        if (this.imageUpload && 'value' in this.imageUpload) {
            this.imageUpload.value = '';
        }
    }

    // 插入图片到编辑器
    insertImage(src, alt = '') {
        this.content.focus();

        const img = document.createElement('img');
        img.src = src;
        img.alt = alt;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';

        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.insertNode(img);
            range.collapse(false);
        } else {
            this.content.appendChild(img);
        }
    }

    // 设置拖拽上传
    setupDragAndDrop() {
        this.content.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.content.classList.add('drag-over');
        });

        this.content.addEventListener('dragleave', (e) => {
            e.preventDefault();
            this.content.classList.remove('drag-over');
        });

        this.content.addEventListener('drop', (e) => {
            e.preventDefault();
            this.content.classList.remove('drag-over');

            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                if (file.type.startsWith('image/')) {
                    this.uploadImage(file);
                }
            }
        });
    }

    // 设置键盘快捷键
    setupKeyboardShortcuts() {
        this.content.addEventListener('keydown', (e) => {
            // Ctrl+B: 粗体
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                this.executeCommand('bold');
            }
            // Ctrl+I: 斜体
            else if (e.ctrlKey && e.key === 'i') {
                e.preventDefault();
                this.executeCommand('italic');
            }
            // Ctrl+U: 下划线
            else if (e.ctrlKey && e.key === 'u') {
                e.preventDefault();
                this.executeCommand('underline');
            }
            // Ctrl+K: 插入链接
            else if (e.ctrlKey && e.key === 'k') {
                e.preventDefault();
                this.showLinkDialog();
            }
        });
    }

    // 设置内容事件
    setupContentEvents() {
        this.content.addEventListener('input', () => {
            this.updateToolbarState();
        });

        this.content.addEventListener('keyup', () => {
            this.updateToolbarState();
        });

        this.content.addEventListener('mouseup', () => {
            this.updateToolbarState();
        });
    }

    // 更新工具栏状态
    updateToolbarState() {
        const buttons = this.toolbar.querySelectorAll('.toolbar-btn[data-command]');

        buttons.forEach(button => {
            const command = button.dataset ? button.dataset.command : null;
            const value = button.dataset ? button.dataset.value : null;

            if (command === 'formatBlock') {
                const isActive = document.queryCommandValue('formatBlock') === value;
                button.classList.toggle('active', isActive);
            } else if (command === 'createLink') {
                // 链接按钮状态检查
                const selection = window.getSelection();
                                const container = selection.rangeCount > 0 ? selection.getRangeAt(0).commonAncestorContainer : null;
                const isLink = container &&
                              container.nodeType === Node.ELEMENT_NODE &&
                              typeof container.closest === 'function' &&
                              container.closest('a');
                button.classList.toggle('active', !!isLink);
            } else {
                const isActive = document.queryCommandState(command);
                button.classList.toggle('active', isActive);
            }
        });
    }

    // 获取编辑器内容
    getContent() {
        return this.content.innerHTML;
    }

    // 设置编辑器内容
    setContent(html) {
        this.content.innerHTML = html;
    }

    // 清空编辑器内容
    clear() {
        this.content.innerHTML = '';
    }

    // 检查是否有内容
    hasContent() {
        return this.content.textContent.trim().length > 0;
    }
}

// 全局富文本编辑器实例
let richEditor = null;

// 页面加载完成后初始化编辑器
document.addEventListener('DOMContentLoaded', function() {
    // 当文章模态框显示时初始化编辑器
    const articleModal = document.getElementById('articleModal');
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                if (articleModal.style.display === 'flex') {
                    // 延迟初始化，确保DOM完全渲染
                    setTimeout(() => {
                        if (!richEditor) {
                            const container = document.querySelector('.rich-editor-container');
                            if (container) {
                                richEditor = new RichEditor('articleContent');
                            }
                        }
                    }, 100);
                }
            }
        });
    });

    observer.observe(articleModal, {
        attributes: true,
        attributeFilter: ['style']
    });
});

// 修改原有的文章表单提交处理
const originalHandleArticleSubmit = window.handleArticleSubmit;
window.handleArticleSubmit = async function(event) {
    event.preventDefault();

    if (!window.forumIsLoggedIn) {
        window.showError('请先登录后再发布文章');
        return;
    }

    const formData = new FormData(event.target);
    const articleData = {
        title: formData.get('title'),
        content: richEditor ? richEditor.getContent() : formData.get('content'),
        category: formData.get('category'),
                tags: (() => {
            const tagsValue = formData.get('tags');
            return tagsValue && typeof tagsValue === 'string' ?
                   tagsValue.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        })()
    };

    try {
        window.showLoading();

        const response = await fetch('/api/forum/articles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(articleData),
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '发布失败');
        }

        const result = await response.json();
        window.showSuccess('文章发布成功！');
        window.closeArticleModal();
        window.loadArticles();
    } catch (error) {
        console.error('Failed to create article:', error);
        window.showError(`发布失败: ${error.message}`);
    } finally {
        window.hideLoading();
    }
};

// 修改文章详情显示，支持HTML内容
const originalShowArticleDetail = window.showArticleDetail;
window.showArticleDetail = function(article) {
    document.getElementById('articleDetailTitle').textContent = article.title;
    document.getElementById('articleDetailAuthor').textContent = article.author.name;
    document.getElementById('articleDetailDate').textContent = window.formatDate(article.created_at);
    document.getElementById('articleDetailCategory').textContent = window.getCategoryName(article.category);
    document.getElementById('articleDetailViews').textContent = article.views || 0;

    // 支持HTML内容显示
    const contentElement = document.getElementById('articleDetailContent');
    contentElement.innerHTML = article.content;

    // 显示标签
    const tagsContainer = document.getElementById('articleDetailTags');
    if (article.tags && article.tags.length > 0) {
        const tagsHtml = article.tags.map(tag => `<span class="article-tag">${tag}</span>`).join('');
        tagsContainer.innerHTML = tagsHtml;
        tagsContainer.style.display = 'flex';
    } else {
        tagsContainer.style.display = 'none';
    }

    // 显示删除按钮（只有作者或管理员可以删除）
    const deleteButton = document.getElementById('deleteArticleBtn');
    const canDelete = window.forumIsLoggedIn && (
        window.forumCurrentUser?.admin ||
        article.author.handle === window.forumCurrentUser?.handle
    );

    if (canDelete) {
        deleteButton.style.display = 'inline-flex';
        deleteButton.onclick = () => window.deleteArticle(article.id);
    } else {
        deleteButton.style.display = 'none';
    }

    // 显示评论
    window.renderComments(article.comments || []);

    document.getElementById('articleDetailModal').style.display = 'flex';
};

// 删除文章函数
window.deleteArticle = async function(articleId) {
    if (!confirm('确定要删除这篇文章吗？此操作不可恢复！')) {
        return;
    }

    try {
        const response = await fetch(`/api/forum/articles/${articleId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '删除文章失败');
        }

        window.showSuccess('文章删除成功！');
        document.getElementById('articleDetailModal').style.display = 'none';

        // 重新加载文章列表
        if (window.loadArticles) {
            window.loadArticles();
        }
    } catch (error) {
        console.error('Failed to delete article:', error);
        window.showError(`删除文章失败: ${error.message}`);
    }
};
