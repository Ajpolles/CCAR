const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:5000';

export const apiFetch = async (url, options = {}) => {
    const response = await fetch(
        url.startsWith('http') ? url : `${API_BASE}${url}`,
        options
    );

    if (response.status === 401 && new Headers(options.headers).has('authorization')) {
        window.dispatchEvent(new Event('ccars:unauthorized'));
    }

    return response;
};
