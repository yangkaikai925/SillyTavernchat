import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import express from 'express';
import multer from 'multer';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import { humanizedISO8601DateTime, getConfigValue } from '../util.js';

// 论坛数据存储目录
const FORUM_DATA_DIR = path.join(globalThis.DATA_ROOT, 'forum_data');
const ARTICLES_DIR = path.join(FORUM_DATA_DIR, 'articles');
const COMMENTS_DIR = path.join(FORUM_DATA_DIR, 'comments');

// 确保目录存在
if (!fs.existsSync(FORUM_DATA_DIR)) {
    fs.mkdirSync(FORUM_DATA_DIR, { recursive: true });
}
if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
}
if (!fs.existsSync(COMMENTS_DIR)) {
    fs.mkdirSync(COMMENTS_DIR, { recursive: true });
}
if (!fs.existsSync(path.join(FORUM_DATA_DIR, 'temp'))) {
    fs.mkdirSync(path.join(FORUM_DATA_DIR, 'temp'), { recursive: true });
}

export const router = express.Router();

/**
 * 生成文章ID
 * @returns {string} 文章ID
 */
function generateArticleId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 生成评论ID
 * @returns {string} 评论ID
 */
function generateCommentId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 保存文章数据
 * @param {object} article 文章数据
 * @returns {boolean} 是否成功
 */
function saveArticle(article) {
    try {
        const articlePath = path.join(ARTICLES_DIR, `${article.id}.json`);
        writeFileAtomicSync(articlePath, JSON.stringify(article, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving article:', error);
        return false;
    }
}

/**
 * 获取所有文章
 * @returns {Array} 文章列表
 */
function getAllArticles() {
    try {
        const files = fs.readdirSync(ARTICLES_DIR);
        const articles = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const articlePath = path.join(ARTICLES_DIR, file);
                    const articleData = fs.readFileSync(articlePath, 'utf8');
                    const article = JSON.parse(articleData);
                    articles.push(article);
                } catch (error) {
                    console.error(`Error reading article file ${file}:`, error);
                }
            }
        }

        // 按创建时间倒序排列
        return articles.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (error) {
        console.error('Error getting all articles:', error);
        return [];
    }
}

/**
 * 获取文章详情
 * @param {string} articleId 文章ID
 * @returns {object|null} 文章数据
 */
function getArticle(articleId) {
    try {
        const articlePath = path.join(ARTICLES_DIR, `${articleId}.json`);
        if (!fs.existsSync(articlePath)) {
            return null;
        }

        const articleData = fs.readFileSync(articlePath, 'utf8');
        return JSON.parse(articleData);
    } catch (error) {
        console.error('Error getting article:', error);
        return null;
    }
}

/**
 * 保存评论数据
 * @param {object} comment 评论数据
 * @returns {boolean} 是否成功
 */
function saveComment(comment) {
    try {
        const commentPath = path.join(COMMENTS_DIR, `${comment.id}.json`);
        writeFileAtomicSync(commentPath, JSON.stringify(comment, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving comment:', error);
        return false;
    }
}

/**
 * 获取文章的所有评论
 * @param {string} articleId 文章ID
 * @returns {Array} 评论列表
 */
function getArticleComments(articleId) {
    try {
        const files = fs.readdirSync(COMMENTS_DIR);
        const allComments = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const commentPath = path.join(COMMENTS_DIR, file);
                    const commentData = fs.readFileSync(commentPath, 'utf8');
                    const comment = JSON.parse(commentData);

                    if (comment.article_id === articleId) {
                        allComments.push(comment);
                    }
                } catch (error) {
                    console.error(`Error reading comment file ${file}:`, error);
                }
            }
        }

        // 分离主评论和回复
        const mainComments = allComments.filter(comment => !comment.parent_id);
        const replies = allComments.filter(comment => comment.parent_id);

        // 为每个主评论添加回复
        mainComments.forEach(comment => {
            comment.replies = replies
                .filter(reply => reply.parent_id === comment.id)
                .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        });

        // 按创建时间正序排列主评论
        return mainComments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } catch (error) {
        console.error('Error getting article comments:', error);
        return [];
    }
}

// 获取所有文章
router.get('/articles', async function (request, response) {
    try {
        const articles = getAllArticles();
        response.json(articles);
    } catch (error) {
        console.error('Error getting articles:', error);
        response.status(500).json({ error: 'Failed to get articles' });
    }
});

// 获取文章详情
router.get('/articles/:articleId', async function (request, response) {
    try {
        const { articleId } = request.params;
        const article = getArticle(articleId);

        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        // 获取文章评论
        const comments = getArticleComments(articleId);
        article.comments = comments;

        response.json(article);
    } catch (error) {
        console.error('Error getting article:', error);
        response.status(500).json({ error: 'Failed to get article' });
    }
});

// 创建新文章
router.post('/articles', async function (request, response) {
    try {
        const { title, content, category, tags } = request.body;

        if (!title || !content) {
            return response.status(400).json({ error: 'Title and content are required' });
        }

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = {
            id: generateArticleId(),
            title: title.trim(),
            content: content.trim(),
            category: category || 'discussion',
            tags: tags || [],
            author: {
                handle: request.user.profile.handle,
                name: request.user.profile.name
            },
            created_at: humanizedISO8601DateTime(),
            updated_at: humanizedISO8601DateTime(),
            views: 0,
            likes: 0,
            comments_count: 0
        };

        if (saveArticle(article)) {
            console.info(`Article "${article.title}" created by ${article.author.handle}`);
            response.json(article);
        } else {
            response.status(500).json({ error: 'Failed to save article' });
        }
    } catch (error) {
        console.error('Error creating article:', error);
        response.status(500).json({ error: 'Failed to create article' });
    }
});

// 更新文章
router.put('/articles/:articleId', async function (request, response) {
    try {
        const { articleId } = request.params;
        const { title, content, category, tags } = request.body;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = getArticle(articleId);
        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        // 检查权限：只有作者或管理员可以编辑
        const isAuthor = article.author.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isAuthor && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        // 更新文章
        if (title) article.title = title.trim();
        if (content) article.content = content.trim();
        if (category) article.category = category;
        if (tags) article.tags = tags;
        article.updated_at = humanizedISO8601DateTime();

        if (saveArticle(article)) {
            console.info(`Article "${article.title}" updated by ${request.user.profile.handle}`);
            response.json(article);
        } else {
            response.status(500).json({ error: 'Failed to update article' });
        }
    } catch (error) {
        console.error('Error updating article:', error);
        response.status(500).json({ error: 'Failed to update article' });
    }
});

// 删除文章
router.delete('/articles/:articleId', async function (request, response) {
    try {
        const { articleId } = request.params;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = getArticle(articleId);
        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        // 检查权限：只有作者或管理员可以删除
        const isAuthor = article.author.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isAuthor && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        // 删除文章文件
        const articlePath = path.join(ARTICLES_DIR, `${articleId}.json`);
        fs.unlinkSync(articlePath);

        // 删除相关评论
        const comments = getArticleComments(articleId);
        for (const comment of comments) {
            const commentPath = path.join(COMMENTS_DIR, `${comment.id}.json`);
            if (fs.existsSync(commentPath)) {
                fs.unlinkSync(commentPath);
            }
        }

        console.info(`Article "${article.title}" deleted by ${request.user.profile.handle}`);
        response.json({ success: true });
    } catch (error) {
        console.error('Error deleting article:', error);
        response.status(500).json({ error: 'Failed to delete article' });
    }
});

// 添加评论
router.post('/articles/:articleId/comments', async function (request, response) {
    try {
        const { articleId } = request.params;
        const { content, parent_id } = request.body;

        if (!content) {
            return response.status(400).json({ error: 'Comment content is required' });
        }

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        const article = getArticle(articleId);
        if (!article) {
            return response.status(404).json({ error: 'Article not found' });
        }

        const comment = {
            id: generateCommentId(),
            article_id: articleId,
            parent_id: parent_id || null,
            content: content.trim(),
            author: {
                handle: request.user.profile.handle,
                name: request.user.profile.name
            },
            created_at: humanizedISO8601DateTime(),
            likes: 0
        };

        if (saveComment(comment)) {
            // 更新文章评论数
            article.comments_count = (article.comments_count || 0) + 1;
            saveArticle(article);

            console.info(`Comment added to article "${article.title}" by ${comment.author.handle}`);
            response.json(comment);
        } else {
            response.status(500).json({ error: 'Failed to save comment' });
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        response.status(500).json({ error: 'Failed to add comment' });
    }
});

// 删除评论
router.delete('/comments/:commentId', async function (request, response) {
    try {
        const { commentId } = request.params;

        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        // 查找评论
        const commentPath = path.join(COMMENTS_DIR, `${commentId}.json`);
        if (!fs.existsSync(commentPath)) {
            return response.status(404).json({ error: 'Comment not found' });
        }

        const commentData = fs.readFileSync(commentPath, 'utf8');
        const comment = JSON.parse(commentData);

        // 检查权限：只有作者或管理员可以删除
        const isAuthor = comment.author.handle === request.user.profile.handle;
        const isAdmin = request.user.profile.admin;

        if (!isAuthor && !isAdmin) {
            return response.status(403).json({ error: 'Permission denied' });
        }

        // 删除评论文件
        fs.unlinkSync(commentPath);

        // 更新文章评论数
        const article = getArticle(comment.article_id);
        if (article) {
            article.comments_count = Math.max(0, (article.comments_count || 0) - 1);
            saveArticle(article);
        }

        console.info(`Comment deleted by ${request.user.profile.handle}`);
        response.json({ success: true });
    } catch (error) {
        console.error('Error deleting comment:', error);
        response.status(500).json({ error: 'Failed to delete comment' });
    }
});

// 获取文章分类
router.get('/categories', async function (request, response) {
    try {
        const categories = [
            { id: 'tutorial', name: '教程', description: '使用教程和指南' },
            { id: 'discussion', name: '讨论', description: '一般讨论和交流' },
            { id: 'announcement', name: '公告', description: '官方公告和通知' },
            { id: 'question', name: '问答', description: '问题和解答' },
            { id: 'showcase', name: '展示', description: '作品展示和分享' }
        ];

        response.json(categories);
    } catch (error) {
        console.error('Error getting categories:', error);
        response.status(500).json({ error: 'Failed to get categories' });
    }
});

// 搜索文章
router.get('/search', async function (request, response) {
    try {
        const { q, category, author } = request.query;
        let articles = getAllArticles();

        // 关键词搜索
        if (q) {
            const query = q.toLowerCase();
            articles = articles.filter(article =>
                article.title.toLowerCase().includes(query) ||
                article.content.toLowerCase().includes(query) ||
                (article.tags && article.tags.some(tag => tag.toLowerCase().includes(query)))
            );
        }

        // 分类筛选
        if (category) {
            articles = articles.filter(article => article.category === category);
        }

        // 作者筛选
        if (author) {
            articles = articles.filter(article =>
                article.author.handle === author ||
                article.author.name === author
            );
        }

        response.json(articles);
    } catch (error) {
        console.error('Error searching articles:', error);
        response.status(500).json({ error: 'Failed to search articles' });
    }
});

// 图片上传 - 使用全局multer配置，不创建新的multer实例
router.post('/upload-image', async function (request, response) {
    try {
        if (!request.user) {
            return response.status(401).json({ error: 'Authentication required' });
        }

        // 检查是否有文件上传
        if (!request.file) {
            return response.status(400).json({ error: 'No image file uploaded' });
        }

        const uploadedFile = request.file;

        // 检查文件类型是否为图片
        if (!uploadedFile.mimetype || !uploadedFile.mimetype.startsWith('image/')) {
            return response.status(400).json({ error: 'Uploaded file is not an image' });
        }

        // 验证文件类型
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(uploadedFile.mimetype)) {
            return response.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.' });
        }

        // 创建图片存储目录
        const imagesDir = path.join(FORUM_DATA_DIR, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }

        // 生成唯一文件名
        const fileExtension = path.extname(uploadedFile.originalname);
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}${fileExtension}`;
        const filePath = path.join(imagesDir, fileName);

        // 移动文件到目标目录
        console.log('Moving file from:', uploadedFile.path, 'to:', filePath);
        fs.copyFileSync(uploadedFile.path, filePath);
        fs.unlinkSync(uploadedFile.path); // 删除临时文件

        // 验证文件是否成功保存
        if (!fs.existsSync(filePath)) {
            throw new Error('Failed to save image file');
        }

        // 返回图片URL
        const imageUrl = `/api/forum/images/${fileName}`;

        console.info(`Image uploaded by ${request.user.profile.handle}: ${fileName}`);
        console.log('File saved at:', filePath);
        response.json({
            success: true,
            url: imageUrl,
            filename: fileName
        });

    } catch (error) {
        console.error('Error uploading image:', error);

        // 如果是multer错误，返回更具体的错误信息
        if (error.code === 'LIMIT_FILE_SIZE') {
            return response.status(400).json({ error: 'File size too large. Maximum size is 5MB.' });
        }

        response.status(500).json({ error: 'Failed to upload image: ' + error.message });
    }
});

// 提供图片文件
router.get('/images/:filename', async function (request, response) {
    try {
        const { filename } = request.params;
        const sanitizedFilename = sanitize(filename);

        if (sanitizedFilename !== filename) {
            return response.status(400).json({ error: 'Invalid filename' });
        }

        const imagePath = path.resolve(FORUM_DATA_DIR, 'images', sanitizedFilename);
        console.log('Looking for image at:', imagePath);

        if (!fs.existsSync(imagePath)) {
            console.log('Image not found at:', imagePath);
            return response.status(404).json({ error: 'Image not found' });
        }

        // 设置适当的Content-Type
        const ext = path.extname(sanitizedFilename).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        };

        const contentType = mimeTypes[ext] || 'application/octet-stream';
        response.setHeader('Content-Type', contentType);

        // 设置缓存头
        response.setHeader('Cache-Control', 'public, max-age=31536000'); // 1年缓存

        // 发送文件 - 直接使用绝对路径
        response.sendFile(imagePath);

    } catch (error) {
        console.error('Error serving image:', error);
        response.status(500).json({ error: 'Failed to serve image' });
    }
});
