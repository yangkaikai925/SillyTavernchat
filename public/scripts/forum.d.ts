// TypeScript 声明文件，用于解决 forum.js 的类型问题

// 扩展 Window 接口，添加论坛相关的全局变量和函数
declare global {
    interface Window {
        // 论坛全局变量
        forumIsLoggedIn: boolean;
        forumCurrentUser: any;
        forumCurrentArticle: any;

        // 论坛全局函数
        showLoading: () => void;
        hideLoading: () => void;
        showError: (message: string) => void;
        showSuccess: (message: string) => void;
        formatDate: (dateString: string) => string;
        getCategoryName: (categoryId: string) => string;
        loadArticles: () => Promise<void>;
        closeArticleModal: () => void;
        renderComments: (comments: any[]) => void;
        deleteArticle: (articleId: string) => Promise<void>;
        handleArticleSubmit: (event: Event) => Promise<void>;
        showArticleDetail: (article: any) => void;
    }

    // 扩展 HTMLElement 接口
    interface HTMLElement {
        value?: string;
        disabled?: boolean;
        reset?: () => void;
    }

    // 扩展 Element 接口
    interface Element {
        value?: string;
        focus?: () => void;
        click?: () => void;
        dataset?: DOMStringMap;
    }

    // 扩展 EventTarget 接口
    interface EventTarget {
        classList?: DOMTokenList;
        closest?: (selector: string) => Element | null;
        files?: FileList;
        value?: string;
    }

    // 扩展 Node 接口
    interface Node {
        closest?: (selector: string) => Element | null;
    }

    // 扩展 Event 接口
    interface Event {
        key?: string;
    }

    // FormDataEntryValue 类型扩展
    interface FormDataEntryValue {
        split?: (separator: string) => string[];
    }
}

export {};
