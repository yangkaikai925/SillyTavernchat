import path from 'node:path';
import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { Buffer } from 'node:buffer';

import express from 'express';
import sanitize from 'sanitize-filename';
import { sync as writeFileAtomicSync } from 'write-file-atomic';
import yaml from 'yaml';
import _ from 'lodash';
import mime from 'mime-types';
import { Jimp, JimpMime } from '../jimp.js';
import storage from 'node-persist';
import extract from 'png-chunks-extract';
import PNGtext from 'png-chunk-text';

import { AVATAR_WIDTH, AVATAR_HEIGHT, DEFAULT_AVATAR_PATH } from '../constants.js';
import { default as validateAvatarUrlMiddleware, getFileNameValidationFunction } from '../middleware/validateFileName.js';
import { deepMerge, humanizedISO8601DateTime, tryParse, extractFileFromZipBuffer, MemoryLimitedMap, getConfigValue, mutateJsonString } from '../util.js';
import { TavernCardValidator } from '../validator/TavernCardValidator.js';
import { parse, read, write } from '../character-card-parser.js';
import { readWorldInfoFile } from './worldinfo.js';
import { invalidateThumbnail } from './thumbnails.js';
import { importRisuSprites } from './sprites.js';
import { getUserDirectories } from '../users.js';
import { getChatInfo } from './chats.js';
import { ByafParser } from '../byaf.js';
import cacheBuster from '../middleware/cacheBuster.js';

// 公用角色卡存储目录
const PUBLIC_CHARACTERS_DIR = path.join(globalThis.DATA_ROOT, 'public_characters');
const PUBLIC_CHARACTERS_THUMBNAILS_DIR = path.join(globalThis.DATA_ROOT, 'public_characters_thumbnails');

// 确保目录存在
if (!fs.existsSync(PUBLIC_CHARACTERS_DIR)) {
    fs.mkdirSync(PUBLIC_CHARACTERS_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_CHARACTERS_THUMBNAILS_DIR)) {
    fs.mkdirSync(PUBLIC_CHARACTERS_THUMBNAILS_DIR, { recursive: true });
}

export const router = express.Router();

/**
 * 读取角色卡数据
 * @param {string} inputFile 输入文件路径
 * @param {string} inputFormat 输入格式
 * @returns {Promise<string|undefined>} 角色卡数据
 */
async function readCharacterData(inputFile, inputFormat = 'png') {
    let result;
    try {
        if (inputFormat === 'png') {
            result = await read(inputFile);
        } else {
            const fileData = await fsPromises.readFile(inputFile);
            result = fileData.toString('utf8');
        }
    } catch (error) {
        console.error('Error reading character data:', error);
        return undefined;
    }
    return result;
}

/**
 * 写入角色卡数据
 * @param {string|Buffer} inputFile 输入文件
 * @param {string} data 角色卡数据
 * @param {string} outputFile 输出文件名
 * @param {Crop|undefined} crop 裁剪参数
 * @returns {Promise<boolean>} 是否成功
 */
async function writeCharacterData(inputFile, data, outputFile, crop = undefined) {
    try {
        /**
         * 读取图像，调整大小并保存为PNG到缓冲区
         * @returns {Promise<Buffer>} 图像缓冲区
         */
        async function getInputImage() {
            try {
                if (Buffer.isBuffer(inputFile)) {
                    return await parseImageBuffer(inputFile, crop);
                }
                return await tryReadImage(inputFile, crop);
            } catch (error) {
                const message = Buffer.isBuffer(inputFile) ? 'Failed to read image buffer.' : `Failed to read image: ${inputFile}.`;
                console.warn(message, 'Using a fallback image.', error);

                // 对于PNG角色卡，尝试从原始PNG文件中提取图像数据
                if (typeof inputFile === 'string' && inputFile.endsWith('.png')) {
                    try {
                        console.log('Attempting to extract image from original PNG file:', inputFile);
                        const originalBuffer = fs.readFileSync(inputFile);
                        console.log('Original PNG file size:', originalBuffer.length, 'bytes');
                        const processedImage = await parseImageBuffer(originalBuffer, crop);
                        console.log('Successfully processed image from original PNG');
                        return processedImage;
                    } catch (extractError) {
                        console.warn('Failed to extract image from original PNG, using fallback:', extractError);
                        return await fs.promises.readFile(DEFAULT_AVATAR_PATH);
                    }
                }

                return await fs.promises.readFile(DEFAULT_AVATAR_PATH);
            }
        }

        const inputImage = await getInputImage();
        console.log('Input image size:', inputImage.length, 'bytes');

        const outputImage = write(inputImage, data);
        console.log('Output image size:', outputImage.length, 'bytes');

        const outputImagePath = path.join(PUBLIC_CHARACTERS_DIR, `${outputFile}.png`);
        console.log('Saving character card to:', outputImagePath);

        writeFileAtomicSync(outputImagePath, outputImage);

        // 验证保存的文件
        const savedFileSize = fs.statSync(outputImagePath).size;
        console.log('Saved file size:', savedFileSize, 'bytes');

        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

/**
 * 解析图像缓冲区
 * @param {Buffer} buffer 图像缓冲区
 * @param {Crop|undefined} crop 裁剪参数
 * @returns {Promise<Buffer>} 处理后的图像缓冲区
 */
async function parseImageBuffer(buffer, crop = undefined) {
    const image = await Jimp.read(buffer);

    if (crop) {
        image.crop(crop.x, crop.y, crop.width, crop.height);
    }

    if (crop?.want_resize) {
        image.resize(AVATAR_WIDTH, AVATAR_HEIGHT);
    }

    return await image.getBuffer('image/png');
}

/**
 * 尝试读取图像
 * @param {string} filePath 文件路径
 * @param {Crop|undefined} crop 裁剪参数
 * @returns {Promise<Buffer>} 图像缓冲区
 */
async function tryReadImage(filePath, crop = undefined) {
    const image = await Jimp.read(filePath);

    if (crop) {
        image.crop(crop.x, crop.y, crop.width, crop.height);
    }

    if (crop?.want_resize) {
        image.resize(AVATAR_WIDTH, AVATAR_HEIGHT);
    }

    return await image.getBuffer('image/png');
}

/**
 * 获取PNG文件名
 * @param {string} name 角色名称
 * @returns {string} 文件名
 */
function getPngName(name) {
    // 使用更宽松的清理规则，保留中文字符
    const sanitizedName = sanitize(name);
    // 只替换特殊字符，保留中文、英文、数字
    return sanitizedName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
}

/**
 * 处理角色卡数据
 * @param {string} item 角色文件名
 * @returns {Promise<object>} 角色卡数据
 */
const processCharacter = async (item) => {
    try {
        const imgFile = path.join(PUBLIC_CHARACTERS_DIR, item);

        // 尝试直接使用Buffer读取
        let imgData;
        try {
            const fileBuffer = fs.readFileSync(imgFile);
            imgData = read(fileBuffer);
            console.log(`Successfully read character data from buffer for ${item}`);
        } catch (bufferError) {
            console.error(`Error reading character data from buffer for ${item}:`, bufferError);

            // 尝试使用文件路径读取
            try {
                imgData = await readCharacterData(imgFile);
                console.log(`Successfully read character data from file path for ${item}`);
            } catch (fileError) {
                console.error(`Error reading character data from file path for ${item}:`, fileError);
                throw new Error('Failed to read character file');
            }
        }

        if (imgData === undefined) throw new Error('Failed to read character file');

        let jsonObject = JSON.parse(imgData);
        jsonObject.avatar = item;

        const character = jsonObject;
        character['json_data'] = imgData;

        const charStat = fs.statSync(path.join(PUBLIC_CHARACTERS_DIR, item));
        character['date_added'] = charStat.ctimeMs;
        character['create_date'] = jsonObject['create_date'] || humanizedISO8601DateTime(charStat.ctimeMs);

        // 获取上传者信息
        character['uploader'] = jsonObject['uploader'] || 'Unknown';
        character['uploader_handle'] = jsonObject['uploader_handle'] || 'unknown';
        character['description'] = jsonObject['description'] || '';
        character['tags'] = jsonObject['tags'] || [];

        return character;
    } catch (err) {
        console.error(`Could not process character: ${item}`, err);
        return {
            date_added: 0,
            name: item.replace('.png', ''),
            uploader: 'Unknown',
            uploader_handle: 'unknown',
        };
    }
};

/**
 * 从YAML导入角色卡
 * @param {string} uploadPath 上传文件路径
 * @param {string} uploaderHandle 上传者用户名
 * @param {string} uploaderName 上传者显示名称
 * @param {string|undefined} preservedFileName 保留的文件名
 * @returns {Promise<string>} 角色卡文件名
 */
async function importFromYaml(uploadPath, uploaderHandle, uploaderName, preservedFileName) {
    const fileText = fs.readFileSync(uploadPath, 'utf8');
    fs.unlinkSync(uploadPath);
    const yamlData = yaml.parse(fileText);
    console.info('Importing from YAML');
    yamlData.name = sanitize(yamlData.name);
    const fileName = preservedFileName || getPngName(yamlData.name);

    let char = {
        'name': yamlData.name,
        'description': yamlData.context ?? '',
        'first_mes': yamlData.greeting ?? '',
        'create_date': humanizedISO8601DateTime(),
        'chat': `${yamlData.name} - ${humanizedISO8601DateTime()}`,
        'personality': '',
        'creatorcomment': '',
        'avatar': 'none',
        'mes_example': '',
        'scenario': '',
        'talkativeness': 0.5,
        'creator': '',
        'tags': yamlData.tags || [],
        'uploader': uploaderName,
        'uploader_handle': uploaderHandle,
    };

    const result = await writeCharacterData(DEFAULT_AVATAR_PATH, JSON.stringify(char), fileName);
    return result ? fileName : '';
}

/**
 * 从JSON导入角色卡
 * @param {string} uploadPath 上传文件路径
 * @param {string} uploaderHandle 上传者用户名
 * @param {string} uploaderName 上传者显示名称
 * @param {string|undefined} preservedFileName 保留的文件名
 * @returns {Promise<string>} 角色卡文件名
 */
async function importFromJson(uploadPath, uploaderHandle, uploaderName, preservedFileName) {
    const data = fs.readFileSync(uploadPath, 'utf8');
    fs.unlinkSync(uploadPath);

    let jsonData = JSON.parse(data);

    if (jsonData.spec !== undefined) {
        console.info(`Importing from ${jsonData.spec} json`);
        unsetPrivateFields(jsonData);
        jsonData = readFromV2(jsonData);
        jsonData['create_date'] = humanizedISO8601DateTime();
        jsonData['uploader'] = uploaderName;
        jsonData['uploader_handle'] = uploaderHandle;
        const pngName = preservedFileName || getPngName(jsonData.data?.name || jsonData.name);
        const char = JSON.stringify(jsonData);
        const result = await writeCharacterData(DEFAULT_AVATAR_PATH, char, pngName);
        return result ? pngName : '';
    } else if (jsonData.name !== undefined) {
        console.info('Importing from v1 json');
        jsonData['create_date'] = humanizedISO8601DateTime();
        jsonData['uploader'] = uploaderName;
        jsonData['uploader_handle'] = uploaderHandle;
        const pngName = preservedFileName || getPngName(jsonData.name);
        const char = JSON.stringify(jsonData);
        const result = await writeCharacterData(DEFAULT_AVATAR_PATH, char, pngName);
        return result ? pngName : '';
    }

    return '';
}

/**
 * 从PNG导入角色卡
 * @param {string} uploadPath 上传文件路径
 * @param {string} uploaderHandle 上传者用户名
 * @param {string} uploaderName 上传者显示名称
 * @param {string|undefined} preservedFileName 保留的文件名
 * @returns {Promise<string>} 角色卡文件名
 */
async function importFromPng(uploadPath, uploaderHandle, uploaderName, preservedFileName) {
    try {
        console.log('Importing PNG file:', uploadPath);

        // 首先检查文件是否是有效的PNG文件
        const fileBuffer = fs.readFileSync(uploadPath);
        console.log('File size:', fileBuffer.length, 'bytes');

        const pngHeader = fileBuffer.slice(0, 8);
        const validPngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

        console.log('PNG header check:', {
            actual: pngHeader.toString('hex'),
            expected: validPngHeader.toString('hex'),
            isValid: pngHeader.equals(validPngHeader)
        });

        if (!pngHeader.equals(validPngHeader)) {
            throw new Error('Invalid PNG file header');
        }

        // 尝试直接使用Buffer而不是文件路径
        let imgData;
        try {
            // 直接使用Buffer读取角色卡数据
            imgData = read(fileBuffer);
            console.log('Successfully read character data from buffer');
        } catch (readError) {
            console.error('Error reading character data from buffer:', readError);

            // 尝试使用文件路径
            try {
                imgData = await readCharacterData(uploadPath);
                console.log('Successfully read character data from file path');
            } catch (fileReadError) {
                console.error('Error reading character data from file path:', fileReadError);

                // 检查PNG文件结构
                try {
                    const chunks = extract(new Uint8Array(fileBuffer));
                    console.log('PNG chunks found:', chunks.map(chunk => chunk.name));

                    const textChunks = chunks.filter(chunk => chunk.name === 'tEXt');
                    console.log('Text chunks found:', textChunks.length);

                    if (textChunks.length === 0) {
                        throw new Error('PNG file does not contain any text chunks (not a character card)');
                    }

                    // 检查是否有角色卡数据
                    const hasChara = textChunks.some(chunk => {
                        try {
                            const data = PNGtext.decode(chunk.data);
                            return data.keyword.toLowerCase() === 'chara' || data.keyword.toLowerCase() === 'ccv3';
                        } catch (e) {
                            return false;
                        }
                    });

                    if (!hasChara) {
                        throw new Error('PNG file does not contain character card data (chara or ccv3 chunks)');
                    }

                    throw new Error('PNG file structure is valid but data extraction failed');
                } catch (chunkError) {
                    throw new Error(`PNG analysis failed: ${chunkError.message}`);
                }
            }
        }

        if (imgData === undefined) {
            throw new Error('Failed to read character data from PNG');
        }

        let jsonData;
        try {
            jsonData = JSON.parse(imgData);
        } catch (parseError) {
            throw new Error('Invalid JSON data in PNG file');
        }

        // 验证角色卡数据
        if (!jsonData.name && !jsonData.data?.name) {
            throw new Error('Character name not found in PNG file');
        }

        const originalName = jsonData.data?.name || jsonData.name;
        console.log('Original character name:', originalName);

        jsonData.name = sanitize(originalName);
        console.log('Sanitized character name:', jsonData.name);

        const pngName = preservedFileName || getPngName(jsonData.name);
        console.log('Generated PNG name:', pngName);

        if (jsonData.spec !== undefined) {
            console.info(`Found a ${jsonData.spec} character file.`);
            unsetPrivateFields(jsonData);
            jsonData = readFromV2(jsonData);
            jsonData['create_date'] = humanizedISO8601DateTime();
            jsonData['uploader'] = uploaderName;
            jsonData['uploader_handle'] = uploaderHandle;
            const char = JSON.stringify(jsonData);
            const result = await writeCharacterData(uploadPath, char, pngName);
            fs.unlinkSync(uploadPath);
            return result ? pngName : '';
        } else if (jsonData.name !== undefined) {
            console.info('Found a v1 character file.');
            jsonData['create_date'] = humanizedISO8601DateTime();
            jsonData['uploader'] = uploaderName;
            jsonData['uploader_handle'] = uploaderHandle;
            const char = JSON.stringify(jsonData);
            const result = await writeCharacterData(uploadPath, char, pngName);
            fs.unlinkSync(uploadPath);
            return result ? pngName : '';
        }

        throw new Error('Unsupported character card format');
    } catch (error) {
        console.error('Error importing PNG character:', error);
        // 清理上传的文件
        if (fs.existsSync(uploadPath)) {
            fs.unlinkSync(uploadPath);
        }
        throw error;
    }
}

/**
 * 移除私有字段
 * @param {object} card 角色卡数据
 */
function unsetPrivateFields(card) {
    delete card['user_notes'];
    delete card['user_notes_private'];
    delete card['user_notes_public'];
    delete card['user_notes_private_visible'];
    delete card['user_notes_public_visible'];
}

/**
 * 从V2格式读取角色卡
 * @param {object} card V2格式角色卡
 * @returns {object} 处理后的角色卡
 */
function readFromV2(card) {
    // 对于V2格式，直接返回处理后的数据，不需要再次读取
    return card;
}

/**
 * 获取保留的文件名
 * @param {object} request 请求对象
 * @returns {string|undefined} 保留的文件名
 */
function getPreservedName(request) {
    return request.body.preserved_name ? path.parse(request.body.preserved_name).name : undefined;
}

// 获取所有公用角色卡
router.post('/all', async function (request, response) {
    try {
        const files = fs.readdirSync(PUBLIC_CHARACTERS_DIR);
        const pngFiles = files.filter(file => file.endsWith('.png'));
        const processingPromises = pngFiles.map(file => processCharacter(file));
        const data = (await Promise.all(processingPromises)).filter(c => c.name);
        return response.send(data);
    } catch (err) {
        console.error(err);
        response.status(500).send({ error: true });
    }
});

// 上传公用角色卡
router.post('/upload', async function (request, response) {
    console.log('Upload request received:', {
        hasBody: !!request.body,
        hasFile: !!request.file,
        fileInfo: request.file ? {
            originalname: request.file.originalname,
            filename: request.file.filename,
            size: request.file.size,
            mimetype: request.file.mimetype
        } : null,
        bodyInfo: request.body ? {
            file_type: request.body.file_type,
            name: request.body.name
        } : null
    });

    if (!request.body || !request.file) {
        console.error('Missing request body or file');
        return response.sendStatus(400);
    }

    const uploadPath = path.join(request.file.destination, request.file.filename);
    const format = request.body.file_type;
    const preservedFileName = getPreservedName(request);
    const uploaderHandle = request.user.profile.handle;
    const uploaderName = request.user.profile.name;

    console.log('Processing upload:', {
        uploadPath,
        format,
        preservedFileName,
        uploaderHandle,
        uploaderName
    });

    const formatImportFunctions = {
        'yaml': importFromYaml,
        'yml': importFromYaml,
        'json': importFromJson,
        'png': importFromPng,
    };

    try {
        const importFunction = formatImportFunctions[format];

        if (!importFunction) {
            throw new Error(`Unsupported format: ${format}`);
        }

        const fileName = await importFunction(uploadPath, uploaderHandle, uploaderName, preservedFileName);

        if (!fileName) {
            console.warn('Failed to import character');
            return response.status(400).json({ error: 'Failed to import character' });
        }

        console.info(`Character ${fileName} uploaded successfully by ${uploaderHandle}`);
        response.json({ file_name: fileName });
    } catch (err) {
        console.error('Upload error:', err);

        // 清理上传的文件
        if (fs.existsSync(uploadPath)) {
            try {
                fs.unlinkSync(uploadPath);
            } catch (cleanupError) {
                console.error('Failed to cleanup upload file:', cleanupError);
            }
        }

        response.status(400).json({ error: err.message || 'Upload failed' });
    }
});

// 导入公用角色卡到用户账户
router.post('/import', async function (request, response) {
    try {
        const { character_name } = request.body;

        if (!character_name) {
            return response.status(400).json({ error: 'Character name is required' });
        }

        const sourcePath = path.join(PUBLIC_CHARACTERS_DIR, `${character_name}.png`);
        const targetPath = path.join(request.user.directories.characters, `${character_name}.png`);

        if (!fs.existsSync(sourcePath)) {
            return response.status(404).json({ error: 'Character not found' });
        }

        // 复制角色卡文件
        fs.copyFileSync(sourcePath, targetPath);

        // 创建聊天目录
        const chatsPath = path.join(request.user.directories.chats, character_name);
        if (!fs.existsSync(chatsPath)) {
            fs.mkdirSync(chatsPath, { recursive: true });
        }

        console.info(`Character ${character_name} imported by user ${request.user.profile.handle}`);
        response.json({ success: true, file_name: character_name });
    } catch (err) {
        console.error('Error importing character:', err);
        response.status(500).json({ error: 'Failed to import character' });
    }
});

// 删除公用角色卡（管理员或上传者）
router.post('/delete', validateAvatarUrlMiddleware, async function (request, response) {
    try {
        const { character_name } = request.body;

        if (!character_name) {
            return response.status(400).json({ error: 'Character name is required' });
        }

        const characterPath = path.join(PUBLIC_CHARACTERS_DIR, `${character_name}.png`);

        if (!fs.existsSync(characterPath)) {
            return response.status(404).json({ error: 'Character not found' });
        }

        // 获取角色卡信息以检查上传者
        let characterInfo;
        try {
            characterInfo = await processCharacter(`${character_name}.png`);
        } catch (error) {
            console.error('Error reading character info:', error);
            return response.status(500).json({ error: 'Failed to read character info' });
        }

        const currentUser = request.user.profile.handle;
        const isAdmin = request.user.profile.admin;
        const isUploader = characterInfo.uploader_handle === currentUser;

        // 检查权限：只有管理员或上传者可以删除
        if (!isAdmin && !isUploader) {
            return response.status(403).json({
                error: 'Permission denied. Only admins or the character uploader can delete this character.'
            });
        }

        // 删除角色卡文件
        fs.unlinkSync(characterPath);

        const deletedBy = isAdmin ? 'admin' : 'uploader';
        console.info(`Public character ${character_name} deleted by ${deletedBy} ${currentUser}`);
        response.json({ success: true });
    } catch (err) {
        console.error('Error deleting character:', err);
        response.status(500).json({ error: 'Failed to delete character' });
    }
});

// 获取角色卡头像
router.get('/avatar/:filename', async function (request, response) {
    try {
        const filename = request.params.filename;

        if (!filename || !sanitize(filename)) {
            return response.status(400).json({ error: 'Invalid filename' });
        }

        const avatarPath = path.join(PUBLIC_CHARACTERS_DIR, filename);

        if (!fs.existsSync(avatarPath)) {
            return response.status(404).json({ error: 'Avatar not found' });
        }

        const mimeType = mime.lookup(filename) || 'image/png';
        response.setHeader('Content-Type', mimeType);
        response.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year cache

        const fileStream = fs.createReadStream(avatarPath);
        fileStream.pipe(response);
    } catch (err) {
        console.error('Error serving avatar:', err);
        response.status(500).json({ error: 'Failed to serve avatar' });
    }
});

// 获取角色卡详情
router.post('/get', async function (request, response) {
    try {
        const { character_name } = request.body;

        if (!character_name) {
            return response.status(400).json({ error: 'Character name is required' });
        }

        const characterPath = path.join(PUBLIC_CHARACTERS_DIR, `${character_name}.png`);

        if (!fs.existsSync(characterPath)) {
            return response.status(404).json({ error: 'Character not found' });
        }

        const character = await processCharacter(`${character_name}.png`);
        response.json(character);
    } catch (err) {
        console.error('Error getting character:', err);
        response.status(500).json({ error: 'Failed to get character' });
    }
});
