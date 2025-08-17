// 论坛页面JavaScript
let articles = [];
let filteredArticles = [];
let forumCurrentPage = 0;
let forumItemsPerPage = 12;
let forumIsLoading = false;
let forumIsLoggedIn = false;
let forumCurrentUser = null;
let forumCurrentArticle = null;

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
    checkLoginStatus();
    loadArticles();
    setupEventListeners();
});

// 暴露全局变量到window对象
window.forumIsLoggedIn = false;
window.forumCurrentUser = null;
window.forumCurrentArticle = null;

// 更新全局变量的函数
function updateGlobalVariables() {
    window.forumIsLoggedIn = forumIsLoggedIn;
    window.forumCurrentUser = forumCurrentUser;
    window.forumCurrentArticle = forumCurrentArticle;
}

// 检查登录状态
async function checkLoginStatus() {
    try {
        const response = await fetch('/api/users/me', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const userData = await response.json();
            forumIsLoggedIn = true;
            forumCurrentUser = userData;
            updateGlobalVariables();
            updateUIForLoginStatus();
        } else {
            forumIsLoggedIn = false;
            forumCurrentUser = null;
            updateGlobalVariables();
            updateUIForLoginStatus();
        }
    } catch (error) {
        console.error('Error checking login status:', error);
        forumIsLoggedIn = false;
        forumCurrentUser = null;
        updateGlobalVariables();
        updateUIForLoginStatus();
    }
}

// 更新UI显示登录状态
function updateUIForLoginStatus() {
    const userInfo = document.getElementById('userInfo');
    const loginPrompt = document.getElementById('loginPrompt');
    const userName = document.getElementById('userName');

    if (forumIsLoggedIn && forumCurrentUser) {
        userInfo.style.display = 'flex';
        loginPrompt.style.display = 'none';
        userName.textContent = forumCurrentUser.name || forumCurrentUser.handle;
    } else {
        userInfo.style.display = 'none';
        loginPrompt.style.display = 'flex';
    }
}

// 设置事件监听器
function setupEventListeners() {
    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(filterArticles, 300));

    // 分类筛选
    const categoryFilter = document.getElementById('categoryFilter');
    categoryFilter.addEventListener('change', filterArticles);

    // 排序筛选
    const sortFilter = document.getElementById('sortFilter');
    sortFilter.addEventListener('change', filterArticles);

    // 文章表单提交
    const articleForm = document.getElementById('articleForm');
    articleForm.addEventListener('submit', handleArticleSubmit);

    // 模态框关闭
    document.addEventListener('click', function(event) {
        if (event.target && event.target.classList && event.target.classList.contains('modal')) {
            closeModal(event.target);
        }
    });
}

// 防抖函数
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 显示加载指示器
function showLoading() {
    forumIsLoading = true;
    document.getElementById('loadingIndicator').style.display = 'block';
}

// 隐藏加载指示器
function hideLoading() {
    forumIsLoading = false;
    document.getElementById('loadingIndicator').style.display = 'none';
}

// 显示错误消息
function showError(message) {
    alert(message);
}

// 显示成功消息
function showSuccess(message) {
    alert(message);
}

// 暴露函数到全局作用域，供其他脚本使用
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.showError = showError;
window.showSuccess = showSuccess;

// 格式化日期
function formatDate(dateString) {
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
}

// 获取分类名称
function getCategoryName(categoryId) {
    const categories = {
        'tutorial': '教程',
        'discussion': '讨论',
        'announcement': '公告',
        'question': '问答',
        'showcase': '展示'
    };
    return categories[categoryId] || categoryId;
}

// 暴露更多函数到全局作用域
window.formatDate = formatDate;
window.getCategoryName = getCategoryName;

// 加载文章列表
async function loadArticles() {
    try {
        showLoading();

        const response = await fetch('/api/forum/articles', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        articles = data;
        filteredArticles = [...articles];

        renderArticles();
    } catch (error) {
        console.error('Failed to load articles:', error);
        showError('加载文章失败');
    } finally {
        hideLoading();
    }
}

// 渲染文章列表
function renderArticles() {
    const grid = document.getElementById('articlesGrid');
    const noArticles = document.getElementById('noArticles');
    const pagination = document.getElementById('pagination');

    grid.innerHTML = '';

    if (filteredArticles.length === 0) {
        noArticles.style.display = 'block';
        pagination.style.display = 'none';
        return;
    }

    noArticles.style.display = 'none';

    const startIndex = forumCurrentPage * forumItemsPerPage;
    const endIndex = startIndex + forumItemsPerPage;
    const pageArticles = filteredArticles.slice(startIndex, endIndex);

    pageArticles.forEach(article => {
        const card = createArticleCard(article);
        grid.appendChild(card);
    });

    // 更新分页
    updatePagination();
}

// 创建文章卡片
function createArticleCard(article) {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.onclick = () => viewArticle(article.id);

    const tags = article.tags || [];
    const tagsHtml = tags.map(tag => `<span class="article-tag">${tag}</span>`).join('');

    card.innerHTML = `
        <div class="article-title">${article.title}</div>
        <div class="article-excerpt">${article.content.substring(0, 150)}${article.content.length > 150 ? '...' : ''}</div>
        <div class="article-meta">
            <span class="article-author">
                <i class="fa-solid fa-user"></i>
                ${article.author.name}
            </span>
            <span class="article-date">
                <i class="fa-solid fa-calendar"></i>
                ${formatDate(article.created_at)}
            </span>
            <span class="article-category">
                <i class="fa-solid fa-tag"></i>
                ${getCategoryName(article.category)}
            </span>
        </div>
        ${tagsHtml ? `<div class="article-tags">${tagsHtml}</div>` : ''}
        <div class="article-stats">
            <span class="article-views">
                <i class="fa-solid fa-eye"></i>
                ${article.views || 0}
            </span>
            <span class="article-likes">
                <i class="fa-solid fa-heart"></i>
                ${article.likes || 0}
            </span>
            <span class="article-comments">
                <i class="fa-solid fa-comments"></i>
                ${article.comments_count || 0}
            </span>
        </div>
    `;

    return card;
}

// 筛选文章
function filterArticles() {
    const searchInput = document.getElementById('searchInput');
    const categoryFilterElement = document.getElementById('categoryFilter');
    const sortFilterElement = document.getElementById('sortFilter');

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    const categoryFilter = categoryFilterElement ? categoryFilterElement.value : '';
    const sortFilter = sortFilterElement ? sortFilterElement.value : '';

    filteredArticles = articles.filter(article => {
        const matchesSearch = !searchTerm ||
            article.title.toLowerCase().includes(searchTerm) ||
            article.content.toLowerCase().includes(searchTerm) ||
            (article.tags && article.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

        const matchesCategory = !categoryFilter || article.category === categoryFilter;

        return matchesSearch && matchesCategory;
    });

    // 排序
    switch (sortFilter) {
        case 'popular':
            filteredArticles.sort((a, b) => (b.likes || 0) - (a.likes || 0));
            break;
        case 'views':
            filteredArticles.sort((a, b) => (b.views || 0) - (a.views || 0));
            break;
        case 'latest':
        default:
            filteredArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            break;
    }

    forumCurrentPage = 0;
    renderArticles();
}

// 更新分页
function updatePagination() {
    const pagination = document.getElementById('pagination');
    const pageInfo = document.getElementById('pageInfo');
    const prevPage = document.getElementById('prevPage');
    const nextPage = document.getElementById('nextPage');

    const totalPages = Math.ceil(Number(filteredArticles.length) / Number(forumItemsPerPage));
    const currentPageNum = Number(forumCurrentPage) + 1;

    if (totalPages <= 1) {
        pagination.style.display = 'none';
        return;
    }

    pagination.style.display = 'flex';
    pageInfo.textContent = `第 ${currentPageNum} 页，共 ${totalPages} 页`;

    if (prevPage) prevPage.disabled = forumCurrentPage === 0;
    if (nextPage) nextPage.disabled = forumCurrentPage >= totalPages - 1;
}

// 上一页
function previousPage() {
    if (forumCurrentPage > 0) {
        forumCurrentPage--;
        renderArticles();
    }
}

// 下一页
function nextPage() {
    const totalPages = Math.ceil(filteredArticles.length / forumItemsPerPage);
    if (forumCurrentPage < totalPages - 1) {
        forumCurrentPage++;
        renderArticles();
    }
}

// 创建文章
function createArticle() {
    if (!forumIsLoggedIn) {
        showError('请先登录后再发布文章');
        return;
    }

    document.getElementById('articleModalTitle').textContent = '发布新文章';
    const articleForm = document.getElementById('articleForm');
    if (articleForm && typeof articleForm.reset === 'function') {
        articleForm.reset();
    }

    // 清空富文本编辑器内容
    const contentElement = document.getElementById('articleContent');
    if (contentElement) {
        contentElement.innerHTML = '';
    }

    document.getElementById('articleModal').style.display = 'flex';
}

// 关闭文章模态框
function closeArticleModal() {
    document.getElementById('articleModal').style.display = 'none';
}

// 暴露更多函数到全局作用域
window.loadArticles = loadArticles;
window.closeArticleModal = closeArticleModal;
window.renderComments = renderComments;

// 处理文章表单提交
async function handleArticleSubmit(event) {
    event.preventDefault();

    if (!forumIsLoggedIn) {
        showError('请先登录后再发布文章');
        return;
    }

    const formData = new FormData(event.target);
    const articleData = {
        title: formData.get('title'),
        content: formData.get('content'),
        category: formData.get('category'),
                tags: (() => {
            const tagsValue = formData.get('tags');
            return tagsValue && typeof tagsValue === 'string' ?
                   tagsValue.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
        })()
    };

    try {
        showLoading();

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
        showSuccess('文章发布成功！');
        closeArticleModal();
        loadArticles();
    } catch (error) {
        console.error('Failed to create article:', error);
        showError(`发布失败: ${error.message}`);
    } finally {
        hideLoading();
    }
}

// 查看文章详情
async function viewArticle(articleId) {
    try {
        showLoading();

        const response = await fetch(`/api/forum/articles/${articleId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('获取文章详情失败');
        }

        const article = await response.json();
        forumCurrentArticle = article;
        updateGlobalVariables();
        showArticleDetail(article);
    } catch (error) {
        console.error('Failed to get article details:', error);
        showError('获取文章详情失败');
    } finally {
        hideLoading();
    }
}

// 显示文章详情
function showArticleDetail(article) {
    document.getElementById('articleDetailTitle').textContent = article.title;
    document.getElementById('articleDetailAuthor').textContent = article.author.name;
    document.getElementById('articleDetailDate').textContent = formatDate(article.created_at);
    document.getElementById('articleDetailCategory').textContent = getCategoryName(article.category);
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
    const canDelete = forumIsLoggedIn && (
        forumCurrentUser?.admin ||
        article.author.handle === forumCurrentUser?.handle
    );

    if (canDelete) {
        deleteButton.style.display = 'inline-flex';
        deleteButton.onclick = () => deleteArticle(article.id);
    } else {
        deleteButton.style.display = 'none';
    }

    // 显示评论
    renderComments(article.comments || []);

    document.getElementById('articleDetailModal').style.display = 'flex';
}

// 关闭文章详情模态框
function closeArticleDetailModal() {
    document.getElementById('articleDetailModal').style.display = 'none';
    forumCurrentArticle = null;
    updateGlobalVariables();
}

// 渲染评论列表
function renderComments(comments) {
    const commentsList = document.getElementById('commentsList');
    const commentsCount = document.getElementById('commentsCount');

    commentsCount.textContent = comments.length;
    commentsList.innerHTML = '';

    comments.forEach(comment => {
        const commentElement = createCommentElement(comment);
        commentsList.appendChild(commentElement);
    });
}

// 创建评论元素
function createCommentElement(comment) {
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment-item';
    commentDiv.dataset.commentId = comment.id;

    const canDelete = forumIsLoggedIn && (
        forumCurrentUser?.admin ||
        comment.author.handle === forumCurrentUser?.handle
    );

    const canReply = forumIsLoggedIn;

    commentDiv.innerHTML = `
        <div class="comment-header">
            <span class="comment-author">${comment.author.name}</span>
            <span class="comment-date">${formatDate(comment.created_at)}</span>
        </div>
        <div class="comment-content">${comment.content}</div>
        <div class="comment-actions">
            ${canReply ? `<button class="btn-reply" onclick="showReplyForm('${comment.id}')">回复</button>` : ''}
            ${canDelete ? `<button class="btn-delete" onclick="deleteComment('${comment.id}')">删除</button>` : ''}
        </div>
        <div class="reply-form" id="replyForm_${comment.id}" style="display: none;">
            <textarea placeholder="写下你的回复..." class="reply-textarea"></textarea>
            <div class="reply-actions">
                <button class="btn-submit-reply" onclick="submitReply('${comment.id}')">发表回复</button>
                <button class="btn-cancel-reply" onclick="hideReplyForm('${comment.id}')">取消</button>
            </div>
        </div>
        <div class="replies" id="replies_${comment.id}">
            ${comment.replies ? comment.replies.map(reply => createReplyHTML(reply)).join('') : ''}
        </div>
    `;

    return commentDiv;
}

// 创建回复元素
function createReplyElement(reply) {
    const replyDiv = document.createElement('div');
    replyDiv.className = 'reply-item';

    const canDelete = forumIsLoggedIn && (
        forumCurrentUser?.admin ||
        reply.author.handle === forumCurrentUser?.handle
    );

    replyDiv.innerHTML = `
        <div class="reply-header">
            <span class="reply-author">${reply.author.name}</span>
            <span class="reply-date">${formatDate(reply.created_at)}</span>
        </div>
        <div class="reply-content">${reply.content}</div>
        ${canDelete ? `
            <div class="reply-actions">
                <button class="btn-delete-reply" onclick="deleteReply('${reply.id}')">删除</button>
            </div>
        ` : ''}
    `;

    return replyDiv;
}

// 创建回复HTML字符串
function createReplyHTML(reply) {
    const canDelete = forumIsLoggedIn && (
        forumCurrentUser?.admin ||
        reply.author.handle === forumCurrentUser?.handle
    );

    return `
        <div class="reply-item" data-reply-id="${reply.id}">
            <div class="reply-header">
                <span class="reply-author">${reply.author.name}</span>
                <span class="reply-date">${formatDate(reply.created_at)}</span>
            </div>
            <div class="reply-content">${reply.content}</div>
            ${canDelete ? `
                <div class="reply-actions">
                    <button class="btn-delete-reply" onclick="deleteReply('${reply.id}')">删除</button>
                </div>
            ` : ''}
        </div>
    `;
}

// 提交评论
async function submitComment() {
    if (!forumIsLoggedIn) {
        showError('请先登录后再发表评论');
        return;
    }

    if (!forumCurrentArticle) {
        showError('无法获取当前文章信息');
        return;
    }

    const commentContentElement = document.getElementById('commentContent');
    const content = commentContentElement ? commentContentElement.value.trim() : '';
    if (!content) {
        showError('请输入评论内容');
        return;
    }

    try {
        const response = await fetch(`/api/forum/articles/${forumCurrentArticle.id}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ content }),
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '发表评论失败');
        }

        const result = await response.json();
        showSuccess('评论发表成功！');
        const commentContentElement = document.getElementById('commentContent');
        if (commentContentElement) commentContentElement.value = '';

        // 重新加载文章详情以获取最新评论
        await viewArticle(forumCurrentArticle.id);
    } catch (error) {
        console.error('Failed to submit comment:', error);
        showError(`发表评论失败: ${error.message}`);
    }
}

// 删除评论
async function deleteComment(commentId) {
    if (!confirm('确定要删除这条评论吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/forum/comments/${commentId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '删除评论失败');
        }

        showSuccess('评论删除成功！');

        // 重新加载文章详情
        if (forumCurrentArticle) {
            await viewArticle(forumCurrentArticle.id);
        }
    } catch (error) {
        console.error('Failed to delete comment:', error);
        showError(`删除评论失败: ${error.message}`);
    }
}

// 删除文章
async function deleteArticle(articleId) {
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

        showSuccess('文章删除成功！');
        closeArticleDetailModal();

        // 重新加载文章列表
        loadArticles();
    } catch (error) {
        console.error('Failed to delete article:', error);
        showError(`删除文章失败: ${error.message}`);
    }
}

// 显示回复表单
function showReplyForm(commentId) {
    const replyForm = document.getElementById(`replyForm_${commentId}`);
    if (replyForm) {
        replyForm.style.display = 'block';
        const textarea = replyForm.querySelector('.reply-textarea');
        if (textarea && typeof textarea.focus === 'function') {
            textarea.focus();
        }
    }
}

// 隐藏回复表单
function hideReplyForm(commentId) {
    const replyForm = document.getElementById(`replyForm_${commentId}`);
    if (replyForm) {
        replyForm.style.display = 'none';
        const textarea = replyForm.querySelector('.reply-textarea');
        if (textarea) textarea.value = '';
    }
}

// 提交回复
async function submitReply(commentId) {
    if (!forumIsLoggedIn) {
        showError('请先登录后再发表回复');
        return;
    }

    if (!forumCurrentArticle) {
        showError('无法获取当前文章信息');
        return;
    }

    const replyForm = document.getElementById(`replyForm_${commentId}`);
    const textarea = replyForm.querySelector('.reply-textarea');
    const content = textarea && textarea.value ? textarea.value.trim() : '';

    if (!content) {
        showError('请输入回复内容');
        return;
    }

    try {
        const response = await fetch(`/api/forum/articles/${forumCurrentArticle.id}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content,
                parent_id: commentId
            }),
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '发表回复失败');
        }

        const result = await response.json();
        showSuccess('回复发表成功！');
        hideReplyForm(commentId);

        // 动态添加回复到页面
        const repliesContainer = document.getElementById(`replies_${commentId}`);
        if (repliesContainer) {
            const replyHTML = createReplyHTML(result);
            repliesContainer.insertAdjacentHTML('beforeend', replyHTML);
        }
    } catch (error) {
        console.error('Failed to submit reply:', error);
        showError(`发表回复失败: ${error.message}`);
    }
}

// 删除回复
async function deleteReply(replyId) {
    if (!confirm('确定要删除这条回复吗？')) {
        return;
    }

    try {
        const response = await fetch(`/api/forum/comments/${replyId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || '删除回复失败');
        }

        showSuccess('回复删除成功！');

        // 动态删除回复元素
        const replyElement = document.querySelector(`[data-reply-id="${replyId}"]`);
        if (replyElement) {
            replyElement.remove();
        }
    } catch (error) {
        console.error('Failed to delete reply:', error);
        showError(`删除回复失败: ${error.message}`);
    }
}

// 点赞文章
function likeArticle() {
    if (!forumIsLoggedIn) {
        showError('请先登录后再点赞');
        return;
    }

    // TODO: 实现点赞功能
    showError('点赞功能开发中...');
}

// 分享文章
function shareArticle() {
    if (navigator.share) {
        navigator.share({
            title: forumCurrentArticle?.title || '分享文章',
            url: window.location.href
        });
    } else {
        // 复制链接到剪贴板
        navigator.clipboard.writeText(window.location.href).then(() => {
            showSuccess('链接已复制到剪贴板');
        }).catch(() => {
            showError('复制链接失败');
        });
    }
}

// 关闭模态框
function closeModal(modalElement) {
    modalElement.style.display = 'none';
}
