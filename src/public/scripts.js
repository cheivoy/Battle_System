function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `fixed top-4 right-4 p-4 rounded shadow-lg ${type === 'success' ? 'success' : 'error'}`;
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 5000); // 延長顯示時間以便閱讀錯誤訊息
}

function showLoading(show) {
    const loading = document.getElementById('loading');
    loading.classList.toggle('hidden', !show);
}