let csrfToken = '';

$(document).ready(function () {
    // 获取CSRF令牌
    fetch('/csrf-token')
        .then(response => response.json())
        .then(data => {
            csrfToken = data.token;
        })
        .catch(error => {
            console.error('Error fetching CSRF token:', error);
        });

    // 注册表单提交
    $('#registerForm').on('submit', function (e) {
        e.preventDefault();
        performRegistration();
    });

    // 返回登录按钮
    $('#backToLoginButton').on('click', function () {
        window.location.href = '/login';
    });

        // 密码确认验证
    $('#confirmPassword').on('input', function () {
        const password = $('#userPassword').val();
        const confirmPassword = $(this).val();

        if (password !== confirmPassword) {
            $(this).addClass('error');
        } else {
            $(this).removeClass('error');
        }
    });

    // 用户名格式验证
    $('#userHandle').on('input', function () {
        const handle = $(this).val();
        const isValid = /^[a-z0-9-]*$/.test(handle);

        if (handle && !isValid) {
            $(this).addClass('error');
        } else {
            $(this).removeClass('error');
        }
    });
});

/**
 * 执行用户注册
 */
async function performRegistration() {
    const displayName = $('#displayName').val().trim();
    const handle = $('#userHandle').val().trim();
    const password = $('#userPassword').val();
    const confirmPassword = $('#confirmPassword').val();

    // 清除之前的错误信息
    clearError();

    // 验证输入
    if (!displayName) {
        return displayError('请输入显示名称');
    }

    if (!handle) {
        return displayError('请输入用户名');
    }

    if (!/^[a-z0-9-]+$/.test(handle)) {
        return displayError('用户名只能包含小写字母、数字和连字符');
    }

    if (!password) {
        return displayError('请输入密码');
    }

    if (password.length < 6) {
        return displayError('密码长度至少为6位');
    }

    if (password !== confirmPassword) {
        return displayError('两次输入的密码不一致');
    }

    const userInfo = {
        name: displayName,
        handle: handle,
        password: password,
    };

    try {
        const response = await fetch('/api/users/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            body: JSON.stringify(userInfo),
        });

        if (!response.ok) {
            const errorData = await response.json();
            return displayError(errorData.error || '注册失败，请稍后重试');
        }

        const data = await response.json();
        console.log(`注册成功: ${handle}!`);

        // 显示成功消息并跳转到登录页面
        displaySuccess('注册成功！正在跳转到登录页面...');
        setTimeout(() => {
            window.location.href = '/login';
        }, 2000);
    } catch (error) {
        console.error('注册错误:', error);
        displayError('网络错误，请检查连接后重试');
    }
}

/**
 * 显示错误信息
 * @param {string} message 错误消息
 */
function displayError(message) {
    const errorElement = $('#errorMessage');
    errorElement.text(message).show();
    errorElement.removeClass('success').addClass('error');
}

/**
 * 显示成功信息
 * @param {string} message 成功消息
 */
function displaySuccess(message) {
    const errorElement = $('#errorMessage');
    errorElement.text(message).show();
    errorElement.removeClass('error').addClass('success');
}

/**
 * 清除错误信息
 */
function clearError() {
    $('#errorMessage').hide().removeClass('error success');
}
